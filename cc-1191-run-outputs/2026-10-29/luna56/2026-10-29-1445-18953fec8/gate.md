# Gate: openai/gpt-5.6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 14:45 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $2.905 of the $40 cap

## C-004: regression

- regression: recall 5% vs 38% before

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 20 | 33 |
| Row recall | 38% (0%–60%) | 5% |
| Row precision | 46% | 6% |
| Value accuracy | 48% | 8% |
| Classification accuracy | 89% | 33% |
| Notation keys | 0/0 | 0/0 |
| Total vs key | +33332.6% out | +94748.5% out |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 97 s | 131 s |
| LLM calls per run | 22 | 22 |
| Tokens in / out per run | 143.5k / 23.7k | 143.5k / 27.4k |
| Reasoning tokens | n/a | 11.3k |
| Largest output of one call | n/a | 4.9k |
| Cost (LLM + OCR) | forecast $0.117 | $0.122 |
