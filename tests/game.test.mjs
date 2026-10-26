import assert from 'node:assert/strict';
import test from 'node:test';

import { loadGame } from './helpers/load-game.mjs';

test('generateGrid creates the requested board and initial cell state', () => {
    const game = loadGame();
    game.document.getElementById('numRows').value = '3';
    game.document.getElementById('numColumns').value = '4';
    game.document.getElementById('numMines').value = '2';

    game.evaluate('generateGrid()');

    const board = game.evaluateJson('mineGrid');
    assert.equal(board.length, 3);
    assert.equal(board[0].length, 4);
    assert.deepEqual(board[0][0], {
        mine: false,
        open: false,
        neighbors: 0,
        flag: false,
        edge: false,
        edgeCount: 0,
        mineArr: 0,
        probability: -1,
    });
    assert.equal(game.evaluate('unflaggedMines'), 2);
});

test('generateGrid rejects invalid dimensions without creating a board', () => {
    const game = loadGame();
    game.document.getElementById('numRows').value = '0';
    game.document.getElementById('numColumns').value = '4';
    game.document.getElementById('numMines').value = '2';

    assert.equal(game.evaluate('generateGrid()'), false);
    assert.deepEqual(game.alerts, ['Rows, columns, and number of mines must be at least 1']);
    assert.deepEqual(game.evaluateJson('mineGrid'), []);
});

test('placeMine creates the exact mine count outside the first-click safe area', () => {
    const game = loadGame();
    game.evaluate(`
        numRows = 5;
        numColumns = 5;
        mineGrid = Array.from({ length: numRows }, () =>
            Array.from({ length: numColumns }, () => ({ mine: false }))
        );
        let seed = 123456;
        Math.random = () => {
            seed = (seed * 16807) % 2147483647;
            return (seed - 1) / 2147483646;
        };
        placeMine(mineGrid, numRows, numColumns, 5, 2, 2);
    `);

    const board = game.evaluateJson('mineGrid');
    const mineCount = board.flat().filter((cell) => cell.mine).length;
    assert.equal(mineCount, 5);

    for (let row = 1; row <= 3; row += 1) {
        for (let column = 1; column <= 3; column += 1) {
            assert.equal(board[row][column].mine, false);
        }
    }
});

test('neighborCount assigns correct clues for corners, edges, and center cells', () => {
    const game = loadGame();
    game.evaluate(`
        numRows = 3;
        numColumns = 3;
        mineGrid = Array.from({ length: numRows }, () =>
            Array.from({ length: numColumns }, () => ({
                mine: false,
                open: false,
                edge: false
            }))
        );
        mineGrid[0][0].mine = true;
        mineGrid[2][2].mine = true;
        neighborCount(mineGrid);
    `);

    assert.deepEqual(game.evaluateJson('mineGrid.map(row => row.map(cell => cell.neighbors))'), [
        [-1, 1, 0],
        [1, 2, 1],
        [0, 1, -1],
    ]);
});

test('exact solver identifies forced mines and forced-safe cells', () => {
    const mineRuleGame = loadGame();
    mineRuleGame.evaluate(`
        numRows = 1;
        numColumns = 2;
        numMines = 1;
        mineGrid = [[
            { open: true, mine: false, flag: false, neighbors: 1, probability: -1, edge: false, edgeCount: 0 },
            { open: false, mine: false, flag: false, neighbors: 0, probability: -1, edge: false, edgeCount: 0 }
        ]];
        generateProbability(true);
    `);
    assert.equal(mineRuleGame.evaluate('mineGrid[0][1].probability'), 100);

    const safeRuleGame = loadGame();
    safeRuleGame.evaluate(`
        numRows = 1;
        numColumns = 2;
        numMines = 0;
        mineGrid = [[
            { open: true, mine: false, flag: false, neighbors: 0, probability: -1, edge: false, edgeCount: 0 },
            { open: false, mine: false, flag: false, neighbors: 0, probability: -1, edge: false, edgeCount: 0 }
        ]];
        generateProbability(true);
    `);
    assert.equal(safeRuleGame.evaluate('mineGrid[0][1].probability'), 0);
});

