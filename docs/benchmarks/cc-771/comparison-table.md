# CC-771 — Final OCR benchmark comparison

Updated 2026-09-03. This final table records the controlled synthetic benchmark and the two real City of San Diego Climate Action Plan reports. It includes every run attempt, including failed attempts that were later superseded by a retry. Mistral costs are estimates based on the standard per-page rate; OpenRouter costs are the actual values returned by the API.

## Executive summary

| Model / provider | Synthetic fixture | CAP 2025 | CAP 2023 | Overall assessment |
| --- | --- | --- | --- | --- |
| Mistral `mistral-ocr-latest` direct | 0/5 visual facts | Good text/tables; charts stayed as image references; US$0.132 est. | Good text/tables; chart stayed as an image reference; US$0.080 est. | Current baseline confirmed; insufficient chart semantics |
| Anthropic `claude-opus-5` via OpenRouter | 5/5 | Good visual extraction; US$0.970075 | Good visual extraction; US$0.605250 | Highest visual quality, but expensive and slow |
| Google `gemini-3.1-pro-preview` via OpenRouter | 5/5 | Transport/parser failures on initial attempts; no usable result | Base64 recovered the chart but contained a factual trend error | Conditional only |
| Anthropic `claude-sonnet-4.5` via OpenRouter | 5/5 | Provider aborted with HTTP 504 after 362.348s | Good extraction with lower trend precision; US$0.205692 | Conditional on long-document reliability |
| OpenAI `gpt-5.2` via OpenRouter | 4/5 | Good visual extraction; US$0.26265925 | Good visual extraction; US$0.1301755 | Best quality/cost balance in this battery |
| Google `gemini-2.5-pro` via OpenRouter | 4/5 | HTTP 200 with null content; US$0.1680325 | Good visual extraction; US$0.094460 | Conditional until long-document reliability improves |

## Run registry: mode, cost, time, and status

