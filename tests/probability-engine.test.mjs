import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { calculateProbabilities } = require('../probability-engine.js');

function neighbors(index, height, width) {
    const row = Math.floor(index / width);
    const column = index % width;
    const result = [];

    for (let nextRow = Math.max(0, row - 1); nextRow <= Math.min(height - 1, row + 1); nextRow += 1) {
        for (let nextColumn = Math.max(0, column - 1); nextColumn <= Math.min(width - 1, column + 1); nextColumn += 1) {
            const nextIndex = nextRow * width + nextColumn;
            if (nextIndex !== index) {
                result.push(nextIndex);
            }
        }
    }

    return result;
}

function makePosition({ height, width, mines, opened, flags = [] }) {
    const mineSet = new Set(mines);
    const openSet = new Set(opened);
    const flagSet = new Set(flags);

    return Array.from({ length: height }, (_, row) =>
        Array.from({ length: width }, (_, column) => {
            const index = row * width + column;
            return {
                mine: mineSet.has(index),
                open: openSet.has(index),
                flag: flagSet.has(index),
                neighbors: mineSet.has(index)
                    ? -1
                    : neighbors(index, height, width).filter((neighbor) => mineSet.has(neighbor)).length,
            };
        }));
}

function bruteForceProbabilities(grid, totalMines) {
    const height = grid.length;
    const width = grid[0].length;
    const cells = grid.flat();
    const unknown = [];
    const flagged = [];

    for (let index = 0; index < cells.length; index += 1) {
        if (cells[index].flag) {
            flagged.push(index);
        } else if (!cells[index].open) {
            unknown.push(index);
        }
    }

    const requiredUnknownMines = totalMines - flagged.length;
    const mineTallies = new Map(unknown.map((index) => [index, 0]));
    let solutionCount = 0;

    for (let mask = 0; mask < 2 ** unknown.length; mask += 1) {
        const candidateMines = new Set(flagged);
        for (let bit = 0; bit < unknown.length; bit += 1) {
            if ((mask & (1 << bit)) !== 0) {
                candidateMines.add(unknown[bit]);
            }
        }

        if (candidateMines.size !== totalMines || candidateMines.size - flagged.length !== requiredUnknownMines) {
            continue;
        }

        const satisfiesClues = cells.every((cell, index) =>
            !cell.open
            || neighbors(index, height, width).filter((neighbor) => candidateMines.has(neighbor)).length === cell.neighbors);
        if (!satisfiesClues) {
            continue;
        }

        solutionCount += 1;
        for (const index of unknown) {
            if (candidateMines.has(index)) {
                mineTallies.set(index, mineTallies.get(index) + 1);
            }
        }
    }

    return {
        solutionCount,
        probability(index) {
            if (flagged.includes(index)) {
                return 1;
            }
            if (!mineTallies.has(index)) {
                return null;
            }
            return mineTallies.get(index) / solutionCount;
        },
    };
}

function assertMatchesBruteForce(position, totalMines) {
    const exact = calculateProbabilities(position, totalMines);
    const bruteForce = bruteForceProbabilities(position, totalMines);
    const width = position[0].length;

    assert.equal(exact.valid, true, exact.reason);
    assert.equal(exact.solutionCount, BigInt(bruteForce.solutionCount));

    for (let index = 0; index < position.flat().length; index += 1) {
        const row = Math.floor(index / width);
        const column = index % width;
        const expected = bruteForce.probability(index);
        const actual = exact.mineProbabilities[row][column];

        if (expected === null) {
            assert.equal(actual, null);
        } else {
            assert.ok(
                Math.abs(actual - expected) < 1e-9,
                `Expected cell ${row},${column} to be ${expected}, received ${actual}`,
            );
        }
    }
}

test('exact engine agrees with exhaustive enumeration on representative positions', () => {
    const positions = [
        {
            totalMines: 3,
            grid: makePosition({
                height: 3,
                width: 4,
                mines: [0, 4, 11],
                opened: [1, 2, 5, 6, 9],
            }),
        },
        {
            totalMines: 2,
            grid: makePosition({
                height: 3,
                width: 4,
                mines: [0, 11],
                opened: [1, 2, 5, 6],
                flags: [0],
            }),
        },
        {
            totalMines: 2,
            grid: makePosition({
                height: 2,
                width: 4,
                mines: [0, 7],
                opened: [],
            }),
        },
    ];

    for (const { grid, totalMines } of positions) {
        assertMatchesBruteForce(grid, totalMines);
    }
});

test('exact engine agrees with exhaustive enumeration across generated positions', () => {
    let state = 246813579;
    const random = () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };

    for (let iteration = 0; iteration < 25; iteration += 1) {
        const indexes = Array.from({ length: 12 }, (_, index) => index);
        indexes.sort(() => random() - 0.5);
        const totalMines = 2 + iteration % 3;
        const mines = indexes.slice(0, totalMines);
        const mineSet = new Set(mines);
        const safeIndexes = indexes.filter((index) => !mineSet.has(index));
        const opened = safeIndexes.filter(() => random() < 0.45).slice(0, 6);
        const flags = mines.filter(() => random() < 0.25);
        const grid = makePosition({
            height: 3,
            width: 4,
            mines,
            opened,
            flags,
        });

        assertMatchesBruteForce(grid, totalMines);
    }
});

test('conflicting flags produce an invalid result instead of misleading probabilities', () => {
    const grid = makePosition({
        height: 2,
        width: 2,
        mines: [0],
        opened: [1],
        flags: [2, 3],
    });

    const result = calculateProbabilities(grid, 1);
    assert.equal(result.valid, false);
    assert.match(result.reason, /flag|clue/i);
});
