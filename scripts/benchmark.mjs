import { performance } from 'node:perf_hooks';

import { loadGame } from '../tests/helpers/load-game.mjs';

const LEGACY_REPETITIONS = Number.parseInt(process.env.LEGACY_REPETITIONS ?? '5', 10);
const EXACT_REPETITIONS = Number.parseInt(process.env.EXACT_REPETITIONS ?? '7', 10);
const LEGACY_TIMEOUT_MS = Number.parseInt(process.env.LEGACY_TIMEOUT_MS ?? '750', 10);

const configurations = [
    { name: 'Beginner', rows: 9, columns: 9, mines: 10 },
    { name: 'Intermediate', rows: 16, columns: 16, mines: 40 },
    { name: 'Expert', rows: 16, columns: 30, mines: 99 },
];

const progressTargets = [0.18, 0.38, 0.58];

function createRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function adjacentCoordinates(row, column, rows, columns) {
    const result = [];
    for (let nextRow = Math.max(0, row - 1); nextRow <= Math.min(rows - 1, row + 1); nextRow += 1) {
        for (let nextColumn = Math.max(0, column - 1); nextColumn <= Math.min(columns - 1, column + 1); nextColumn += 1) {
            if (nextRow !== row || nextColumn !== column) {
                result.push([nextRow, nextColumn]);
            }
        }
    }
    return result;
}

function shuffle(values, random) {
    for (let index = values.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    return values;
}

function createFixture(configuration, targetProgress, seed) {
    const { rows, columns, mines, name } = configuration;
    const random = createRandom(seed);
    const firstRow = Math.floor(rows / 2);
    const firstColumn = Math.floor(columns / 2);
    const safeStart = new Set(
        [[firstRow, firstColumn], ...adjacentCoordinates(firstRow, firstColumn, rows, columns)]
            .map(([row, column]) => row * columns + column),
    );
    const candidates = shuffle(
        Array.from({ length: rows * columns }, (_, index) => index)
            .filter((index) => !safeStart.has(index)),
        random,
    );
    const mineIndexes = new Set(candidates.slice(0, mines));
    const grid = Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) => {
            const index = row * columns + column;
            const mine = mineIndexes.has(index);
            return {
                mine,
                open: false,
                neighbors: mine
                    ? -1
                    : adjacentCoordinates(row, column, rows, columns)
                        .filter(([nextRow, nextColumn]) => mineIndexes.has(nextRow * columns + nextColumn)).length,
                closedNeighbors: 0,
                flag: false,
                edge: false,
                edgeCount: 0,
                mineArr: 0,
                probability: -1,
            };
        }),
    );

    function reveal(startRow, startColumn) {
        const queue = [[startRow, startColumn]];
        while (queue.length > 0) {
            const [row, column] = queue.pop();
            const cell = grid[row][column];
            if (cell.open || cell.mine) {
                continue;
            }
            cell.open = true;
            if (cell.neighbors === 0) {
                for (const coordinate of adjacentCoordinates(row, column, rows, columns)) {
                    queue.push(coordinate);
                }
            }
        }
    }

    reveal(firstRow, firstColumn);
    const safeCells = shuffle(
        candidates.filter((index) => !mineIndexes.has(index)),
        random,
    );
    const targetOpened = Math.floor((rows * columns - mines) * targetProgress);
    for (const index of safeCells) {
        if (grid.flat().filter((cell) => cell.open).length >= targetOpened) {
            break;
        }
        reveal(Math.floor(index / columns), index % columns);
    }

    return {
        name: `${name}-${Math.round(targetProgress * 100)}%`,
        rows,
        columns,
        mines,
        grid,
    };
}

// A reachable, deliberately ambiguous position with a long connected witness
// chain. It has thousands of valid solutions, which exercises the legacy
// sampler's capped random branching without requiring a huge board.
function createConstraintStrip(columns) {
    const rows = 3;
    const mineIndexes = new Set();
    for (let column = 0; column < columns; column += 3) {
        mineIndexes.add(column);
    }
    for (let column = 1; column < columns; column += 3) {
        mineIndexes.add(2 * columns + column);
    }

    const grid = Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) => {
            const index = row * columns + column;
            const mine = mineIndexes.has(index);
            return {
                mine,
                open: row === 1,
                neighbors: mine
                    ? -1
                    : adjacentCoordinates(row, column, rows, columns)
                        .filter(([nextRow, nextColumn]) => mineIndexes.has(nextRow * columns + nextColumn)).length,
                closedNeighbors: 0,
                flag: false,
                edge: false,
                edgeCount: 0,
                mineArr: 0,
                probability: -1,
            };
        }),
    );

    return {
        name: `Ambiguous-strip-${columns}`,
        rows,
        columns,
        mines: mineIndexes.size,
        grid,
    };
}

