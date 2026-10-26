# Probability engine benchmark

## Reproduce

```sh
npm run benchmark
```

The harness in `scripts/benchmark.mjs` creates deterministic, reachable positions across Beginner, Intermediate, and Expert boards plus targeted constraint patterns. Both engines receive identical grid state. Timing covers the complete probability-calculation adapter, excluding fixture creation and script loading.

The exact engine is run seven times per position. The legacy engine is run five times with different deterministic random seeds. Standard legacy runs are capped at 750 ms so pathological searches cannot make the command hang; consequently, its reported mean CPU time and speedup are conservative lower bounds.

Accuracy is measured as absolute error in percentage points against the exact engine. Independent tests also compare the exact engine against naive exhaustive cell-by-cell enumeration on small boards.

## Results

Measured on Node.js 26.12.0, macOS arm64, across 12 positions and 144 timed calculations:

| CPU time per calculation | Exact engine | Legacy engine |
| --- | ---: | ---: |
| Mean | 28.11 ms | 426.24 ms, capped |
| Median | 0.50 ms | 510.60 ms |
| 95th percentile | 307.98 ms | 751.23 ms, capped |
| Maximum | 319.06 ms | 882.91 ms |

The capped mean speedup was **15.16×**. Because 24 of 60 legacy runs exceeded their time limit, the uncapped improvement is larger.

Legacy accuracy across the 1,766 predictions it completed:

| Absolute probability error | Percentage points |
| --- | ---: |
| Mean | 8.26 |
| Median | 0.11 |
| 90th percentile | 0.54 |
| 95th percentile | 6.54 |
| 99th percentile | 200.00 |
| Maximum | 200.00 |

- 4.98% of completed legacy predictions missed by more than 7 percentage points.
- 4.25% missed by more than 15 percentage points.
- Some legacy bookkeeping produced impossible probabilities as high as 200%, accounting for the extreme tail.
- 6,454 additional predictions were unavailable because their legacy calculation timed out.

For cells evaluated repeatedly on the same position, legacy run-to-run standard deviation averaged 0.25 percentage points, reached 2.71 at the 95th percentile, and peaked at 6.76. The exact engine's run-to-run variance is zero.

## Interpretation

The legacy solver is often close on easy cells, explaining its low median error, but its distribution has a severe tail and it can fail to finish on constrained positions. The witness-box engine removes both Monte Carlo variance and the legacy off-frontier bookkeeping error. Its counts are deterministic BigInts; only the final conversion to a displayed decimal uses floating-point arithmetic.

Benchmark values depend on hardware and JavaScript runtime. Treat the checked-in numbers as a baseline and rerun the command after material solver changes.
