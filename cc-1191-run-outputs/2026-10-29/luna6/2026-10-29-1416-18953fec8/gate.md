# Gate: openai/gpt-6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 14:16 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $2.696 of the $40 cap

## C-015: regression

- regression: recall 10% vs 91% before

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 28 | 3 |
| Row recall | 91% (86%–93%) | 10% |
| Row precision | 96% | 100% |
| Value accuracy | 96% | 100% |
| Classification accuracy | 100% | 100% |
| Notation keys | 0/1 | 0/1 |
| Total vs key | -0.3% out | -100.4% out |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 107 s | 120 s |
| LLM calls per run | 36 | 37 |
| Tokens in / out per run | 238.9k / 23.4k | 245.9k / 24.7k |
| Reasoning tokens | n/a | 10.6k |
| Largest output of one call | n/a | 6.6k |
| Cost (LLM + OCR) | forecast $0.152 | $0.153 |
