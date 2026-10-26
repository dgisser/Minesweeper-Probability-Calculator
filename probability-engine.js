/*
 * Exact Minesweeper probability engine.
 *
 * The witness-box model and combinatorial weighting are adapted from
 * David N. Hill's JSMinesweeper probability engine (MIT License):
 * https://github.com/DavidNHill/JSMinesweeper
 *
 * This smaller adapter works directly with this project's existing grid.
 */
(function exposeProbabilityEngine(root, factory) {
    const engine = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = engine;
    }

    root.MinesweeperProbabilityEngine = engine;
}(typeof globalThis === 'object' ? globalThis : this, function createProbabilityEngine() {
    'use strict';

    function choose(total, selected) {
        if (selected < 0 || selected > total || total < 0) {
            return 0n;
        }

        const smallerSelection = Math.min(selected, total - selected);
        let result = 1n;

        for (let index = 1; index <= smallerSelection; index += 1) {
            result = result * BigInt(total - smallerSelection + index) / BigInt(index);
        }

        return result;
    }

    function ratio(numerator, denominator, decimalPlaces = 10) {
        if (denominator === 0n) {
            return 0;
        }

        const scale = 10n ** BigInt(decimalPlaces);
        return Number(numerator * scale / denominator) / Number(scale);
    }

    function adjacentIndexes(row, column, height, width) {
        const indexes = [];

        for (let adjacentRow = Math.max(0, row - 1); adjacentRow <= Math.min(height - 1, row + 1); adjacentRow += 1) {
            for (let adjacentColumn = Math.max(0, column - 1); adjacentColumn <= Math.min(width - 1, column + 1); adjacentColumn += 1) {
                if (adjacentRow !== row || adjacentColumn !== column) {
                    indexes.push(adjacentRow * width + adjacentColumn);
                }
            }
        }

        return indexes;
    }

    function convolve(left, right) {
        const result = new Map();

        for (const [leftMines, leftWays] of left) {
            for (const [rightMines, rightWays] of right) {
                const mines = leftMines + rightMines;
                result.set(mines, (result.get(mines) ?? 0n) + leftWays * rightWays);
            }
        }

        return result;
    }

    function invalidResult(reason, height, width) {
        return {
            valid: false,
            reason,
            solutionCount: 0n,
            mineProbabilities: Array.from({ length: height }, () => Array(width).fill(null)),
            frontier: new Set(),
            offFrontierMineProbability: null,
        };
    }

    function buildModel(grid, totalMines) {
        const height = grid.length;
        const width = grid[0]?.length ?? 0;
        const cells = grid.flat();
        const unknownIndexes = [];
        let flaggedCount = 0;

        for (let index = 0; index < cells.length; index += 1) {
            const cell = cells[index];
            if (cell.flag) {
                flaggedCount += 1;
            } else if (!cell.open) {
                unknownIndexes.push(index);
            }
        }

        const minesLeft = totalMines - flaggedCount;
        if (minesLeft < 0 || minesLeft > unknownIndexes.length) {
            return { error: 'The flag count is incompatible with the number of remaining mines.' };
        }

        const constraints = [];
        const constraintByCells = new Map();

        for (let row = 0; row < height; row += 1) {
            for (let column = 0; column < width; column += 1) {
                const cell = grid[row][column];
                if (!cell.open || cell.mine || cell.neighbors < 0) {
                    continue;
                }

                const adjacent = adjacentIndexes(row, column, height, width);
                const unknown = adjacent.filter((index) => !cells[index].open && !cells[index].flag);
                const adjacentFlags = adjacent.filter((index) => cells[index].flag).length;
                const required = cell.neighbors - adjacentFlags;

                if (required < 0 || required > unknown.length) {
                    return { error: `The clue at ${row},${column} conflicts with the current flags.` };
                }

                if (unknown.length === 0) {
                    if (required !== 0) {
                        return { error: `The clue at ${row},${column} cannot be satisfied.` };
                    }
                    continue;
                }

                unknown.sort((left, right) => left - right);
                const signature = unknown.join(',');
                const duplicate = constraintByCells.get(signature);

                if (duplicate !== undefined) {
                    if (constraints[duplicate].required !== required) {
                        return { error: 'Equivalent visible clues require different mine counts.' };
                    }
                    continue;
                }

                constraintByCells.set(signature, constraints.length);
                constraints.push({ unknown, required, boxes: [] });
            }
        }

        const memberships = new Map();
        for (let constraintIndex = 0; constraintIndex < constraints.length; constraintIndex += 1) {
            for (const cellIndex of constraints[constraintIndex].unknown) {
                if (!memberships.has(cellIndex)) {
                    memberships.set(cellIndex, []);
                }
                memberships.get(cellIndex).push(constraintIndex);
            }
        }

        const boxes = [];
        const boxByMembership = new Map();
        for (const [cellIndex, memberConstraints] of memberships) {
            const signature = memberConstraints.join(',');
            let boxIndex = boxByMembership.get(signature);

            if (boxIndex === undefined) {
                boxIndex = boxes.length;
                boxByMembership.set(signature, boxIndex);
                boxes.push({ cells: [], constraints: memberConstraints, size: 0 });
            }

            boxes[boxIndex].cells.push(cellIndex);
            boxes[boxIndex].size += 1;
        }

        for (let boxIndex = 0; boxIndex < boxes.length; boxIndex += 1) {
            for (const constraintIndex of boxes[boxIndex].constraints) {
                constraints[constraintIndex].boxes.push(boxIndex);
            }
        }

        const frontier = new Set(memberships.keys());
        const offFrontier = unknownIndexes.filter((index) => !frontier.has(index));

        return {
            boxes,
            cells,
            constraints,
            frontier,
            height,
            minesLeft,
            offFrontier,
            unknownIndexes,
            width,
        };
    }

    function buildComponents(boxes, constraints) {
        const components = [];
        const visitedBoxes = new Set();

        for (let start = 0; start < boxes.length; start += 1) {
            if (visitedBoxes.has(start)) {
                continue;
            }

            const componentBoxes = new Set();
            const componentConstraints = new Set();
            const queue = [start];
            visitedBoxes.add(start);

            while (queue.length > 0) {
                const boxIndex = queue.pop();
                componentBoxes.add(boxIndex);

                for (const constraintIndex of boxes[boxIndex].constraints) {
                    if (componentConstraints.has(constraintIndex)) {
                        continue;
                    }

                    componentConstraints.add(constraintIndex);
                    for (const relatedBox of constraints[constraintIndex].boxes) {
                        if (!visitedBoxes.has(relatedBox)) {
                            visitedBoxes.add(relatedBox);
                            queue.push(relatedBox);
                        }
                    }
                }
            }

            components.push({
                boxes: [...componentBoxes],
                constraints: [...componentConstraints],
            });
        }

        return components;
    }

    function enumerateComponent(component, boxes, constraints, mineLimit) {
        const boxOrder = [...component.boxes].sort((left, right) => {
            const constraintDifference = boxes[right].constraints.length - boxes[left].constraints.length;
            return constraintDifference || boxes[right].size - boxes[left].size;
        });
        const assignedByConstraint = new Map();
        const capacityByConstraint = new Map();
        const allocation = new Map();
        const waysByMines = new Map();
        const mineWaysByBox = new Map(component.boxes.map((boxIndex) => [boxIndex, new Map()]));

        for (const constraintIndex of component.constraints) {
            assignedByConstraint.set(constraintIndex, 0);
            capacityByConstraint.set(
                constraintIndex,
                constraints[constraintIndex].boxes.reduce((total, boxIndex) => total + boxes[boxIndex].size, 0),
            );
        }

        function record(minesUsed, ways) {
            waysByMines.set(minesUsed, (waysByMines.get(minesUsed) ?? 0n) + ways);

            for (const boxIndex of component.boxes) {
                const minesInBox = allocation.get(boxIndex) ?? 0;
                if (minesInBox === 0) {
                    continue;
                }

                const perCellMineWays = ways * BigInt(minesInBox) / BigInt(boxes[boxIndex].size);
                const tally = mineWaysByBox.get(boxIndex);
                tally.set(minesUsed, (tally.get(minesUsed) ?? 0n) + perCellMineWays);
            }
        }

        function search(position, minesUsed, ways) {
            if (minesUsed > mineLimit) {
                return;
            }

            if (position === boxOrder.length) {
                for (const constraintIndex of component.constraints) {
                    if (assignedByConstraint.get(constraintIndex) !== constraints[constraintIndex].required) {
                        return;
                    }
                }
                record(minesUsed, ways);
                return;
            }

            const boxIndex = boxOrder[position];
            const box = boxes[boxIndex];
            let minimum = 0;
            let maximum = Math.min(box.size, mineLimit - minesUsed);

            for (const constraintIndex of box.constraints) {
                const constraint = constraints[constraintIndex];
                const alreadyAssigned = assignedByConstraint.get(constraintIndex);
                const otherCapacity = capacityByConstraint.get(constraintIndex) - box.size;
                const stillRequired = constraint.required - alreadyAssigned;
                minimum = Math.max(minimum, stillRequired - otherCapacity);
                maximum = Math.min(maximum, stillRequired);
            }

            for (let minesInBox = minimum; minesInBox <= maximum; minesInBox += 1) {
                allocation.set(boxIndex, minesInBox);

                for (const constraintIndex of box.constraints) {
                    assignedByConstraint.set(
                        constraintIndex,
                        assignedByConstraint.get(constraintIndex) + minesInBox,
                    );
                    capacityByConstraint.set(
                        constraintIndex,
                        capacityByConstraint.get(constraintIndex) - box.size,
                    );
                }

                search(
                    position + 1,
                    minesUsed + minesInBox,
                    ways * choose(box.size, minesInBox),
                );

                for (const constraintIndex of box.constraints) {
                    assignedByConstraint.set(
                        constraintIndex,
                        assignedByConstraint.get(constraintIndex) - minesInBox,
                    );
                    capacityByConstraint.set(
                        constraintIndex,
                        capacityByConstraint.get(constraintIndex) + box.size,
                    );
                }
            }

            allocation.delete(boxIndex);
        }

        search(0, 0, 1n);
        return { waysByMines, mineWaysByBox };
    }

    function calculateProbabilities(grid, totalMines) {
        const height = grid.length;
        const width = grid[0]?.length ?? 0;

        if (height === 0 || width === 0 || grid.some((row) => row.length !== width)) {
            return invalidResult('The board must be a non-empty rectangle.', height, width);
        }

        const model = buildModel(grid, totalMines);
        if (model.error) {
            return invalidResult(model.error, height, width);
        }

        const components = buildComponents(model.boxes, model.constraints);
        const analyses = components.map((component) =>
            enumerateComponent(component, model.boxes, model.constraints, model.minesLeft));

        if (analyses.some((analysis) => analysis.waysByMines.size === 0)) {
            return invalidResult('The visible clues have no valid mine arrangement.', height, width);
        }

        const allComponentWays = analyses.reduce(
            (combined, analysis) => convolve(combined, analysis.waysByMines),
            new Map([[0, 1n]]),
        );
        const offFrontierCount = model.offFrontier.length;
        let solutionCount = 0n;

        for (const [frontierMines, frontierWays] of allComponentWays) {
            solutionCount += frontierWays * choose(offFrontierCount, model.minesLeft - frontierMines);
        }

        if (solutionCount === 0n) {
            return invalidResult('The visible clues conflict with the total mine count.', height, width);
        }

        const mineTallies = new Map();
        for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
            let otherComponentWays = new Map([[0, 1n]]);
            for (let otherIndex = 0; otherIndex < analyses.length; otherIndex += 1) {
                if (otherIndex !== componentIndex) {
                    otherComponentWays = convolve(otherComponentWays, analyses[otherIndex].waysByMines);
                }
            }

            for (const boxIndex of components[componentIndex].boxes) {
                let tally = 0n;
                for (const [componentMines, perCellMineWays] of analyses[componentIndex].mineWaysByBox.get(boxIndex)) {
                    for (const [otherMines, otherWays] of otherComponentWays) {
                        const minesOffFrontier = model.minesLeft - componentMines - otherMines;
                        tally += perCellMineWays * otherWays * choose(offFrontierCount, minesOffFrontier);
                    }
                }

                for (const cellIndex of model.boxes[boxIndex].cells) {
                    mineTallies.set(cellIndex, tally);
                }
            }
        }

        let offFrontierMineTally = 0n;
        if (offFrontierCount > 0) {
            for (const [frontierMines, frontierWays] of allComponentWays) {
                const minesOffFrontier = model.minesLeft - frontierMines;
                offFrontierMineTally += frontierWays * choose(offFrontierCount - 1, minesOffFrontier - 1);
            }

            for (const cellIndex of model.offFrontier) {
                mineTallies.set(cellIndex, offFrontierMineTally);
            }
        }

        const mineProbabilities = Array.from({ length: height }, () => Array(width).fill(null));
        for (const cellIndex of model.unknownIndexes) {
            const row = Math.floor(cellIndex / width);
            const column = cellIndex % width;
            mineProbabilities[row][column] = ratio(mineTallies.get(cellIndex) ?? 0n, solutionCount);
        }

        for (let index = 0; index < model.cells.length; index += 1) {
            if (model.cells[index].flag) {
                mineProbabilities[Math.floor(index / width)][index % width] = 1;
            }
        }

        return {
            valid: true,
            reason: null,
            solutionCount,
            mineProbabilities,
            frontier: model.frontier,
            offFrontierMineProbability: offFrontierCount > 0
                ? ratio(offFrontierMineTally, solutionCount)
                : null,
        };
    }

    return Object.freeze({ calculateProbabilities });
}));
