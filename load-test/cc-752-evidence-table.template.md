# CC-752 load-test evidence

Fill the fixed-build column from the generated `evidence.json`, k6 summary,
and pod memory samples after an approved staging/prod-like run. Do not present
the incident observations as a controlled baseline: the Slack report provides
the failure symptoms, not a repeatable benchmark.

| Metric | v1.25.2 incident observation | Fixed build measured result | Acceptance signal | Evidence |
|---|---|---|---|---|
| HIAP cron HTTP 5xx | Intermittent `502` responses during cron execution | `TBD` | `hiap_cron_5xx = 0` | k6 summary |
| Request error rate | Not measured as a controlled rate | `TBD` | `< 1%` | k6 summary |
| p95 cron duration | Not available from incident | `TBD` | `< 2 s` | k6 summary |
| V8 heap failure | Both Web replicas reached the ~1 GB V8 heap limit | `TBD` | No fatal heap error | Web logs |
| Web pod restart delta | Both replicas repeatedly restarted | `TBD` | `0` during run | `pods-before.json` / `pods-after.json` |
| Web pod memory | Not available as a controlled time series | `TBD` | Stable; no upward runaway | `pod-memory-samples.txt` |
| Polling response contract | Backfill counters were present before the fix | `TBD` | No `catalogBackfilled` or `actionPlansBackfilled` fields | k6 checks |
| Backfill execution path | Ran inside the Web process | Isolated command/Job | No `cc-web` request from the backfill Job | Job manifest/logs |

## Card-ready conclusion

> On `[target]`, commit `[sha]` sustained `[duration]` at `[rate]` requests/s
> with `[requests]` requests, `[error rate]` errors, p95 latency of `[p95]`,
> `[restart delta]` Web pod restarts, and peak Web memory of `[peak memory]`.
> No V8 heap failure or 5xx response was observed. The result is `[pass/fail]`
> against the CC-752 acceptance signals above.
