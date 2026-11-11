# Gate: openai/gpt-5.6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 14:52 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $3.288 of the $40 cap

## C-013: ok

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 39 | 39 |
| Row recall | 89% (89%–89%) | 89% |
| Row precision | 100% | 100% |
| Value accuracy | 100% | 100% |
| Classification accuracy | 100% | 100% |
| Notation keys | 18/24 | 18/24 |
| Total vs key | -5.2% out | -5.2% out |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 62 s | 94 s |
| LLM calls per run | 24 | 24 |
| Tokens in / out per run | 157.6k / 17.7k | 159.7k / 18.3k |
| Reasoning tokens | n/a | 5.5k |
| Largest output of one call | n/a | 6.1k |
| Cost (LLM + OCR) | forecast $0.145 | $0.146 |
