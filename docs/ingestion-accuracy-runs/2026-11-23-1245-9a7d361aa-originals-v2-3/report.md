# PDF benchmark run 2026-11-23 12:45 UTC (exploratory) (rescore)

- Commit: `9a7d361aa` on `david/benchmark-subsector-scoring` (dirty working tree)
- Pipeline: precomputed (originals-v2/round2)
- Exploratory: pipeline
- Extraction model: n/a (precomputed pipeline)
- Prompt hash: n/a (precomputed pipeline)
- Input representation: n/a (precomputed pipeline)
- Test-set version: f43dd4fe88e5; scorer version: 3
- Attempts per case: 3
- Rescored from the run of 2026-11-20 12:37 UTC (`df11e0909`) with the current scorer and answer keys; no OCR or LLM call was made
- Selection: C-015, C-016, C-017, C-018, C-019, C-020, C-021
- MLflow: not logged (rescore)

## Block: validated

- 7 of 22 cases in this run
- Headline recall (failed attempts count as 0): n/a (0 cases counted; only eligible cases with row recall count); cases with totals within tolerance: 3
- Recall over scored attempts only: n/a (0 cases counted)
- Provisional recall, cases whose `textTables` is unknown (failed attempts count as 0): 86% (7 cases counted)
- Attempts passing: 43%
- Attempts 10x or more off the expected total: 1
- Wrong totals that carried a warning: 0%
- Precision 98%, value accuracy 99%, classification accuracy 97% (means over 7 cases scored row by row, scored attempts only)
- Notation keys recovered: 26 of 39; cases that stored a distractor value: 3
- Rows stored without scope (subsector ref, scope null): 14.3 (data quality, not scored)

## Guardrails

- 10x guardrail: 1 attempt with a stored total 10x or more off the expected total
- Warnings: none

## Regressions against the baseline

No baseline comparison in this run.

## Change from the baseline

No case in this run has a baseline to compare with.

## Failure modes

No failed attempts.

## Per case

Recall counts failed attempts as 0. Precision, accuracies and distractors stored are means over the scored attempts; notation keys are those of the first scored attempt. Runtime is summed over the attempts.

| Case | Block | Verdict | Attempts passed | Recall | Precision | Value acc. | Class. acc. | Notation keys | Distractors stored | Unscoped rows | Total within tolerance | 10x | Failure modes | Cost | Tokens in / out | Runtime by stage | Tolerance source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-015 | validated | n/a | 3/3 | 100% | 98% | 100% | 100% | 1/1 | 0 | 0 | yes | 0 | none | n/a | 8911k / 65k | ocr n/a, extraction n/a, import 5 s | legacy |
| C-016 | validated | n/a | 0/3 | 95% | 96% | 96% | 100% | 4/9 | 0 | 0 | no | 0 | none | n/a | 6945k / 63k | ocr n/a, extraction n/a, import 5 s | legacy |
| C-017 | validated | n/a | 0/3 | 81% | 98% | 98% | 96% | 21/26 | 6 | 0 | no | 0 | none | n/a | 9244k / 77k | ocr n/a, extraction n/a, import 5 s | legacy |
| C-018 | validated | n/a | 3/3 | 100% | 100% | 100% | 100% | 0/3 | 4 | 0 | yes | 0 | none | n/a | 5358k / 54k | ocr n/a, extraction n/a, import 5 s | legacy |
| C-019 | validated | n/a | 0/3 | 42% | 100% | 100% | 93% | 0/0 | 5 | 0 | no | 1 | none | n/a | 11740k / 66k | ocr n/a, extraction n/a, import 5 s | legacy |
| C-020 | validated | n/a | 3/3 | 92% | 92% | 100% | 92% | 0/0 | 0 | 7.3 | yes | 0 | none | n/a | 8857k / 51k | ocr n/a, extraction n/a, import 5 s | legacy |
| C-021 | validated | n/a | 0/3 | 91% | 100% | 100% | 100% | 0/0 | 0 | 7 | no | 0 | none | n/a | 5544k / 42k | ocr n/a, extraction n/a, import 5 s | legacy |