| Run | Document | Model / provider | Input mode | Cost | Time | Status | Evidence |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `2026-09-03-mistral-ocr-direct` | Synthetic, 3 pages | Mistral OCR direct | Files API + signed URL | US$0.012 est. | 1.954s | Baseline | [run.json](cc-771-runs/2026-09-03-mistral-ocr-direct/run.json) |
| `2026-09-03-openrouter-claude-opus-5` | Synthetic, 3 pages | Claude Opus 5 / OpenRouter | Native PDF input | US$0.093260 | 27.041s | Strong candidate | [run.json](cc-771-runs/2026-09-03-openrouter-claude-opus-5/run.json) |
| `2026-09-03-openrouter-gemini-3-1-pro-preview` | Synthetic, 3 pages | Gemini 3.1 Pro / OpenRouter | Native PDF input | US$0.051632 | 29.319s | Strong candidate | [run.json](cc-771-runs/2026-09-03-openrouter-gemini-3-1-pro-preview/run.json) |
| `2026-09-03-synthetic-sonnet-claude-sonnet-4-5` | Synthetic, 3 pages | Claude Sonnet 4.5 / OpenRouter | Native PDF via signed URL | US$0.036624 | 25.702s | Strong candidate | [run.json](cc-771-runs/2026-09-03-synthetic-sonnet-claude-sonnet-4-5/run.json) |
| `2026-09-03-synthetic-gpt52-gpt-5-2` | Synthetic, 3 pages | GPT-5.2 / OpenRouter | Native PDF via signed URL | US$0.02507925 | 24.366s | Partial | [run.json](cc-771-runs/2026-09-03-synthetic-gpt52-gpt-5-2/run.json) |
| `2026-09-03-synthetic-gemini25-gemini-2-5-pro` | Synthetic, 3 pages | Gemini 2.5 Pro / OpenRouter | Native PDF via Base64 | US$0.0377975 | 32.850s | Partial | [run.json](cc-771-runs/2026-09-03-synthetic-gemini25-gemini-2-5-pro/run.json) |
| `2026-09-03-san-diego-2025-mistral-direct` | CAP 2025, 33 pages | Mistral OCR direct | Files API + signed URL | US$0.132 est. | 7.161s | Baseline limitation confirmed | [run.json](cc-771-runs/2026-09-03-san-diego-2025-mistral-direct/run.json) |
| `2026-09-03-san-diego-2025-openrouter-claude-opus-5` | CAP 2025, 33 pages | Claude Opus 5 / OpenRouter | Native PDF input | — | 251.309s | IncompleteRead; superseded by retry | [run.json](cc-771-runs/2026-09-03-san-diego-2025-openrouter-claude-opus-5/run.json) |
| `2026-09-03-san-diego-2025-openrouter-gemini-3-1-pro-preview` | CAP 2025, 33 pages | Gemini 3.1 Pro / OpenRouter | Native PDF input | — | 12.849s | IncompleteRead; superseded by retry | [run.json](cc-771-runs/2026-09-03-san-diego-2025-openrouter-gemini-3-1-pro-preview/run.json) |
| `2026-09-03-san-diego-2025-openrouter-url-gemini-3-1-pro-preview` | CAP 2025, 33 pages | Gemini 3.1 Pro / OpenRouter | Native PDF via signed URL | — | 14.882s | Provider/parser failure | [run.json](cc-771-runs/2026-09-03-san-diego-2025-openrouter-url-gemini-3-1-pro-preview/run.json) |
| `2026-09-03-san-diego-2025-openrouter-url-claude-opus-5` | CAP 2025, 33 pages | Claude Opus 5 / OpenRouter | Native PDF via signed URL | US$0.970075 | 258.683s | Strong candidate | [run.json](cc-771-runs/2026-09-03-san-diego-2025-openrouter-url-claude-opus-5/run.json) |
| `2026-09-03-san-diego-2023-mistral-direct` | CAP 2023, 20 pages | Mistral OCR direct | Files API + signed URL | US$0.080 est. | 6.484s | Baseline limitation confirmed | [run.json](cc-771-runs/2026-09-03-san-diego-2023-mistral-direct/run.json) |
| `2026-09-03-san-diego-2023-openrouter-url-gemini-3-1-pro-preview` | CAP 2023, 20 pages | Gemini 3.1 Pro / OpenRouter | Native PDF via signed URL | — | 8.898s | Provider/parser failure; superseded by Base64 retry | [run.json](cc-771-runs/2026-09-03-san-diego-2023-openrouter-url-gemini-3-1-pro-preview/run.json) |
| `2026-09-03-san-diego-2023-openrouter-url-claude-opus-5` | CAP 2023, 20 pages | Claude Opus 5 / OpenRouter | Native PDF via signed URL | US$0.605250 | 187.623s | Strong candidate | [run.json](cc-771-runs/2026-09-03-san-diego-2023-openrouter-url-claude-opus-5/run.json) |
| `2026-09-03-san-diego-2023-openrouter-base64-gemini-gemini-3-1-pro-preview` | CAP 2023, 20 pages | Gemini 3.1 Pro / OpenRouter | Native PDF via Base64 | US$0.160164 | 85.757s | Partial; factual validation required | [run.json](cc-771-runs/2026-09-03-san-diego-2023-openrouter-base64-gemini-gemini-3-1-pro-preview/run.json) |
| `2026-09-03-real2025-sonnet-claude-sonnet-4-5` | CAP 2025, 33 pages | Claude Sonnet 4.5 / OpenRouter | Native PDF via signed URL | — | 362.348s | HTTP 504 | [run.json](cc-771-runs/2026-09-03-real2025-sonnet-claude-sonnet-4-5/run.json) |
| `2026-09-03-real2023-sonnet-claude-sonnet-4-5` | CAP 2023, 20 pages | Claude Sonnet 4.5 / OpenRouter | Native PDF via signed URL | US$0.205692 | 241.507s | Conditional | [run.json](cc-771-runs/2026-09-03-real2023-sonnet-claude-sonnet-4-5/run.json) |
| `2026-09-03-real2025-gpt52-gpt-5-2` | CAP 2025, 33 pages | GPT-5.2 / OpenRouter | Native PDF via signed URL | US$0.26265925 | 152.291s | Strong candidate | [run.json](cc-771-runs/2026-09-03-real2025-gpt52-gpt-5-2/run.json) |
| `2026-09-03-real2023-gpt52-gpt-5-2` | CAP 2023, 20 pages | GPT-5.2 / OpenRouter | Native PDF via signed URL | US$0.1301755 | 78.945s | Strong candidate | [run.json](cc-771-runs/2026-09-03-real2023-gpt52-gpt-5-2/run.json) |
| `2026-09-03-real2023-gemini25-gemini-2-5-pro` | CAP 2023, 20 pages | Gemini 2.5 Pro / OpenRouter | Native PDF via Base64 | US$0.094460 | 78.996s | Conditional | [run.json](cc-771-runs/2026-09-03-real2023-gemini25-gemini-2-5-pro/run.json) |
| `2026-09-03-real2025-gemini25-gemini-2-5-pro` | CAP 2025, 33 pages | Gemini 2.5 Pro / OpenRouter | Native PDF via Base64 | US$0.1680325 | 134.202s | HTTP 200 with null content | [run.json](cc-771-runs/2026-09-03-real2025-gemini25-gemini-2-5-pro/run.json) |

