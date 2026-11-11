# Gate: openai/gpt-5.6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 14:47 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $2.955 of the $40 cap

## C-009: ok

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 2 | 3 |
| Row recall | 6% (0%–13%) | 13% |
| Row precision | 17% | 33% |
| Value accuracy | 17% | 33% |
| Classification accuracy | 100% | 100% |
| Notation keys | 0/5 | 0/5 |
| Total vs key | -51.0% out | -33.3% out |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 25 s | 39 s |
| LLM calls per run | 7 | 7 |
| Tokens in / out per run | 49.3k / 2.6k | 49.3k / 3.4k |
| Reasoning tokens | n/a | 2.5k |
| Largest output of one call | n/a | 2.0k |
| Cost (LLM + OCR) | forecast $0.049 | $0.050 |
