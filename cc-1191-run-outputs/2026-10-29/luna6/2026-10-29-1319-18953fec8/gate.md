# Gate: openai/gpt-6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 13:19 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $0.767 of the $40 cap

## C-009: regression

- regression: recall 0% vs 6% before

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 2 | 2 |
| Row recall | 6% (0%–13%) | 0% |
| Row precision | 17% | 0% |
| Value accuracy | 17% | 0% |
| Classification accuracy | 100% | n/a |
| Notation keys | 0/5 | 0/5 |
| Total vs key | -51.0% out | -39.7% out |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 25 s | 36 s |
| LLM calls per run | 7 | 7 |
| Tokens in / out per run | 49.3k / 2.6k | 49.3k / 2.7k |
| Reasoning tokens | n/a | 2.2k |
| Largest output of one call | n/a | 1.9k |
| Cost (LLM + OCR) | forecast $0.042 | $0.042 |