// Several independent "4 mines among 8 neighbors" witnesses. The position is
// legal and cheap to solve exactly, while exposing the old rule-three mistake:
// it assigns each local frontier 50% without reserving those mines before it
// calculates the off-frontier probability.
function createIndependentWitnessFixture(groupCount) {
    const rows = 3;
    const columns = groupCount * 4 - 1;
    const witnessIndexes = new Set();
    const mineIndexes = new Set();

    for (let group = 0; group < groupCount; group += 1) {
        const centerColumn = group * 4 + 1;
        witnessIndexes.add(columns + centerColumn);
        mineIndexes.add(centerColumn - 1);
        mineIndexes.add(centerColumn);
        mineIndexes.add(2 * columns + centerColumn);
        mineIndexes.add(2 * columns + centerColumn + 1);
    }

    const grid = Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) => {
            const index = row * columns + column;
            const mine = mineIndexes.has(index);
            return {
                mine,
                open: witnessIndexes.has(index),
                neighbors: mine
                    ? -1
                    : adjacentCoordinates(row, column, rows, columns)
                        .filter(([nextRow, nextColumn]) => mineIndexes.has(nextRow * columns + nextColumn)).length,
                closedNeighbors: 0,
                flag: false,
                edge: false,
                edgeCount: 0,
                mineArr: 0,
                probability: -1,
            };
        }),
    );

    return {
        name: `Independent-witnesses-${groupCount}`,
        rows,
        columns,
        mines: mineIndexes.size,
        grid,
    };
}

// Pairs of overlapping clues avoid the legacy shortcut above and force its
// capped random arrangement branching. Each pair has 95 local solutions.
function createPairedWitnessFixture(groupCount) {
    const rows = 3;
    const columns = groupCount * 5 - 1;
    const witnessIndexes = new Set();
    const mineIndexes = new Set();

    for (let group = 0; group < groupCount; group += 1) {
        const base = group * 5;
        witnessIndexes.add(columns + base + 1);
        witnessIndexes.add(columns + base + 2);

        // One shared mine and two mines unique to each witness: both clues are 3.
        mineIndexes.add(base + 1);
        mineIndexes.add(base);
        mineIndexes.add(2 * columns + base);
        mineIndexes.add(base + 3);
        mineIndexes.add(2 * columns + base + 3);
    }

    const grid = Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) => {
            const index = row * columns + column;
            const mine = mineIndexes.has(index);
            return {
                mine,
                open: witnessIndexes.has(index),
                neighbors: mine
                    ? -1
                    : adjacentCoordinates(row, column, rows, columns)
                        .filter(([nextRow, nextColumn]) => mineIndexes.has(nextRow * columns + nextColumn)).length,
                closedNeighbors: 0,
                flag: false,
                edge: false,
                edgeCount: 0,
                mineArr: 0,
                probability: -1,
            };
        }),
    );

    return {
        name: `Paired-witnesses-${groupCount}`,
        rows,
        columns,
        mines: mineIndexes.size,
        grid,
    };
}

function percentile(sortedValues, percentage) {
    if (sortedValues.length === 0) {
        return null;
    }
    const index = Math.min(
        sortedValues.length - 1,
        Math.max(0, Math.ceil(percentage * sortedValues.length) - 1),
    );
    return sortedValues[index];
}

function summarize(values) {
    const sorted = [...values].sort((left, right) => left - right);
    const total = sorted.reduce((sum, value) => sum + value, 0);
    return {
        mean: sorted.length === 0 ? null : total / sorted.length,
        p50: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
        max: sorted.at(-1) ?? null,
    };
}

