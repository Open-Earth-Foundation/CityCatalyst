# Agentic flow test case: Krosno

A real grant application from a real city, used to test the agentic flow (the
context-first document workspace on this branch). The city's public documents
go in, and what the tool produces is compared with what the city actually
submitted.

Everything for this test case lives in this folder, so it travels with the
branch and does not touch the code.

## In this folder

- `README.md` (this file): the case, how the test runs, and the manifest of the
  19 source files.
- `eucf-template.json`: the funder's form as a template, 46 points in 12
  chapters. See "The template" below.
- `automation-proposal.md`: a proposal for running this test automatically.
  Written for Piotr to adapt.
- Still to come: the answer key (`answer-key.json`).

**The source documents are not in git**, following the convention of the Builder
benchmark fixtures (`climate-advisor/benchmark/cnb/fixtures/README.md`): each
file is pinned below by its public link and SHA-256.

## The case

- **City:** Krosno, Poland. About 44,000 residents, a manufacturing town (glass,
  aviation) in Podkarpackie.
- **Grant:** European City Facility (EUCF), application `03PL000622X`, "Krosno
  Zero emission path".
- **Submitted:** 17 December 2021. Evaluator's feedback dated 1 March 2022, score
  20.50 out of 25.
- **What it plans:** about EUR 160.6 million of investment to 2040 across eight
  sectors.
- **Second grant, same city:** Norway and EEA Grants, Local Development
  programme. Used after the first one works, to measure how much carries over to
  a different form.

## Why Krosno

- The funder's form, the city's submitted answers and the evaluator's scoring
  are all public, so there is a real answer key.
- The application is short (narrative fields 2.3 to 3.5, in Polish and English)
  and has two numeric annexes, which tests both text and figures.
- The city publishes long source documents the answers have to be found in.
- A second submitted application for the same city is public.

## How the test runs

1. Write the EUCF form as a setup: the list of points the application asks for.
2. Give the tool only the city documents that existed in December 2021 (the
   low-emission plan in section 3 and the two 2020 development plans listed in
   section 4).
3. Let it sort the documents, fill the points, and list what is missing.
4. Compare with the answer key (section 2): which points it found, which it got
   wrong, which it correctly flagged as missing.
5. Repeat with the second grant (section 4) using the same city documents.

## Files

Paths are relative to a local `krosno/` folder. Sizes in bytes.

### 1. The funder's form (`1-funder-template/`)

