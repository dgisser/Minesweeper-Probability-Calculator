# Architecture

## Overview

The application is a static browser page with no framework, package dependency, bundler, backend service, or persistence layer. `index.html` loads `index.css`, the exact solver in `probability-engine.js`, and then the classic UI script `index.js`. The page calls `generateGrid()` once after the scripts load.

All runtime state currently lives in top-level variables in `index.js`. Rendering recreates the entire HTML table from that state after important actions.

## Runtime flow

### Starting a game

`generateGrid()` reads and validates the form values, resets the timer and solver state, creates the two-dimensional `mineGrid`, and calls `makeTable()`.

Mines are not placed at this point. Delaying placement makes it possible to guarantee a safe first click.

### Revealing a cell

`revealCell()` translates a table-cell ID such as `3_7` into a row and column and delegates to `revealCellContents()`.

On the first reveal, `placeMine()` places all mines outside the 3×3 area centered on the click. `neighborCount()` then calculates clue values and the timer starts.

The selected cell is opened. A zero-value cell recursively opens its surrounding area through `revealNeighbors()`. A mine ends the game; otherwise probabilities are regenerated and the table is rendered again.

After rendering, `findNextSafeCell()` selects one frontier cell with a 0% mine probability and reveals it after a short delay. The board is recomputed before another cell is selected. This intentionally calm, one-area-at-a-time pacing is a product requirement; safe moves must not be batch-played.

### Flagging and chording

Right-clicking a closed cell toggles its flag. Pressing Space while hovering over a cell offers the same action. The flag-mode checkbox remains in the DOM for legacy/touch behavior but is currently hidden.

Clicking an open numbered cell performs the equivalent of a Minesweeper chord: neighboring cells are revealed when the surrounding flags match. The present implementation validates flags against the hidden mine layout rather than using only the visible clue and flag count.

## Cell state

Each entry in `mineGrid[row][column]` has these fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `mine` | boolean | Whether the generated board contains a mine here. |
| `open` | boolean | Whether the player can see the cell. |
| `neighbors` | number | Adjacent mine count, or `-1` for a mine. |
| `closedNeighbors` | number | Closed, non-frontier neighbors from the latest clue-count pass. Added after initialization. |
| `flag` | boolean | Whether the player flagged the cell. |
| `edge` | boolean | Whether this closed cell borders an open cell. |
| `edgeCount` | number | Number of closed neighbors around an open cell. |
| `mineArr` | number | Weighted arrangements in which this cell is a mine. |
| `probability` | number | Exact mine percentage represented as a JavaScript number, or `-1` when unknown. |

The term *edge* means the solver frontier, not the outer edge of the board.

## Solver pipeline

`generateProbability()` is a thin UI adapter around `MinesweeperProbabilityEngine.calculateProbabilities()`:

1. `edgeCount()` marks the visible frontier for rendering and move selection.
2. Every open numbered cell becomes a *witness constraint*: its adjacent unknown cells must contain the clue's remaining mine count after flags.
3. Frontier cells adjacent to exactly the same witnesses are grouped into *boxes*. This is the central design adapted from David N. Hill's JSMinesweeper engine.
4. The engine enumerates valid mine counts per box, pruning counts that cannot satisfy a witness. `C(box size, mines in box)` supplies the number of concrete placements represented by each box allocation.
5. Independent witness components are combined, then weighted by `C(off-frontier cells, remaining mines)`. All counts use BigInt, avoiding floating-point overflow and Monte Carlo variance.
6. Per-cell mine tallies divided by the total solution count produce exact probabilities. Flags are treated as known mines, matching JSMinesweeper's analyser semantics.

The engine is deterministic. It counts box-level allocations exhaustively rather than sampling random cell assignments. `tests/probability-engine.test.mjs` compares its output with naive exhaustive enumeration on small boards.

The inactive randomized solver functions still present below `edgeCount()` in `index.js` are legacy code. They are retained temporarily to keep this backend replacement reviewable, but nothing on the active game path calls them.

## Rendering

`makeTable()` creates one `<td>` per cell and attaches event listeners during creation. Frontier cells use an HSL green-to-red background based on probability. Exact-safe closed cells always display `0`. Other off-frontier cells show their probability when it differs by strictly more than 7 percentage points from `mines / total cells`, the board's initial mine density. Positive probabilities below 0.5% display as `<1`, so they never masquerade as true zeroes.

Only when no true 0% move exists, `findLowestProbabilityCell()` selects exactly one closed, unflagged cell with the lowest non-zero probability. It is rendered purple with bold white probability text as the recommended player guess. Equal probabilities use stable row-major order as the tie-break. CSS classes display number colors and the 25×25 flag/mine images.

The function also counts opened cells. Opening `rows × columns − mines` cells marks the game as won and stops the timer.

## Automated tests

The production script is intentionally still a classic browser script. `tests/helpers/load-game.mjs` loads it with `node:vm` and supplies a minimal DOM implementation. This lets tests characterize existing game and solver functions without introducing a production dependency or a build step.

When the application is eventually modularized, migrate pure board and solver functions out of the VM harness first. Keep browser-level tests focused on rendering and interaction.

## Known design constraints

- Most state is global and game, solver, and rendering responsibilities share one file.
- Eight-direction neighbor traversal is duplicated in several functions.
- Some loop variables are implicitly global because the script runs in non-strict mode.
- Incorrect user flags make the visible position inconsistent because the probability engine treats flags as known mines. The engine reports the inconsistency and does not display misleading probabilities.
- Very dense small boards can request more mines than fit outside the first-click safe area.
- Legacy randomized solver helpers remain in `index.js` but are no longer called.
- There is no browser automation suite; the Node tests cover logic-level regressions only.

These are recorded facts about the current implementation, not behavior that new code should copy. Favor incremental extraction into pure modules with tests over a single large rewrite.