Estimated cost of this run: n/a

## Pipeline notes

What the pipeline reported for each attempt: facts about the envelope, not scored. Lost rows are the rows approve skipped, by import issue code; `unexplained` and `notSkipped` mark a mismatch between the rows approve skipped and the issues it reported.

| Case | Attempt | Execution status | Rows in envelope | Unknown row roles | Dropped rows | Lost rows | Reported totals (t) | Total basis / kind | Scope basis | Total inclusion | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-015 | 1 | completed | 39 | none | none | no-value-or-notation-key 3 | total 3347875.4, gross n/a, net 3347875.4, removals n/a | 2022 Rosario community-wide GPC BASIC+ city-induced inventory, net of land-use removals, as declared on page 7 and tabulated on pages 17 and 54–55; source unit tonnes CO2e. Includes stationary energy ... / net | explicit 36, unknown 1, inferred 2 | included 35, excluded 4 | n/a (none) |
| C-015 | 2 | completed | 39 | none | none | no-value-or-notation-key 3 | total 3347875.4, gross n/a, net 3347875.4, removals n/a | 2022 Rosario municipal community-wide GPC BASIC+ inventory, net of AFOLU land sinks, not municipal corporate operations or the metropolitan region. The annex city-induced BASIC+ column explicitly repo... / net | explicit 37, inferred 1, unknown 1 | included 35, excluded 4 | n/a (none) |
| C-015 | 3 | completed | 45 | none | information 1 | no-value-or-notation-key 9 | total 3347875.4, gross n/a, net 3347875.4, removals n/a | 2022 Rosario city/community-wide GPC BASIC+ city-induced inventory, net of AFOLU land emissions/removals; not a municipal corporate inventory. Selected printed BASIC+ total: 3.347.875,40 toneladas CO2... / net | explicit 44, unknown 1 | included 41, excluded 4 | n/a (none) |
| C-016 | 1 | completed | 55 | none | none | no-value-or-notation-key 8, gpc-reference-unresolved 7 | total 14056006, gross n/a, net 14056006, removals -1604225 | 2023 community-wide GPC BASIC+ city-induced inventory for the Mersin Metropolitan Municipality geographic boundary (15,853 km²), not municipal corporate operations. Selected printed total 14.056.006 m... / net | explicit 53, inferred 2 | included 48, excluded 7 | n/a (none) |
| C-016 | 2 | completed | 59 | none | information 1 | no-value-or-notation-key 12, gpc-reference-unresolved 7 | total 14056006, gross n/a, net 14056006, removals -1604225 | 2023 community inventory for Mersin Metropolitan Municipality's geographic boundary (15,853 km²), declared LEVEL BASIC+, city-induced framework. Selected explicitly printed net BASIC+ total = 14.056.0... / net | explicit 59 | included 52, excluded 7 | n/a (none) |
| C-016 | 3 | completed | 55 | none | none | no-value-or-notation-key 8, gpc-reference-unresolved 7 | total 14056006, gross n/a, net 14056006, removals -1604225 | 2023 community-wide GPC/CIRIS BASIC+ city-induced inventory for Mersin Metropolitan Municipality's geographic boundary (province-wide municipal boundary; not corporate operations). Selected printed ne... / net | explicit 54, unknown 1 | included 48, excluded 7 | n/a (none) |
| C-017 | 1 | completed | 64 | none | information 2 | no-value-or-notation-key 11, gpc-reference-unresolved 5 | total 15804670, gross n/a, net n/a, removals n/a | Phoenix calendar-year 2022 community-scale, GPC BASIC inventory, 15,804,670 MT CO2e; MT is explicitly metric tons, so 15,804,670 tonnes CO2e. The boundary covers stationary energy and transportation s... / gross | explicit 59, unknown 5 | included 42, excluded 22 | n/a (none) |
| C-017 | 2 | completed | 64 | none | information 2 | no-value-or-notation-key 3, gpc-reference-unresolved 5 | total 15804670, gross n/a, net n/a, removals n/a | City of Phoenix calendar-year 2022 community-scale GPC BASIC inventory, not a municipal/corporate operations inventory. Includes stationary energy and transportation scopes 1 and 2, and city-generated... / other | explicit 59, unknown 5 | included 42, excluded 22 | n/a (none) |
| C-017 | 3 | completed | 64 | none | information 2 | no-value-or-notation-key 3, gpc-reference-unresolved 5 | total 15804670, gross n/a, net n/a, removals n/a | Calendar-year 2022 City of Phoenix community-scale GPC BASIC inventory, explicitly reported as 15,804,670 MT CO2e (MT = metric tons, not megatonnes). Includes stationary energy scopes 1 and 2, transpo... / other | explicit 59, unknown 5 | included 42, excluded 22 | n/a (none) |
| C-018 | 1 | completed | 70 | none | none | no-value-or-notation-key 30 | total 2145243.596, gross n/a, net 2145243.596, removals n/a | GPC/HuellaChile Básico+, community-wide Comuna de Santiago within its political-administrative boundary, including reported scopes 1, 2 and 3; not the metropolitan region or municipal corporate operat... / net | explicit 70 | excluded 30, included 40 | n/a (none) |
| C-018 | 2 | completed | 70 | none | none | no-value-or-notation-key 30 | total 2145243.596, gross n/a, net 2145243.596, removals n/a | Inventario comunitario de la Comuna de Santiago, límite político-administrativo comunal (no toda el área metropolitana ni únicamente operaciones municipales), GPC/HuellaChile Básico+, período 01/01/20... / net | explicit 69, unknown 1 | excluded 30, included 40 | n/a (none) |
| C-018 | 3 | completed | 70 | none | none | no-value-or-notation-key 30 | total 2145243.596, gross n/a, net 2145243.596, removals n/a | Community-wide Comuna de Santiago administrative boundary, GPC/HuellaChile city reporting framework Básico+, scopes 1, 2 and 3. Selected source-declared net total: 2.145.243.596 KgCO2e (Annex 2), norm... / net | explicit 70 | included 40, excluded 30 | n/a (none) |
| C-019 | 1 | completed | 29 | none | information 3 | gpc-reference-unresolved 7, no-value-or-notation-key 15 | total 1273000, gross 1273000, net n/a, removals n/a | Gross community inventory for the commune of Peñalolén, 1 January–31 December 2022, within the report's declared GPC Básico boundary. Figure 2 explicitly excludes informative emissions and removals an... / gross | explicit 26, unknown 3 | included 21, excluded 8 | n/a (none) |
| C-019 | 2 | completed | 35 | none | information 3 | gpc-reference-unresolved 8, no-value-or-notation-key 21 | total 1273000, gross 1273000, net n/a, removals n/a | 2022 community/territorial inventory for the comuna of Peñalolén, Región Metropolitana, not municipal corporate operations or the entire region. Selected printed total: Tabla 10, physical p56, Total E... / gross | explicit 30, unknown 3, inferred 2 | included 21, excluded 14 | n/a (none) |
| C-019 | 3 | completed | 35 | none | information 3 | gpc-reference-unresolved 4, no-value-or-notation-key 21 | total 1273000, gross 1273000, net n/a, removals n/a | 2022 community-wide inventory for the Peñalolén commune, within the report for the Región Metropolitana; not municipal corporate operations and not the regional total. Selected gross Total Emisiones: ... / gross | explicit 30, unknown 5 | included 21, excluded 14 | n/a (none) |
| C-020 | 1 | completed | 12 | none | none | none | total 23787113, gross 23787113, net n/a, removals n/a | 2022 community inventory for the Área Metropolitana de Guadalajara (AMG): El Salto, Guadalajara, Ixtlahuacán de los Membrillos, Juanacatlán, San Pedro Tlaquepaque, Tlajomulco de Zúñiga, Tonalá, Zapopa... / gross | combined 6, explicit 2, unknown 1, inferred 3 | included 12 | n/a (none) |
| C-020 | 2 | completed | 12 | none | none | none | total 23787113, gross 23787113, net n/a, removals n/a | 2022 community inventory for the nine-municipality Área Metropolitana de Guadalajara, not Guadalajara municipality alone or municipal corporate operations. Report-declared GPC BASIC: stationary energy... / gross | combined 6, explicit 2, unknown 1, inferred 3 | included 12 | n/a (none) |
| C-020 | 3 | completed | 12 | none | none | none | total 23787113, gross 23787113, net n/a, removals n/a | 2022 community-wide GPC BASIC inventory for the Área Metropolitana de Guadalajara (AMG), covering nine municipalities, not Guadalajara municipality alone or municipal corporate operations. The printed... / gross | combined 6, explicit 2, unknown 1, inferred 3 | included 12 | n/a (none) |
| C-021 | 1 | completed | 12 | none | none | gpc-reference-unresolved 1 | total 3164591, gross 3164591, net n/a, removals n/a | 2020 Curitiba community-wide GPC BASIC gross emissions within the declared inventory boundary: stationary energy, transportation and waste; includes grid electricity and city-generated waste treated o... / gross | combined 6, inferred 4, unknown 2 | included 12 | n/a (none) |
| C-021 | 2 | completed | 12 | none | none | gpc-reference-unresolved 1 | total 3164591, gross 3164591, net n/a, removals n/a | 2020 Curitiba community-wide GPC BASIC gross emissions total, printed as “emissões [...] totais inventariadas”, not explicitly labelled “brutas”. Covers stationary energy, transport and waste; municip... / gross | combined 6, inferred 4, unknown 2 | included 12 | n/a (none) |
| C-021 | 3 | completed | 12 | none | none | gpc-reference-unresolved 1 | total 3164591, gross 3164591, net n/a, removals n/a | Gross community-wide GPC BASIC inventory for the municipality of Curitiba, base year 2020, reported as 3.164.591 toneladas de dióxido de carbono equivalente (tCO2e). This is the report's BASIC emissio... / gross | combined 6, inferred 4, unknown 2 | included 12 | n/a (none) |