| File | What it is | Size | SHA-256 | Source |
| --- | --- | --- | --- | --- |
| `EUCF-guidelines-for-applicants.pdf` | Every field of the application and how it is scored | 1111350 | `866b73951dbdfb2f713abb6727e5cdf9f20379ab3b7e2662af0375f5b0455a0f` | [archive.org](http://web.archive.org/web/20230803065602/http://www.eucityfacility.eu/fileadmin/user_upload/2022_06_03_D2.7_EUCF_Guidelines_for_Applicants.pdf) |
| `Annex-D-energy-savings-template.xlsx` | Blank annex D, energy savings and renewable production | 106994 | `fdbb9c1fb75543eeb9dc267fb2ef7bc11febbfe4fb6393334ad6a13ea3cd9ece` | [pnec.org.pl](https://www.pnec.org.pl/images/stories/2021/eucf/Annex_D_Estimation_of_Energy_Savings_Renewable_Energy_Production_2_.xlsx) |
| `Annex-E-investment-size-template.xlsx` | Blank annex E, size of investment | 51305 | `e4f4eea0abd84610ad9fc6be9df71c5a5ca54e15a5708ca91ab80b5dcf45c30a` | [pnec.org.pl](https://www.pnec.org.pl/images/stories/2021/eucf/Annex_E_Estimation_of_Investment_Size_poprawny.xlsx) |
| `Annex-A2-SECAP-summary-template.docx` | Blank annex A.2, summary of the city's climate plan | 326755 | `42969b322b151f2ff18c3c2316ded9f8d32d77037b6d4c8150912b58565a1b5c` | [pnec.org.pl](https://www.pnec.org.pl/images/stories/2021/eucf/Annex_A.2_SEAP__SECAP_or_Plan_of_similar_ambition_-_Summary_1_.docx) |
| `EUCF-questions-and-answers-PL.pdf` | Questions and answers for applicants (Polish) | 434636 | `07311d2d72371efc73ad7d0a136f0ecd1bb6e306183971f4d4805fb82191289f` | [pnec.org.pl](https://www.pnec.org.pl/images/stories/2021/eucf/QA_suma.pdf) |
| `EUCF-investment-concept-template-PL.pdf` | Template of the investment concept the grant pays the city to write afterwards (Polish) | 1343920 | `bd3b38347fb97ca8841daa6e3e944462a08f0f1f6ad7fc6d74b9dee2f4901dea` | [pnec.org.pl](https://www.pnec.org.pl/images/stories/Projekty/EUCF/EUCF_szablon_koncepcji-inwestycyjnej-PL.pdf) |

### 2. What Krosno submitted, the answer key (`2-submitted-application/`)

| File | What it is | Size | SHA-256 | Source |
| --- | --- | --- | --- | --- |
| `Krosno-EUCF-application-2021-12-17-PL-EN.pdf` | Application text, fields 2.3 to 3.5 (4 pages, Polish and English) | 483206 | `520ebf7c3bf7b1ce88470b92cd4ba5af7b94b869f51840178fd11752818ea83d` | [platformazakupowa.pl](https://platformazakupowa.pl/file/get_new/10c32b96574da9ab03b12eed4da13c83.pdf) |
| `Krosno-Annex-E-investment-size-filled.pdf` | Annex E as filled, EUR 160,644,000 | 42864 | `5c060a60e74b8e1bf569da6a3bff8d6a050451cb5f8c6f39331018e64ac83a1a` | [platformazakupowa.pl](https://platformazakupowa.pl/file/get_new/4ac845930b80a7e1c910c32f9b901179.pdf) |
| `Krosno-Annex-D-energy-calculation-filled.pdf` | Annex D as filled | 48234 | `e7620abb91567ecbcff49e015bbd47da9c5b53da7842fcf307d2ef07c8211841` | [platformazakupowa.pl](https://platformazakupowa.pl/file/get_new/61be2883b125f5db2665b12e1f634a5b.pdf) |
| `EUCF-feedback-for-applicant-Krosno.pdf` | Evaluator's score and comment per criterion | 204986 | `7fda9ffd5c111e39eac12aaaa1016584e370e8ab922f4c566faca91754fb088e` | [platformazakupowa.pl](https://platformazakupowa.pl/file/get_new/5572f7d29555810ec7ee021561443891.pdf) |

### 3. City documents, what the tool reads (`3-city-documents/`)

| File | What it is | Size | SHA-256 | Source |
| --- | --- | --- | --- | --- |
| `Krosno-low-emission-plan-2019-update.pdf` | Low-emission plan, 2019 update, with the emissions inventory (567 pages, Polish) | 8528198 | `6f2e737b8a2aaaf7240450a33dbdab61440a355aac83b2ef653c4bab2a2071e4` | [krosno.pl](https://krosno.pl/storage/file/core_files/2021/6/1/eec46bbc8780affd292fc08c492a4cf9/PGN%20aktualizacja%202019.pdf) |
| `Krosno-state-of-the-city-2023.pdf` | State of the city report, 2023 (Polish) | 3653242 | `dc2a23f614d441d0355e05344a83791fa4fada9ee64b8c6ab3d966c3c391c534` | [krosno.pl](https://www.krosno.pl/storage/file/core_files/2024/5/24/a5c4f678c0e230114722ed6823a5f969/raport%20o%20stanie%20miasta%202023.pdf) |
| `Krosno-state-of-the-city-2024.pdf` | State of the city report, 2024 (Polish) | 3098787 | `74925435f522fe9a70fdcea84bddb4a9519da83cd3b67dc5973a0d53b71e0e15` | [krosno.pl](https://krosno.pl/storage/file/core_files/2025/5/30/94781b6a91ceb2f02062b035409806b6/raport%20o%20stanie%20miasta%202024.pdf) |
| `Krosno-functional-area-investment-strategy-2021-2027.pdf` | Investment strategy for the Krosno functional area, 2021 to 2027 (Polish) | 10735584 | `187078308cb9fea2959779d923c8fb0b146f6e4f35725b1f0a462c682b7be925` | [krosno.pl](https://krosno.pl/storage/file/core_files/2025/1/20/7e0a52cb4bd4dd90a1b40d2dab7e416d/Strategia%20ZIT%20MOF%20Krosno%202021%20-%202027.pdf) |

### 4. The second grant (`4-second-grant-local-development/`)

| File | What it is | Size | SHA-256 | Source |
| --- | --- | --- | --- | --- |
| `Krosno-local-development-plan-submitted.pdf` | Local development plan as submitted (294 pages, Polish) | 10631910 | `10064d831cca3fee7cdf8ccffd1dc579030bbfc7839f92a1f45f8d7f7c7fae2d` | [krosno.pl](https://www.krosno.pl/storage/file/core_files/2020/5/11/b79a6f90409d19a694a8c112ac1f316b/plan_rozwoju_lokalnego.pdf) |
| `Krosno-institutional-development-plan-submitted.pdf` | Institutional development plan as submitted (252 pages, Polish) | 7468399 | `f4415c26a0432b836659856b72e5efe0ad51a3ac3f39bb00776e8bb8ab1413dd` | [krosno.pl](https://www.krosno.pl/storage/file/core_files/2020/5/11/348ada7bb179967796133064b4519139/plan_rozwoju_instytycjonalnego.pdf) |
| `Outline-form-template-PL.pdf` | The short first-stage project outline form | 156788 | `4d83b7f21eaaef5ba22fdb007a0fda25081f5f8dea414dd515c6ff652fdc5431` | [archive.org](https://web.archive.org/web/20210517011906/https://www.eog.gov.pl/media/73451/Zalacznik_nr_2_Formularz_Zarysu_Projektu.pdf) |
| `Call-rules-PL.pdf` | Call rules | 311902 | `bd2572280538ef52cbfac66a99cc72ba614a0ef5336b4b1b06b4aa75e6cdfece` | [archive.org](https://web.archive.org/web/20210420031008/https://www.eog.gov.pl/media/89479/RL_Regulamin_naboru.pdf) |
| `Ranking-list-with-amounts.pdf` | Ranking list with funding amounts, June 2021 | 56411 | `92145596dd606ac308133cb19ab67194560cdc2a5e52a483603108bd788be661` | [archive.org](https://web.archive.org/web/20210713053027/https://www.eog.gov.pl/media/102351/Lista_rankingowa_RL_z_kwota_finansowania.pdf) |

To check a downloaded copy:

```bash
shasum -a 256 krosno/*/*
```

## Known limits

- **The application is an extract.** The public file is the city's own copy of
  the narrative fields 2.3 to 3.5, not the full online form.
- **Some city documents are newer than the application.** The 2023 and 2024
  city reports were written after December 2021. A fair run of the first grant
  should note which facts the city could not have had at the time.
- **The emissions inventory needs care.** The only inventory is in the
  low-emission plan. It covers 2018 under a table headed "2013" and counts wood
  as emitting CO2.
- **Not found:** an adaptation plan, a heat supply plan, and budget files.
- **Links can break.** The submitted files sit on a public tender site. If a
  link stops working, the checksum still identifies the right copy.
- **The second grant's template and documents differ in stage.** The public
  template is the short first-stage outline; the public submissions are the
  long second-stage plans.

## The template

`eucf-template.json` is written by hand from the Guidelines for Applicants
(section 2.3.2 for the form, 2.4 for the annexes, 3.1 for the evaluation
criteria). It uses the same shape as the benchmark's `drafting_input.json`:
`chapter_schema` with `required_fields`, where each field is a rich definition
as read by `document_workspace/requirements.py` (`key`, `label`, `description`,
`kind`, `answer_type`, `choices`, `unit`, `evidence_need`).

- One chapter per form item (1, 2.1 to 2.5, 3.1 to 3.5) plus the plan summary
  (Annex A.2). Annex D figures sit under 3.4 and Annex E figures under 3.3.
- Each form item is split into the things it must contain, taken from the
  guidelines and from what the evaluator checked. Governance, for example, has
  seven points.
- `kind` is `fact` when a document can hold the answer and `decision` when the
  applicant has to choose.
- Answers are in English (the funder requires it); the city documents are in
  Polish.

Things the format could not express, for Piotr:

- **No multi-select.** Item 3.1 lets the applicant tick several sectors. It is
  modelled as a main sector (`choice`) plus other sectors (`multiline`).
- **No table type.** Investment by sector (Annex E) is a `multiline` point.
- **Loading it.** I did not find a way to load a template file into a running
  instance other than the custom-template review. How this one gets in is
  Piotr's call.

## Not yet done

- The answer key: for each point, what Krosno submitted, where it sits in the
  city documents (file and page), or that it is in no document.
- A second template produced by the tool's own import from the guidelines PDF,
  to compare with the hand-written one.
- A Krosno version of the clickable prototype, built from the answer key.
- The second grant.
