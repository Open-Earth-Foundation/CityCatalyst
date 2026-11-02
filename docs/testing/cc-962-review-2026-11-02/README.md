# CC-962 — review package

This package brings the GHGI audit, real-user conversation evaluation, recorded evidence and the verified source-provenance fix into one draft PR. CC-962 remains **In Progress** pending product/engineering review.

## Start here

1. [Current conversation report](ca/CC-962-conversation-report-revised.md): 15 scenarios executed three times; 11 scenarios / 33 conversations scored after excluding four unsupported-feature scenarios at the user's request. Original metrics are historical, not post-fix results.
2. [Post-fix report](postfix/CC-962-postfix-verification.md): three new repetitions of UC01 and UC02 with real provider/model calls. Provenance passes 6/6; answer quality is 4 pass and 2 partial; goals completed 6/6.
3. [All recordings](recordings.md): 143 GitHub-hosted videos, separated into original conversations, post-fix checks, and technical/recovery evidence. No videos are stored in Git history.
4. [English conversation reader](ca/ca-scenarios-reader-en.html): download this self-contained HTML to browse the original scored scenarios and expand the full English answers. [Plain Markdown transcripts](ca/UA02-r1/transcript-en.md) also work directly on GitHub.
5. [Technical audit and gap/recommendation report](scan/CC-962-rescan-report.md); [technical execution results](technical/CC-962-dev-results.md). Technical API/fault-injection cases are separate from natural user conversations.

## What changed in product code

Stationary Energy source candidates previously used catalogue coverage and start year, causing Clima to describe municipal São Paulo 2022 SEEG data as national data from 2015. The fix derives year/geography from the fetched-record request contract and preserves explicit country/region population downscaling. Exact emissions are unchanged. [Implementation and limitations](postfix/implementation-report.md). Old drafts need regeneration; this PR has not been deployed.

## Results and evidence boundaries

| Dataset | Evidence and interpretation |
|---|---|
| Real dev conversations, 1 Nov | 45 original conversations; four unsupported-feature scenarios archived rather than counted as supported-feature failures. Current scored denominator is 33. |
| Post-fix local stack with dev data, 2 Nov | Six complete conversations / 21 scripted user messages; isolated CA and fresh drafts. Exact I.1.1 kg correct 3/3. The short Mt display remains truncated in two answers. |
| Technical/fault cases | API, permission, commit and restart checks with synthetic fixtures; not substitutes for chat evaluation. |
| MLflow | [Original trace verification](ca/mlflow-verification.json), [original run IDs](ca/mlflow-evidence-final.json), [post-fix readback](postfix/mlflow-final-readback.json). Post-fix experiment 10: 43 auxiliary/scenario runs, all FINISHED; six evaluated conversations, not 43 scenarios. |
| Golden comparison | Frozen provider values / synthetic expected values are labelled. A real CC-950/CC-951 golden backtest remains deferred; no unsupported golden-parity claim. |

## Reusable scenario sets

- Real-user scenarios: [onboarding](ca/scenarios-onboarding.md), [analysis](ca/scenarios-analysis.md), [review](ca/scenarios-review.md), and their JSON files. Authored input remains in its original language; English questions and full answers are in each trial's transcript-en.md.
- [45 technical candidates and selection](scan/all-45-and-selection.json); [selected 15](scan/CC-962-selected-15.md); [selection rationale](scan/CC-962-selection-rationale.md).
- [Independent Astra audit](scan/astra-scan.md) and [Opus audit](scan/opus-scan.md). These original Polish technical reports are retained as source evidence; current user-facing conclusions are in the English reports above.

## Linked follow-ups

- [CC-1203 — Public-inventory write permissions](https://linear.app/openearth/issue/CC-1203)
- [CC-1204 — Private datasource read authorization](https://linear.app/openearth/issue/CC-1204)
- [CC-1205 — Preserve values on source-replacement failure](https://linear.app/openearth/issue/CC-1205)
- [CC-1206 — Reconcile partial commits](https://linear.app/openearth/issue/CC-1206)
- [CC-1207 — Idempotent save retries and history](https://linear.app/openearth/issue/CC-1207)
- [CC-1208 — Duplicate generation retries](https://linear.app/openearth/issue/CC-1208)
- [CC-1209 — Preview population scaling](https://linear.app/openearth/issue/CC-1209)
- [CC-1210 — Preserve kilogram units](https://linear.app/openearth/issue/CC-1210)
- [CC-1211 — Empty records with valid totals](https://linear.app/openearth/issue/CC-1211)
- [CC-1212 — Aggregate source records](https://linear.app/openearth/issue/CC-1212)
- [CC-1213 — Detect complete-total source conflicts](https://linear.app/openearth/issue/CC-1213)
- [CC-1214 — Available PDF upload guidance](https://linear.app/openearth/issue/CC-1214)
- [CC-1215 — Explain operation outcomes](https://linear.app/openearth/issue/CC-1215)
- [CC-1216 — Scope and data-understanding investigation](https://linear.app/openearth/issue/CC-1216)

## Validation

- Three targeted Jest suites pass: **16/16** on this delivery branch based on develop. [Execution log](postfix/delivery-branch-unit-check.txt).
- [Video manifest](media-manifest.json) records filenames, SHA-256, byte sizes, classification and GitHub asset URLs. [Post-fix duration/decode checks](postfix/artifact-verification.json) and [original checks](ca/video-decode-verification.json) are retained.
- No authentication state, credentials, raw service logs or .env files are included. Synthetic fixture IDs and public dataset records are evidence, not live secrets.
- Disposable fixtures and local processes were cleaned up; [persisted-state checks](postfix/persisted-state-final.json) and [cleanup evidence](postfix/cleanup-data.json) are available.
- [Packaging validation](package-validation.json) checks upload coverage, internal links, JSON and the absence of local-only links or committed media.

## Still open / not claimed

- Product and engineering have not yet reviewed the gap table or approved closure of CC-962.
- Shared dev/production deployment of the provenance fix has not been tested. Browser evidence was captured on the original local fix based on 9a74627e; the unchanged patch is cherry-picked onto develop for this PR and its 16 targeted tests pass here.
- Short display truncation persists: 1.11 Mt appears where nearest two-decimal rounding is 1.12 Mt. Exact kg stays correct.
- One post-fix UC01 run produced two working drafts from one consent; both have correct provenance. Root cause and introduction by this patch are unproven.
- An earlier reload/recovery lacked draft context and is archived separately; it does not establish a reproducible product defect.

[Linear CC-962](https://linear.app/openearth/issue/CC-962/agentic-flow-review-and-backtest-the-ghgi-journey) · [CC-953 ingestion spine](https://linear.app/openearth/issue/CC-953) · [CC-960 import rules](https://linear.app/openearth/issue/CC-960).