test('a board with no visible frontier receives the global mine probability', () => {
    const game = loadGame();
    game.document.getElementById('numRows').value = '2';
    game.document.getElementById('numColumns').value = '2';
    game.document.getElementById('numMines').value = '1';

    game.evaluate('generateGrid(); generateProbability(true)');

    assert.deepEqual(game.evaluateJson('mineGrid.map(row => row.map(cell => cell.probability))'), [
        [25, 25],
        [25, 25],
    ]);
});

test('the exact engine weights frontier and off-frontier arrangements', () => {
    const game = loadGame();
    game.evaluate(`
        numRows = 2;
        numColumns = 3;
        numMines = 2;
        mineGrid = [
            [
                { open: true, mine: false, neighbors: 1, flag: false, edge: false, probability: -1 },
                { open: false, mine: false, neighbors: 0, flag: false, edge: false, probability: -1 },
                { open: false, mine: false, neighbors: 0, flag: false, edge: false, probability: -1 }
            ],
            [
                { open: false, mine: false, neighbors: 0, flag: false, edge: false, probability: -1 },
                { open: false, mine: false, neighbors: 0, flag: false, edge: false, probability: -1 },
                { open: false, mine: false, neighbors: 0, flag: false, edge: false, probability: -1 }
            ]
        ];
        generateProbability(true);
    `);

    const probabilities = game.evaluateJson('mineGrid.map(row => row.map(cell => cell.probability))');
    assert.equal(probabilities[0][0], -1);
    assert.ok(Math.abs(probabilities[0][1] - 100 / 3) < 0.000001);
    assert.ok(Math.abs(probabilities[1][0] - 100 / 3) < 0.000001);
    assert.ok(Math.abs(probabilities[1][1] - 100 / 3) < 0.000001);
    assert.equal(probabilities[0][2], 50);
    assert.equal(probabilities[1][2], 50);
});

test('probability results are deterministic across repeated calculations', () => {
    const game = loadGame();
    game.evaluate(`
        numRows = 2;
        numColumns = 3;
        numMines = 2;
        mineGrid = [
            [
                { open: true, mine: false, neighbors: 1, flag: false, edge: false, probability: -1 },
                { open: false, mine: false, neighbors: 0, flag: false, edge: false, probability: -1 },
                { open: false, mine: false, neighbors: 0, flag: false, edge: false, probability: -1 }
            ],
            [
                { open: false, mine: false, neighbors: 0, flag: false, edge: false, probability: -1 },
                { open: false, mine: false, neighbors: 0, flag: false, edge: false, probability: -1 },
                { open: false, mine: false, neighbors: 0, flag: false, edge: false, probability: -1 }
            ]
        ];
        generateProbability(true);
        firstResult = mineGrid.map(row => row.map(cell => cell.probability));
        generateProbability(true);
        secondResult = mineGrid.map(row => row.map(cell => cell.probability));
    `);

    assert.deepEqual(game.evaluateJson('firstResult'), game.evaluateJson('secondResult'));
});

test('off-frontier labels appear only beyond seven percentage points from initial density', () => {
    const game = loadGame();
    game.evaluate('numRows = 10; numColumns = 10; numMines = 20; showNonEdge.checked = false');

    assert.equal(game.evaluate('shouldShowProbability({ probability: 27, edge: false })'), false);
    assert.equal(game.evaluate('shouldShowProbability({ probability: 27.01, edge: false })'), true);
    assert.equal(game.evaluate('shouldShowProbability({ probability: 12.99, edge: false })'), true);
    assert.equal(game.evaluate('shouldShowProbability({ probability: 20, edge: true })'), true);

    game.evaluate('numMines = 5');
    assert.equal(game.evaluate('shouldShowProbability({ probability: 0, edge: false })'), true);
});

test('probability formatting distinguishes true zero from a rounded positive value', () => {
    const game = loadGame();

    assert.equal(game.evaluate('formatProbability(0)'), '0');
    assert.equal(game.evaluate('formatProbability(0.49)'), '<1');
    assert.equal(game.evaluate('formatProbability(0.5)'), '1');
    assert.equal(game.evaluate('formatProbability(12.6)'), '13');
});