## Score variant: parent references

The standard score is the headline. The parent refs (Mirco) variant also scores the rows the pipeline gave as an unsplit I, II or III subsector (such as I.3) that approve dropped, and writes every such reference as `<ref>.x` (Mirco's `scoringReference`): it can match a key row written as that subsector or as `<ref>.x`, never an exact child row with a scope such as I.3.1. When the pipeline also gave the children of a parent reference and approve stored them, the variant counts that amount twice (see the last column); the standard score is unaffected. Recall counts failed attempts as 0; precision is the mean over the scored attempts; parent-reference rows are summed over the attempts.

| Block | Headline recall: standard | Headline recall: parent refs (Mirco) | Precision: standard | Precision: parent refs (Mirco) |
| --- | --- | --- | --- | --- |
| validated | n/a | n/a | 98% | 98% |

| Case | Block | Recall: standard | Recall: parent refs (Mirco) | Precision: standard | Precision: parent refs (Mirco) | Totals within tolerance: standard | Totals within tolerance: parent refs (Mirco) | Parent-reference rows added | Of which children were stored too |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-015 | validated | 100% | 100% | 98% | 98% | yes | yes | 0 | 0 |
| C-016 | validated | 95% | 95% | 96% | 96% | no | no | 0 | 0 |
| C-017 | validated | 81% | 81% | 98% | 98% | no | no | 0 | 0 |
| C-018 | validated | 100% | 100% | 100% | 100% | yes | yes | 0 | 0 |
| C-019 | validated | 42% | 42% | 100% | 100% | no | no | 0 | 0 |
| C-020 | validated | 92% | 92% | 92% | 92% | yes | yes | 0 | 0 |
| C-021 | validated | 91% | 91% | 100% | 100% | no | no | 0 | 0 |

## Notes

- C-028 and C-031 are not fully held out.
- Cases using the legacy tolerance: C-015, C-016, C-017, C-018, C-019, C-020, C-021
- Cases where `textTables` is unknown: C-015, C-016, C-017, C-018, C-019, C-020, C-021
- Cases whose application total is off but would be within tolerance after removing the GPC-excluded references the app does not flag yet (CC-1201): none
