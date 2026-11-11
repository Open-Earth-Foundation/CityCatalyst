# Gate: openai/gpt-6.1-terra vs openai/gpt-5.6-luna

- Run: 2026-10-29 13:18 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $0.725 of the $40 cap

## C-009: error

- error: run 1 failed: import not completed

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 2 | n/a |
| Row recall | 6% (0%–13%) | n/a |
| Row precision | 17% | n/a |
| Value accuracy | 17% | n/a |
| Classification accuracy | 100% | n/a |
| Notation keys | 0/5 | 0/0 |
| Total vs key | -51.0% out | n/a |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 25 s | 9 s |
| LLM calls per run | 7 | 7 |
| Tokens in / out per run | 49.3k / 2.6k | 49.3k / 0.3k |
| Reasoning tokens | n/a | 0.2k |
| Largest output of one call | n/a | 0.1k |
| Cost (LLM + OCR) | forecast $0.098 | $0.087 |
