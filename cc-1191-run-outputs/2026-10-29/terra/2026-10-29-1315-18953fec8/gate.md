# Gate: openai/gpt-6.1-terra vs openai/gpt-5.6-luna

- Run: 2026-10-29 13:15 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $0.550 of the $40 cap

## C-004: ok

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 20 | 21 |
| Row recall | 38% (0%–60%) | 55% |
| Row precision | 46% | 69% |
| Value accuracy | 48% | 73% |
| Classification accuracy | 89% | 92% |
| Notation keys | 0/0 | 0/0 |
| Total vs key | +33332.6% out | -0.2% out |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 97 s | 106 s |
| LLM calls per run | 22 | 22 |
| Tokens in / out per run | 143.5k / 23.7k | 143.5k / 14.5k |
| Reasoning tokens | n/a | 3.6k |
| Largest output of one call | n/a | 4.6k |
| Cost (LLM + OCR) | forecast $0.322 | $0.276 |
