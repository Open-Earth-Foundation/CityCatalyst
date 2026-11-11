# Gate: openai/gpt-6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 13:10 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $0.044 of the $40 cap

## C-014: ok

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 50 | 53 |
| Row recall | 95% (95%–95%) | 95% |
| Row precision | 95% | 95% |
| Value accuracy | 95% | 95% |
| Classification accuracy | 100% | 100% |
| Notation keys | 26/32 | 25/32 |
| Total vs key | +0.0% in | +0.0% in |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 48 s | 68 s |
| LLM calls per run | 1 | 1 |
| Tokens in / out per run | 8.3k / 7.9k | 8.3k / 8.6k |
| Reasoning tokens | n/a | 1.4k |
| Largest output of one call | n/a | 8.6k |
| Cost (LLM + OCR) | forecast $0.007 | $0.007 |
