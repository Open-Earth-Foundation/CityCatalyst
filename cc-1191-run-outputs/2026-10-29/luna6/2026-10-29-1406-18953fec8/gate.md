# Gate: openai/gpt-6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 14:06 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $2.267 of the $40 cap

## C-016: ok

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 41 | 46 |
| Row recall | 88% (63%–100%) | 100% |
| Row precision | 100% | 100% |
| Value accuracy | 100% | 100% |
| Classification accuracy | 100% | 100% |
| Notation keys | 2/9 | 4/9 |
| Total vs key | -9.2% out | -0.0% in |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 87 s | 95 s |
| LLM calls per run | 21 | 21 |
| Tokens in / out per run | 147.0k / 14.5k | 147.0k / 13.3k |
| Reasoning tokens | n/a | 4.6k |
| Largest output of one call | n/a | 8.3k |
| Cost (LLM + OCR) | forecast $0.108 | $0.107 |