function standardDeviation(values) {
    if (values.length === 0) {
        return 0;
    }
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

function setFixture(game, fixture) {
    const serializedGrid = JSON.stringify(fixture.grid);
    game.evaluate(`
        numRows = ${fixture.rows};
        numColumns = ${fixture.columns};
        numMines = ${fixture.mines};
        mineGrid = ${serializedGrid};
    `);
}

function getProbabilities(game) {
    return game.evaluateJson('mineGrid.flat().map(cell => cell.probability)');
}

function runExact(game, fixture) {
    setFixture(game, fixture);
    const start = performance.now();
    game.evaluate('generateProbability(true)');
    return {
        milliseconds: performance.now() - start,
        probabilities: getProbabilities(game),
    };
}

function runLegacy(game, fixture, seed) {
    setFixture(game, fixture);
    game.evaluate(`
        Math.random = (() => {
            let state = ${seed} >>> 0;
            return () => {
                state = Math.imul(state, 1664525) + 1013904223 >>> 0;
                return state / 4294967296;
            };
        })();
    `);

    const start = performance.now();
    const timeoutMs = fixture.name === 'Paired-witnesses-2'
        ? Math.max(LEGACY_TIMEOUT_MS, 1500)
        : LEGACY_TIMEOUT_MS;
    try {
        game.evaluate(`
        (() => {
        hundredCount = 0;
        arrGrid = [];
        edgeArr = [];
        for (let row = 0; row < mineGrid.length; row++) {
            for (let column = 0; column < mineGrid[row].length; column++) {
                mineGrid[row][column].mineArr = 0;
                mineGrid[row][column].probability = -1;
                mineGrid[row][column].edge = false;
            }
        }
        edgeCount(mineGrid);
        let changedMines = true;
        let changedSafe = true;
        while (changedMines || changedSafe) {
            changedMines = ruleOne(mineGrid);
            changedSafe = ruleTwo(mineGrid);
        }
        ruleThree(mineGrid);
        let next = findNextEdge(mineGrid, 0, 0);
        while (next[0] > -1) {
            arrGrid.push({ mine: null, r: next[0], c: next[1], index: arrGrid.length });
            next = next[1] === numColumns - 1
                ? findNextEdge(mineGrid, next[0] + 1, 0)
                : findNextEdge(mineGrid, next[0], next[1] + 1);
        }
        if (arrGrid.length > 0) {
            iterativeGenerateArrangements(mineGrid, arrGrid);
            probabilityCalculation(edgeArr, mineGrid, true);
        } else {
            const offFrontierCount = nonEdgeCount(mineGrid);
            const remainingMines = numMines - hundredCount;
            for (let row = 0; row < mineGrid.length; row++) {
                for (let column = 0; column < mineGrid[row].length; column++) {
                    if (!mineGrid[row][column].open && !mineGrid[row][column].edge) {
                        mineGrid[row][column].probability = Math.round(remainingMines / offFrontierCount * 100);
                    }
                }
            }
        }
        })();
    `, { timeoutMs });
    } catch (error) {
        if (error?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
            return {
                milliseconds: performance.now() - start,
                probabilities: null,
                timedOut: true,
            };
        }
        throw error;
    }
    return {
        milliseconds: performance.now() - start,
        probabilities: getProbabilities(game),
        timedOut: false,
    };
}

function formatNumber(value, digits = 2) {
    return value === null ? 'n/a' : value.toFixed(digits);
}

const defaultFixtures = [
    ...configurations.flatMap((configuration, configurationIndex) =>
        progressTargets.map((target, targetIndex) =>
            createFixture(configuration, target, 1000 + configurationIndex * 100 + targetIndex))),
    createIndependentWitnessFixture(3),
    createIndependentWitnessFixture(4),
    createPairedWitnessFixture(2),
];
const diagnosticFixtures = [
    createPairedWitnessFixture(3),
    createConstraintStrip(16),
];
const allFixtures = [...defaultFixtures, ...diagnosticFixtures];
const fixtureFilter = process.env.BENCHMARK_FILTER;
const fixtures = fixtureFilter
    ? allFixtures.filter((fixture) => fixture.name.toLowerCase().includes(fixtureFilter.toLowerCase()))
    : defaultFixtures;

if (fixtures.length === 0) {
    throw new Error(`No benchmark fixtures matched BENCHMARK_FILTER=${fixtureFilter}`);
}
const exactTimes = [];
const legacyTimes = [];
const absoluteErrors = [];
const runVariances = [];
let comparedPredictions = 0;
let missingPredictions = 0;
let falseCertainties = 0;
let errorsOverSeven = 0;
let errorsOverFifteen = 0;
let legacyTimeouts = 0;

for (const fixture of fixtures) {
    process.stderr.write(`Benchmarking ${fixture.name}...\n`);
    const game = loadGame();

    runExact(game, fixture);
    let exactResult;
    for (let repetition = 0; repetition < EXACT_REPETITIONS; repetition += 1) {
        exactResult = runExact(game, fixture);
        exactTimes.push(exactResult.milliseconds);
    }

    const legacyResults = [];
    for (let repetition = 0; repetition < LEGACY_REPETITIONS; repetition += 1) {
        const result = runLegacy(game, fixture, 5000 + repetition * 97);
        legacyTimes.push(result.milliseconds);
        if (result.timedOut) {
            legacyTimeouts += 1;
            missingPredictions += exactResult.probabilities.filter((probability) => probability >= 0).length;
            continue;
        }
        legacyResults.push(result.probabilities);

        for (let index = 0; index < result.probabilities.length; index += 1) {
            const exact = exactResult.probabilities[index];
            const legacy = result.probabilities[index];
            if (exact < 0) {
                continue;
            }
            if (!Number.isFinite(legacy) || legacy < 0) {
                missingPredictions += 1;
                continue;
            }

            const error = Math.abs(legacy - exact);
            absoluteErrors.push(error);
            comparedPredictions += 1;
            if (error > 7) errorsOverSeven += 1;
            if (error > 15) errorsOverFifteen += 1;
            if ((legacy === 0 && exact > 0.000001) || (legacy === 100 && exact < 99.999999)) {
                falseCertainties += 1;
            }
        }
    }

    for (let index = 0; index < exactResult.probabilities.length; index += 1) {
        const estimates = legacyResults
            .map((result) => result[index])
            .filter((probability) => Number.isFinite(probability) && probability >= 0);
        if (estimates.length > 1) {
            runVariances.push(standardDeviation(estimates));
        }
    }
}

const exactTiming = summarize(exactTimes);
const legacyTiming = summarize(legacyTimes);
const errorSummary = summarize(absoluteErrors);
const varianceSummary = summarize(runVariances);
const speedup = legacyTiming.mean / exactTiming.mean;

console.log('Minesweeper probability-engine benchmark');
console.log(`Runtime: ${process.version} ${process.platform}/${process.arch}`);
console.log(`Fixtures: ${fixtures.length} reachable positions across standard boards and targeted constraint patterns`);
console.log(`Measured runs: exact=${exactTimes.length}, legacy=${legacyTimes.length}`);
console.log(`Legacy timeout: ${LEGACY_TIMEOUT_MS}ms per standard calculation; timed out ${legacyTimeouts}/${legacyTimes.length} runs`);
console.log('');
console.log('CPU time per probability calculation (milliseconds)');
console.log('Engine        mean      p50      p95      max');
console.log(`Exact      ${formatNumber(exactTiming.mean).padStart(7)}  ${formatNumber(exactTiming.p50).padStart(7)}  ${formatNumber(exactTiming.p95).padStart(7)}  ${formatNumber(exactTiming.max).padStart(7)}`);
console.log(`Legacy     ${formatNumber(legacyTiming.mean).padStart(7)}  ${formatNumber(legacyTiming.p50).padStart(7)}  ${formatNumber(legacyTiming.p95).padStart(7)}  ${formatNumber(legacyTiming.max).padStart(7)}`);
console.log(`Capped mean speedup: ${formatNumber(speedup)}x${legacyTimeouts > 0 ? ' (lower bound because legacy timeouts are capped)' : ''}`);
console.log('');
console.log('Legacy probability error versus exact engine (percentage points)');
console.log(`Compared predictions: ${comparedPredictions.toLocaleString()}`);
console.log(`Missing/invalid predictions: ${missingPredictions.toLocaleString()}`);
console.log(`Mean absolute error: ${formatNumber(errorSummary.mean)}`);
console.log(`p50 / p90 / p95 / p99 / max: ${formatNumber(errorSummary.p50)} / ${formatNumber(errorSummary.p90)} / ${formatNumber(errorSummary.p95)} / ${formatNumber(errorSummary.p99)} / ${formatNumber(errorSummary.max)}`);
console.log(`Errors >7 points: ${comparedPredictions === 0 ? 'n/a' : `${formatNumber(errorsOverSeven / comparedPredictions * 100)}%`}`);
console.log(`Errors >15 points: ${comparedPredictions === 0 ? 'n/a' : `${formatNumber(errorsOverFifteen / comparedPredictions * 100)}%`}`);
console.log(`False 0%/100% claims: ${falseCertainties.toLocaleString()}`);
console.log('');
console.log('Legacy run-to-run standard deviation per cell (percentage points)');
console.log(`Mean / p95 / max: ${formatNumber(varianceSummary.mean)} / ${formatNumber(varianceSummary.p95)} / ${formatNumber(varianceSummary.max)}`);
console.log('Exact engine run-to-run variance: 0.00 (deterministic)');