test('exactly one lowest-risk guess is selected after safe moves are excluded', () => {
    const game = loadGame();
    const best = game.evaluateJson(`findLowestProbabilityCell([
        [
            { open: false, flag: false, probability: 15 },
            { open: false, flag: false, probability: 12.5 },
            { open: false, flag: false, probability: 12.5 }
        ],
        [
            { open: true, flag: false, probability: 4 },
            { open: false, flag: true, probability: 3 },
            { open: false, flag: false, probability: 25 }
        ]
    ])`);

    assert.deepEqual(best, { row: 0, column: 1, probability: 12.5 });
});

test('a true zero suppresses the purple best-guess recommendation', () => {
    const game = loadGame();
    assert.equal(game.evaluate(`findLowestProbabilityCell([[
        { open: false, flag: false, probability: 0 },
        { open: false, flag: false, probability: 12 }
    ]])`), null);
});

test('lowest-risk selection returns no guess when only safe cells or mines remain', () => {
    const game = loadGame();
    assert.equal(game.evaluate(`findLowestProbabilityCell([[
        { open: false, flag: false, probability: 0 },
        { open: false, flag: false, probability: 100 }
    ]])`), null);
});

test('rendering highlights only the single lowest-risk guess in purple', () => {
    const game = loadGame();
    game.evaluate(`
        numRows = 1;
        numColumns = 3;
        numMines = 1;
        mineGrid = [[
            { open: false, flag: false, mine: false, neighbors: 0, edge: true, probability: 10 },
            { open: false, flag: false, mine: false, neighbors: 0, edge: true, probability: 10 },
            { open: false, flag: false, mine: false, neighbors: 0, edge: true, probability: 20 }
        ]];
        makeTable(mineGrid, table, true);
    `);

    const cells = game.evaluateJson('table.children[0].children.map(cell => ({ text: cell.textContent, style: cell.style }))');
    assert.equal(cells.filter((cell) => cell.style.backgroundColor === '#6f42c1').length, 1);
    assert.equal(cells[0].text, '10');
    assert.equal(cells[0].style.color, 'white');
    assert.notEqual(cells[1].style.backgroundColor, '#6f42c1');
});

test('clicking a numbered cell preserves active probability colors', () => {
    const game = loadGame();
    game.evaluate(`
        numRows = 4;
        numColumns = 4;
        numMines = 1;
        unflaggedMines = 0;
        isWin = false;
        mineGrid = Array.from({ length: numRows }, () =>
            Array.from({ length: numColumns }, () => ({
                mine: false,
                open: false,
                neighbors: 0,
                closedNeighbors: 0,
                flag: false,
                edge: false,
                edgeCount: 0,
                mineArr: 0,
                probability: -1
            }))
        );
        mineGrid[0][1].mine = true;
        mineGrid[0][1].flag = true;
        neighborCount(mineGrid);
        mineGrid[0][0].open = true;

        renderActivityFlags = [];
        originalMakeTable = makeTable;
        makeTable = function(grid, targetTable, gameIsActive) {
            renderActivityFlags.push(gameIsActive);
            return originalMakeTable(grid, targetTable, gameIsActive);
        };

        revealFlagged.call({ id: '0_0' });
    `);

    assert.equal(game.evaluate('renderActivityFlags[0]'), true);
    assert.equal(game.evaluate('isWin'), false);
});

test('the autoplay selector returns exactly one deterministic safe move', () => {
    const game = loadGame();
    const move = game.evaluateJson(`findNextSafeCell([
        [
            { edge: true, probability: 0, closedNeighbors: 4 },
            { edge: true, probability: 0, closedNeighbors: 2 }
        ],
        [
            { edge: true, probability: 0, closedNeighbors: 3 },
            { edge: true, probability: 25, closedNeighbors: 1 }
        ]
    ])`);

    assert.deepEqual(move, { row: 0, column: 1 });
});
