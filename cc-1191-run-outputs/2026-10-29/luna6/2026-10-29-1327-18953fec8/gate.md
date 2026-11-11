# Gate: openai/gpt-6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 13:27 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $1.735 of the $40 cap

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
| Time per run | 62 s | 88 s |
| LLM calls per run | 24 | 24 |
| Tokens in / out per run | 157.6k / 17.7k | 159.7k / 20.3k |
| Reasoning tokens | n/a | 7.8k |
| Largest output of one call | n/a | 6.9k |
| Cost (LLM + OCR) | forecast $0.117 | $0.118 |