## Expected vs. observed result

The expected result is the benchmark oracle or validation target. The observed result is the actual provider output. Synthetic runs have deterministic ground truth; real-document runs use a qualitative target because the supplied reports do not have a predefined chart-answer key.

| Run | Expected result | Observed result | Verdict |
| --- | --- | --- | --- |
| `2026-09-03-mistral-ocr-direct` | Preserve text/tables and recover all five chart-only facts as usable Markdown. | Text/tables were good, but the chart was an image reference; 0/5 facts were recoverable. | Fail for chart semantics |
| `2026-09-03-openrouter-claude-opus-5` | Preserve text/tables and recover all five chart-only facts correctly. | Preserved text/tables and recovered all five facts correctly. | Pass |
| `2026-09-03-openrouter-gemini-3-1-pro-preview` | Preserve text/tables and recover all five chart-only facts correctly. | Preserved text/tables and recovered all five facts correctly. | Pass |
| `2026-09-03-synthetic-sonnet-claude-sonnet-4-5` | Preserve text/tables and recover all five chart-only facts correctly. | Preserved text/tables and recovered all five facts correctly. | Pass |
| `2026-09-03-synthetic-gpt52-gpt-5-2` | Preserve text/tables and recover all five chart-only facts exactly. | Recovered four facts; the 2025 sum was expressed approximately rather than exactly. | Partial |
| `2026-09-03-synthetic-gemini25-gemini-2-5-pro` | Preserve text/tables and recover all five chart-only facts exactly. | Reported an incorrect 2025 sum and shifted point values. | Fail on numeric accuracy |
| `2026-09-03-san-diego-2025-mistral-direct` | Convert the full report and turn chart/figure information into usable textual context. | Text/tables were good; Figures 1–5 remained image references without complete visual semantics. | Baseline limitation confirmed |
| `2026-09-03-san-diego-2025-openrouter-claude-opus-5` | Convert the full report and recover visual information. | The request ended with `IncompleteRead(6501 bytes read)` before a usable result was produced. | Transport failure; retry performed |
| `2026-09-03-san-diego-2025-openrouter-gemini-3-1-pro-preview` | Convert the full report and recover visual information. | The request ended with `IncompleteRead(253 bytes read)` before a usable result was produced. | Transport failure; retry performed |
| `2026-09-03-san-diego-2025-openrouter-url-gemini-3-1-pro-preview` | Convert the full report and recover visual information. | Google returned “The document has no pages”; no usable result was produced. | Provider/parser failure |
| `2026-09-03-san-diego-2025-openrouter-url-claude-opus-5` | Convert the full report and describe chart titles, axes, series, values, and trends. | Completed the report and produced descriptions covering titles, axes, series, values, and trends. | Strong candidate |
| `2026-09-03-san-diego-2023-mistral-direct` | Convert the full report and turn chart information into usable textual context. | Text/tables were good; the main chart remained an image reference without complete visual semantics. | Baseline limitation confirmed |
| `2026-09-03-san-diego-2023-openrouter-url-gemini-3-1-pro-preview` | Convert the full report and recover visual information. | Google returned “The document has no pages”; no usable result was produced. | Provider/parser failure; Base64 retry performed |
| `2026-09-03-san-diego-2023-openrouter-url-claude-opus-5` | Convert the full report and describe the main chart’s axes, series, values, and targets. | Completed the report and described the chart with axes, series, values, and targets. | Strong candidate |
| `2026-09-03-san-diego-2023-openrouter-base64-gemini-gemini-3-1-pro-preview` | Convert the full report and recover visual information without factual errors. | Recovered the chart, but reversed the direction of the Business as Usual trend. | Partial; factual validation required |
| `2026-09-03-real2025-sonnet-claude-sonnet-4-5` | Convert the full report and recover visual information. | Provider aborted with HTTP 504 after 362.348 seconds. | Operational failure |
| `2026-09-03-real2023-sonnet-claude-sonnet-4-5` | Convert the full report and recover visual information accurately. | Produced good text and visual extraction, with lower precision on the Business as Usual trend. | Conditional |
| `2026-09-03-real2025-gpt52-gpt-5-2` | Convert the full report and describe Figures 1–5 with usable visual semantics. | Completed the report and described the figures with axes, series, values, and trends. | Strong candidate |
| `2026-09-03-real2023-gpt52-gpt-5-2` | Convert the full report and describe the main chart with usable visual semantics. | Completed the report and described the chart with axes, legend, values, and targets. | Strong candidate |
| `2026-09-03-real2023-gemini25-gemini-2-5-pro` | Convert the full report and recover chart and infographic information accurately. | Produced good/conditional visual extraction, including chart and infographic descriptions. | Conditional |
| `2026-09-03-real2025-gemini25-gemini-2-5-pro` | Convert the full report and recover visual information. | Returned HTTP 200 with null content; the charged run produced no usable result. | Operational failure |

