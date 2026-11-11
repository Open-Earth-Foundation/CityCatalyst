# Gate: openai/gpt-6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 13:51 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $1.873 of the $40 cap

## C-007b: ok

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 16 | 16 |
| Row recall | 100% (100%–100%) | 100% |
| Row precision | 100% | 100% |
| Value accuracy | 100% | 100% |
| Classification accuracy | 100% | 100% |
| Notation keys | 0/1 | 0/1 |
| Total vs key | -0.0% in | -0.0% in |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 42 s | 56 s |
| LLM calls per run | 10 | 10 |
| Tokens in / out per run | 64.7k / 11.3k | 64.7k / 11.4k |
| Reasoning tokens | n/a | 3.8k |
| Largest output of one call | n/a | 3.1k |
| Cost (LLM + OCR) | forecast $0.046 | $0.046 |
