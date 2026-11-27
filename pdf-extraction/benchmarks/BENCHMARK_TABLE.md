# Benchmark comparison table · 17 November 2026

This table compares the recorded old pipeline with the agent on the same report IDs and Product keys, using the cached, unchanged upstream PDF scorer. Each row summarizes three attempts. The old reference is the 12 November run from PR #3424; see ORIGINAL_PDF_RESULTS.md for its source and limitations.

Recall, precision and F1 include failed attempts as zero. Total-only reports have no row metrics. Value accuracy is conditional on located references; classification is conditional on value matches. Their cells show the number of attempts with a defined metric (n/3), not row coverage. Failures remain visible in the last column. F1 is a derived comparison metric, not a claim about the old report's published headline recall.

| Report / year | Pipeline | Recall | Precision | Row F1 | Value accuracy (defined) | Classification (defined) | Row-total passes | Failures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-015 Rosario 2022 | Recorded old | 96.4% | 96.4% | 96.4% | 98.8% (3/3) | 97.6% (3/3) | 2/3 | 0 |
| C-015 Rosario 2022 | Agent / Mistral off | 100.0% | 96.6% | 98.2% | 100.0% (3/3) | 100.0% (3/3) | 3/3 | 0 |
| C-015 Rosario 2022 | Agent / Mistral on | 100.0% | 96.6% | 98.2% | 100.0% (3/3) | 100.0% (3/3) | 3/3 | 0 |
| C-016 Mersin 2023 | Recorded old | 90.1% | 94.2% | 92.0% | 94.2% (3/3) | 100.0% (3/3) | 3/3 | 0 |
| C-016 Mersin 2023 | Agent / Mistral off | 96.3% | 92.6% | 94.4% | 96.3% (3/3) | 96.2% (3/3) | 0/3 | 0 |
| C-016 Mersin 2023 | Agent / Mistral on | 96.3% | 93.8% | 95.0% | 97.5% (3/3) | 96.2% (3/3) | 1/3 | 0 |
| C-017 Phoenix 2022 | Recorded old | 30.7% | 55.6% | 39.5% | 59.0% (3/3) | 66.7% (3/3) | 0/3 | 0 |
| C-017 Phoenix 2022 | Agent / Mistral off | 81.3% | 85.3% | 83.2% | 98.1% (3/3) | 84.1% (3/3) | 0/3 | 0 |
| C-017 Phoenix 2022 | Agent / Mistral on | 68.0% | 80.0% | 73.5% | 94.4% (3/3) | 76.2% (3/3) | 0/3 | 0 |
| C-018 Santiago 2022 | Recorded old | 91.7% | 91.7% | 91.7% | 91.7% (3/3) | 100.0% (3/3) | 0/3 | 0 |
| C-018 Santiago 2022 | Agent / Mistral off | 100.0% | 100.0% | 100.0% | 100.0% (3/3) | 100.0% (3/3) | 3/3 | 0 |
| C-018 Santiago 2022 | Agent / Mistral on | 100.0% | 100.0% | 100.0% | 100.0% (3/3) | 100.0% (3/3) | 3/3 | 0 |
| C-019 Peñalolén 2022 | Recorded old | 0.0% | 0.0% | 0.0% | N/A (0/3) | N/A (0/3) | 0/3 | 3 |
| C-019 Peñalolén 2022 | Agent / Mistral off | 42.4% | 42.4% | 42.4% | 100.0% (3/3) | 42.4% (3/3) | 3/3 | 0 |
| C-019 Peñalolén 2022 | Agent / Mistral on | 39.4% | 39.4% | 39.4% | 100.0% (3/3) | 39.4% (3/3) | 3/3 | 0 |
| C-020 Guadalajara 2022 | Recorded old | 0.0% | 0.0% | 0.0% | N/A (0/3) | N/A (0/3) | 0/3 | 3 |
| C-020 Guadalajara 2022 | Agent / Mistral off | 91.7% | 91.7% | 91.7% | 100.0% (3/3) | 91.7% (3/3) | 3/3 | 0 |
| C-020 Guadalajara 2022 | Agent / Mistral on | 91.7% | 91.7% | 91.7% | 100.0% (3/3) | 91.7% (3/3) | 3/3 | 0 |
| C-021 Curitiba 2020 | Recorded old | 90.9% | 90.9% | 90.9% | 100.0% (3/3) | 90.9% (3/3) | 3/3 | 0 |
| C-021 Curitiba 2020 | Agent / Mistral off | 90.9% | 90.9% | 90.9% | 100.0% (3/3) | 90.9% (3/3) | 3/3 | 0 |
| C-021 Curitiba 2020 | Agent / Mistral on | 90.9% | 90.9% | 90.9% | 100.0% (3/3) | 90.9% (3/3) | 3/3 | 0 |
| C-022 Madrid 2023 | Recorded old | N/A | N/A | N/A | N/A (0/3) | N/A (0/3) | 2/3 | 0 |
| C-022 Madrid 2023 | Agent / Mistral off | N/A | N/A | N/A | N/A (0/3) | N/A (0/3) | 3/3 | 0 |
| C-022 Madrid 2023 | Agent / Mistral on | N/A | N/A | N/A | N/A (0/3) | N/A (0/3) | 3/3 | 0 |
| C-023 Kyoto 2023 | Recorded old | N/A | N/A | N/A | N/A (0/3) | N/A (0/3) | 1/3 | 0 |
| C-023 Kyoto 2023 | Agent / Mistral off | N/A | N/A | N/A | N/A (0/3) | N/A (0/3) | 3/3 | 0 |
| C-023 Kyoto 2023 | Agent / Mistral on | N/A | N/A | N/A | N/A (0/3) | N/A (0/3) | 3/3 | 0 |
| C-024 Coimbatore 2019 | Recorded old | N/A | N/A | N/A | N/A (0/3) | N/A (0/3) | 1/3 | 0 |
| C-024 Coimbatore 2019 | Agent / Mistral off | N/A | N/A | N/A | N/A (0/3) | N/A (0/3) | 3/3 | 0 |
| C-024 Coimbatore 2019 | Agent / Mistral on | N/A | N/A | N/A | N/A (0/3) | N/A (0/3) | 3/3 | 0 |
| C-025 Münster 2022 | Recorded old | N/A | N/A | N/A | N/A (0/3) | N/A (0/3) | 0/3 | 3 |
| C-025 Münster 2022 | Agent / Mistral off | N/A | N/A | N/A | N/A (0/3) | N/A (0/3) | 0/3 | 0 |
| C-025 Münster 2022 | Agent / Mistral on | N/A | N/A | N/A | N/A (0/3) | N/A (0/3) | 0/3 | 0 |
| C-027 Chicago 2019 | Recorded old | 9.1% | 7.1% | 8.0% | 9.1% (3/3) | 100.0% (3/3) | 0/3 | 0 |
| C-027 Chicago 2019 | Agent / Mistral off | 90.9% | 83.3% | 87.0% | 90.9% (3/3) | 100.0% (3/3) | 3/3 | 0 |
| C-028 Long Beach 2021 | Recorded old | 0.0% | 0.0% | 0.0% | 0.0% (3/3) | N/A (0/3) | 0/3 | 0 |
| C-028 Long Beach 2021 | Agent / Mistral off | 42.7% | 39.0% | 40.7% | 53.1% (3/3) | 91.7% (3/3) | 0/3 | 0 |
| C-029 Chicago 2017 | Recorded old | 98.2% | 98.2% | 98.2% | 100.0% (3/3) | 98.2% (3/3) | 2/3 | 0 |
| C-029 Chicago 2017 | Agent / Mistral off | 64.9% | 72.5% | 68.5% | 100.0% (3/3) | 94.9% (3/3) | 3/3 | 0 |
| C-030 Porto Alegre 2019 | Recorded old | 96.3% | 96.3% | 96.3% | 100.0% (3/3) | 96.3% (3/3) | 3/3 | 0 |
| C-030 Porto Alegre 2019 | Agent / Mistral off | 91.4% | 85.1% | 88.1% | 94.9% (3/3) | 100.0% (3/3) | 1/3 | 0 |
| C-031 Dunedin 2021 | Recorded old | 51.9% | 73.1% | 60.6% | 81.1% (3/3) | 100.0% (3/3) | 0/3 | 0 |
| C-031 Dunedin 2021 | Agent / Mistral off | 22.2% | 21.3% | 21.7% | 40.0% (3/3) | 100.0% (3/3) | 0/3 | 0 |

Row-total passes use the same numeric target and tolerance, with failed attempts unable to pass. New outputs also require an unambiguous inclusion boundary. Reported source totals are a separate diagnostic; they can differ from the key's normalized row sum. The parent-to-.x representation adapter applies equally to both pipelines and never invents a scope.

The old reference has no per-PDF hashes, different extraction models/prompts, and unreliable historical cost labels. This is a comparison with saved historical outputs, not a fresh current-production A/B run. Long Beach C-028 and Dunedin C-031 were already marked not fully held out. Published headline-eligibility gates are not reconstructed here because the source table-eligibility metadata is unavailable.

Reproduce from prepared artifacts: python -m examples.audit_experiment. The generated table is benchmarks/runs/originals-v2/benchmark-table.md. This public file is a copy for branch review; private PDFs, keys and full traces remain ignored.
