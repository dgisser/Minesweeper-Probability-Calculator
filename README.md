# Minesweeper Probability Calculator

A dependency-free Minesweeper game that visualizes exact mine probabilities. After every move, the solver groups equivalent frontier cells, counts every valid mine distribution with BigInt arithmetic, and automatically opens safe cells one at a time.

Play the published version at <https://dgisser.github.io/Minesweeper-Probability-Calculator/>.

## Run locally

The application is static HTML, CSS, and JavaScript. Node.js 20 or newer is only needed for the local development commands.

```sh
npm start
```

Then open <http://localhost:8000>. You can also serve the repository with any static file server.

## Verify changes

```sh
npm test
npm run check
npm run benchmark
```

`npm test` runs the dependency-free characterization tests. `npm run check` also performs JavaScript syntax checks. `npm run benchmark` compares the active exact engine with the inactive legacy solver on reproducible positions.

## Repository map

- `index.html` — page structure and difficulty controls.
- `index.css` — board and control styling.
- `index.js` — game state, rendering, interaction, and deliberately paced autoplay.
- `probability-engine.js` — exact probability calculation adapted from JSMinesweeper's witness-box design.
- `mine.png`, `flag.png`, `flagMode.png` — 25×25 board assets.
- `tests/` — Node-based regression tests for important game and solver behavior.
- `docs/ARCHITECTURE.md` — detailed control flow, state model, solver behavior, and known constraints.
- `docs/BENCHMARK.md` — benchmark methodology, current results, and interpretation.
- `AGENTS.md` — working conventions and completion checklist for coding agents.
- `THIRD_PARTY_NOTICES.md` — attribution and license for the probability-engine design.

There is intentionally no build step. GitHub Pages serves the repository files directly.
