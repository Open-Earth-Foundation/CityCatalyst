# Gate: openai/gpt-6.1-terra vs openai/gpt-5.6-luna

- Run: 2026-10-29 13:22 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $1.185 of the $40 cap

## C-008: ok

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 50 | 53 |
| Row recall | 100% (100%–100%) | 100% |
| Row precision | 100% | 100% |
| Value accuracy | 100% | 100% |
| Classification accuracy | 100% | 100% |
| Notation keys | 17/23 | 17/23 |
| Total vs key | +0.0% in | +0.0% in |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 90 s | 104 s |
| LLM calls per run | 38 | 38 |
| Tokens in / out per run | 243.8k / 21.0k | 243.8k / 12.0k |
| Reasoning tokens | n/a | 2.1k |
| Largest output of one call | n/a | 6.6k |
| Cost (LLM + OCR) | forecast $0.463 | $0.418 |
