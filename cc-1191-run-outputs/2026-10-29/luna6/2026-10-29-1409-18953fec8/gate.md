# Gate: openai/gpt-6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 14:09 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $2.396 of the $40 cap

## C-017: ok

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 10 | 9 |
| Row recall | 9% (0%–27%) | 8% |
| Row precision | 19% | 25% |
| Value accuracy | 19% | 33% |
| Classification accuracy | 64% | 100% |
| Notation keys | 0/26 | 0/26 |
| Total vs key | +67740.6% out | +1.7% out |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 99 s | 111 s |
| LLM calls per run | 35 | 35 |
| Tokens in / out per run | 232.9k / 27.7k | 232.9k / 26.7k |
| Reasoning tokens | n/a | 13.6k |
| Largest output of one call | n/a | 3.6k |
| Cost (LLM + OCR) | forecast $0.129 | $0.129 |
