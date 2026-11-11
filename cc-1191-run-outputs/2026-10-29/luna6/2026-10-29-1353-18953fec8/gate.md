# Gate: openai/gpt-6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 13:53 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $1.919 of the $40 cap

## C-007s: ok

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 19 | 16 |
| Row recall | 90% (69%–100%) | 100% |
| Row precision | 89% | 100% |
| Value accuracy | 90% | 100% |
| Classification accuracy | 100% | 100% |
| Notation keys | 0/1 | 0/1 |
| Total vs key | +0.7% out | +0.0% in |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 51 s | 55 s |
| LLM calls per run | 10 | 10 |
| Tokens in / out per run | 68.7k / 12.4k | 64.7k / 11.0k |
| Reasoning tokens | n/a | 3.5k |
| Largest output of one call | n/a | 3.4k |
| Cost (LLM + OCR) | forecast $0.047 | $0.046 |
