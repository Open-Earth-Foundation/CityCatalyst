# Next steps

The 81-attempt study is complete. These are proposed development steps, not
changes already applied to its frozen prompts or held-out results. Keep the
current snapshot for comparison and create a new experiment folder for new runs.

| Order | Change | How to verify it |
| --- | --- | --- |
| 1 | Make the requested period explicit: calendar/financial year and start/end dates. Define whether the target is source gross, source net, or a GPC-normalized total. | Development examples with several year columns select the stated period. A matching integer year label alone cannot pass. Source totals and normalized row sums have separate checks. |
| 2 | Support source aggregates across several GPC subsectors or scopes without splitting an amount. Preserve component reference sets, scope basis and source evidence. | Compatible aggregate keys match, exact scoped keys reject unknown assignments, and no value is duplicated or allocated without source support. |
| 3 | Improve the repair policy. Separate repairable contract/consistency errors from confirmed source ambiguity. Stop when another turn has no useful new source check; require evidence for changes to valid facts. | Use development trajectories to compare flag-only, one repair and up to three repairs. Report row F1, total passes, regressions, flags, turns, time and usage. Never choose an output using answer keys in the live loop. |
| 4 | Improve debugging and evidence retention. Cache structured OCR responses locally, export useful boxes, and provide a durable public trace bundle. | An investigator can inspect the exact OCR context, source page, candidate change and feedback without rerunning paid OCR or relying on a hosted workspace. |
| 5 | Package the private reproduction inputs/artifacts with checksums and clear access instructions. Preserve the public table and methods in Git. | A second person can reproduce the offline table from saved outputs and keys, and distinguish missing inputs from a successful check. Keep credentials and licensed/private files outside Git. |
| 6 | Freeze a new version after development checks. Repeat the paired Round 2 study if the input contract or extraction policy changes. Evaluate generalization on newly untouched reports. | Pin original bytes, prompts, schema, model, repair budget and scorer before paid work. Count all attempts, including failures. Use only development/Round 2 results to select settings; do not tune to the current held-out answers and call them unseen. |

For current use, Mistral and automatic repair remain optional and off by
default. The study did not show a general row-F1 benefit from either added
Mistral context or extra repair turns, although repair improved row-total checks.
Do not increase model effort or repair count before measuring whether the
contract and stopping-rule changes address the observed errors.

See [known issues](KNOWN_ISSUES.md) for concrete triggers and current workarounds,
and [benchmark setup](benchmarks/README.md) for the frozen-run commands.
