# Gate: openai/gpt-6.1-terra vs openai/gpt-5.6-luna

- Run: 2026-10-29 13:12 UTC, commit `18953fec8`, 1 run(s) per case
- Before: `6206ca8b7+8cc1457ef`, 3 runs per case (means; recall range in brackets)
- Spend so far: $0.195 of the $40 cap

## C-010: ok

| Measure | Before | After |
| --- | --- | --- |
| Rows extracted | 12 | 12 |
| Row recall | 100% (100%–100%) | 100% |
| Row precision | 100% | 100% |
| Value accuracy | 100% | 100% |
| Classification accuracy | 100% | 100% |
| Notation keys | 0/0 | 0/0 |
| Total vs key | +0.0% in | +0.0% in |
| Failed pages | n/a | 0 |
| Calls cut at limit | n/a | 0 |
| Time per run | 23 s | 30 s |
| LLM calls per run | 11 | 11 |
| Tokens in / out per run | 70.7k / 3.4k | 70.7k / 2.1k |
| Reasoning tokens | n/a | 0.5k |
| Largest output of one call | n/a | 1.8k |
| Cost (LLM + OCR) | forecast $0.158 | $0.151 |
