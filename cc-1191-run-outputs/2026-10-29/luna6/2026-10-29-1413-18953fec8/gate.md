# Gate: openai/gpt-6-luna vs openai/gpt-5.6-luna

- Run: 2026-10-29 14:13 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $2.543 of the $40 cap

## C-005: error

- error: 1 call(s) cut off at the token limit

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 29 | 6 |
| Row recall | 0% (0%–0%) | 0% |
| Row precision | 0% | n/a |
| Value accuracy | 0% | n/a |
| Classification accuracy | n/a | n/a |
| Notation keys | 0/2 | 0/2 |
| Total vs key | +1805.6% out | -100.0% out |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 1 |
| Time per run | 134 s | 205 s |
| LLM calls per run | 33 | 30 |
| Tokens in / out per run | 248.8k / 25.2k | 203.0k / 29.2k |
| Reasoning tokens | n/a | 7.6k |
| Largest output of one call | n/a | 16.0k |
| Cost (LLM + OCR) | forecast $0.149 | $0.147 |
