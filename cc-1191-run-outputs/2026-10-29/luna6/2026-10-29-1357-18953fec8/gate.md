# Gate: openai/gpt-6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 13:57 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $2.066 of the $40 cap

## C-018: regression

- regression: recall 67% vs 89% before

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 43 | 23 |
| Row recall | 89% (83%–92%) | 67% |
| Row precision | 89% | 100% |
| Value accuracy | 89% | 100% |
| Classification accuracy | 100% | 100% |
| Notation keys | 0/3 | 0/3 |
| Total vs key | +0.2% out | -7.6% out |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 104 s | 161 s |
| LLM calls per run | 14 | 15 |
| Tokens in / out per run | 95.6k / 28.3k | 100.1k / 33.7k |
| Reasoning tokens | n/a | 18.1k |
| Largest output of one call | n/a | 7.9k |
| Cost (LLM + OCR) | forecast $0.076 | $0.079 |
