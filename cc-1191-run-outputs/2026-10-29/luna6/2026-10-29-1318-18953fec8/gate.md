# Gate: openai/gpt-6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 13:18 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $0.639 of the $40 cap

## C-004: ok

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 20 | 20 |
| Row recall | 38% (0%–60%) | 50% |
| Row precision | 46% | 63% |
| Value accuracy | 48% | 77% |
| Classification accuracy | 89% | 71% |
| Notation keys | 0/0 | 0/0 |
| Total vs key | +33332.6% out | -0.1% out |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 97 s | 140 s |
| LLM calls per run | 22 | 22 |
| Tokens in / out per run | 143.5k / 23.7k | 143.5k / 27.9k |
| Reasoning tokens | n/a | 13.3k |
| Largest output of one call | n/a | 5.5k |
| Cost (LLM + OCR) | forecast $0.086 | $0.088 |
