# Repository instructions

## Purpose

This repository is a dependency-free browser implementation of Minesweeper with an exact probability solver. Preserve its ability to run as a static GitHub Pages site without a compilation or bundling step.

Read `docs/ARCHITECTURE.md` before changing game or solver behavior. It documents the state model, control flow, probability algorithm, and current design constraints.

## Commands

- Start the local static server: `npm start`
- Run regression tests: `npm test`
- Run every automated check: `npm run check`
- Compare the exact and legacy engines: `npm run benchmark`

The test harness evaluates the classic browser script in an isolated DOM stub. Add a characterization test before changing behavior that is not already covered.

## Important invariants

- A cell is represented by the shape documented in `docs/ARCHITECTURE.md`.
- `probability === -1` means that the solver has not assigned a probability.
- Stored probabilities are numbers from 0 through 100; the current UI rounds them to whole percentages for display.
- The probability engine is deterministic and counts all valid witness-box mine distributions using BigInt arithmetic.
- Autoplay reveals exactly one selected safe frontier tile per cycle, then recomputes. Do not batch all safe moves.
- True 0% cells are always displayed. Other off-frontier probabilities are displayed only when they differ by more than 7 percentage points from the board's initial mine density.
- Exact-safe tiles render as `0`. Positive probabilities below 0.5% render as `<1`, never a misleading `0`.
- Only when no true 0% move exists, exactly one lowest-probability guess is highlighted purple with white text. Stable row-major order breaks equal-probability ties.
- The first click places mines and keeps the clicked cell and its neighboring cells safe.
- A generated board contains exactly the requested number of mines.
- An open non-mine cell's `neighbors` value equals the number of adjacent mines.
- `edge` means a closed cell adjacent to at least one open cell; it does not mean a physical board edge.
- The app must continue to work when `index.html` is opened through a static HTTP server with no installed runtime dependencies.

## Change guidance

- Prefer small pure helpers over adding more global state.
- Pass board data into solver helpers instead of reading the DOM.
- Keep rendering and user-event code separate from probability calculations when adding new code.
- Preserve the first-click safety rule, left-click reveal, right-click flag, number-cell chord behavior, timer, and difficulty presets unless the task explicitly changes them.
- Keep `probability-engine.js` independent of the DOM and UI state beyond the grid object passed to it.
- Preserve the attribution in `probability-engine.js` and `THIRD_PARTY_NOTICES.md` when changing or moving the engine.
- The old randomized solver helpers remain at the bottom of `index.js` temporarily for comparison but are not on the active execution path. Do not extend them; migrate or delete them when touching that area.
- Avoid broad formatting-only edits to `index.js`; they make behavioral changes difficult to review.
- Update `README.md` and `docs/ARCHITECTURE.md` whenever commands, files, state fields, or major control flow change.

## Definition of done

1. The requested behavior is covered by a test when it can be exercised without a real browser.
2. `npm run check` passes.
3. Browser-facing changes are manually checked with `npm start` at both a small preset and Expert size.
4. The working tree contains no generated logs, editor files, or dependency directories.
