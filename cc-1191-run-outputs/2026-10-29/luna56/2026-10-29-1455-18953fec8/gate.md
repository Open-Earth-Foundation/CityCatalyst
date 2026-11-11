# Gate: openai/gpt-5.6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 14:55 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $3.485 of the $40 cap

## C-015: ok

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 28 | 29 |
| Row recall | 91% (86%–93%) | 93% |
| Row precision | 96% | 96% |
| Value accuracy | 96% | 96% |
| Classification accuracy | 100% | 100% |
| Notation keys | 0/1 | 0/1 |
| Total vs key | -0.3% out | -0.4% out |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 107 s | 121 s |
| LLM calls per run | 36 | 37 |
| Tokens in / out per run | 238.9k / 23.4k | 245.9k / 26.5k |
| Reasoning tokens | n/a | 11.4k |
| Largest output of one call | n/a | 5.0k |
| Cost (LLM + OCR) | forecast $0.192 | $0.197 |