## Synthetic visual-fact matrix

| Visual fact | Ground truth | Mistral | Claude Opus 5 | Gemini 3.1 Pro | Sonnet 4.5 | GPT-5.2 | Gemini 2.5 Pro |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Largest sector in 2020 | Transport, 48 ktCO2e | Fail | Pass | Pass | Pass | Pass | Pass |
| First year Transport falls below 35 | 2024 | Fail | Pass | Pass | Pass | Pass | Pass |
| Dashed-line target | 50 ktCO2e | Fail | Pass | Pass | Pass | Pass | Pass |
| Sum of sectors in 2025 | 65 ktCO2e | Fail | Pass | Pass | Pass | Partial | Fail — reported approximately 71 |
| Smallest absolute reduction | Waste, 4 ktCO2e | Fail | Pass | Pass | Pass | Pass | Pass |

## Recommendation

- Keep direct Mistral as the cost/speed baseline, but do not rely on it when information exists only in charts or figures.
- Advance GPT-5.2 and Claude Opus 5 to CC-specific validation.
- Use GPT-5.2 as the leading quality/cost candidate from this battery.
- Keep Sonnet 4.5 and Gemini 2.5 Pro conditional until long-document reliability is validated.
- Treat Gemini 3.1 Pro as unsuitable for the current PDF transport without additional provider/parser work.

## Official deliverables

- Controlled benchmark PDF: `cc-771-benchmark-fixture-en.pdf`
- Real CAP 2025 source PDF: `cc-771-real-source-san-diego-2025.pdf`
- Real CAP 2023 source PDF: `cc-771-real-source-san-diego-2023.pdf`
- This final comparison table

The synthetic fixture is controlled and its figures are not real climate statistics. The real-document results are representative evidence, not a substitute for sanitized CC documents from the production storage path.

## Official benchmark context: OCRBench v2

OCRBench v2 is a bilingual benchmark for large multimodal models with 10,000 human-verified question-answer pairs across 31 scenarios. It evaluates recognition, referring, spotting, extraction, parsing, calculation, understanding, and reasoning over text-rich images.

It is not directly comparable to CC-771: OCRBench v2 evaluates image-level question answering, while CC-771 evaluates end-to-end PDF-to-Markdown extraction on a controlled chart fixture and two long real-world PDF reports. The official results are therefore external context, not replacements for the CC-771 runs.

| CC-771 model | Official OCRBench v2 entry | English average | Chinese average | Match quality |
| --- | --- | ---: | ---: | --- |
| Gemini 3.1 Pro Preview | Gemini 3 Pro Preview | 63.4 (2026.06) | 63.8 (2026.06) | Closest published entry; version name is not identical |
| Gemini 2.5 Pro | Gemini-2.5-Pro | 59.3 (2026.06) | 62.2 (2026.06) | Exact model match |
| GPT-5.2 | GPT-5.2 | 50.5 (2026.03) | 52.6 (2026.03) | Exact model match |
| Claude Opus 5 | Claude Opus 4.6 | 48.4 (2026.03) | 59.8 (2026.03) | Closest published entry; version mismatch |
| Claude Sonnet 4.5 | Claude-sonnet-4-20250514 | 42.4 (2026.03) | Not listed | Closest published entry; version mismatch |
| Mistral OCR latest | No exact entry | Not listed | Not listed | Do not substitute Ministral-3-14B; it is a different model |

Among exact or explicitly closest matches, Gemini 2.5 Pro has the strongest official score for an exact match in the English leaderboard (59.3), followed by GPT-5.2 (50.5). This differs from CC-771, where GPT-5.2 was the best quality/cost candidate and Claude Opus 5 produced the strongest visual extraction. The difference is expected because the task mix, input transport, document length, prompting, and scoring criteria differ.

Sources: [official OCRBench v2 leaderboard](https://99franklin.github.io/ocrbench_v2/), [OCRBench v2 paper](https://arxiv.org/abs/2501.00321), and [official OCRBench repository](https://github.com/Yuliang-Liu/MultimodalOCR).
