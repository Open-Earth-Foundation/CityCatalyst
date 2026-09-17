# Bulk inventory file import — Chilean municipalities

**Audience:** product engineering + data  
**Scope:** `app/` admin bulk actions + existing GHGI import pipeline  
**First customer:** 380+ Chilean cities (comunas) that need inventory files loaded, not empty shells  
**Format (decided):** eCRF XLSX/CSV — one file per city. Deterministic `ECRFImportService` path; no AI interpretation.  
**Product constraint:** current GHGI file upload does **not** keep negative values (removals / sinks). Bulk import **must**. Fix the shared eCRF pipeline (IMP-013); do not special-case bulk.  
**Companion:** [`docs/MeedModuleMigration.md`](../../docs/MeedModuleMigration.md) workstream D (Chilean municipality onboarding)

This is the ticket breakdown for uploading and importing inventory files in bulk. CityCatalyst can already **create** hundreds of city + inventory shells from locodes. It cannot **fill** them from files without walking the single-city GHGI import wizard once per city.

Copy each ticket into Linear as its own issue.

---

## How to use this file

Suggested Linear fields:

| Field | Value |
| --- | --- |
| Labels | `ghgi`, `import`, `admin`, `chile`, `bulk` |
| Project | Chilean municipality onboarding (or GHGI import) |
| Estimate | T-shirt size in each ticket |
| Parent | Epic `IMP-000` |

IDs are planning keys (`IMP-xxx`), not Linear issue numbers.

---

## Context — what exists today

| Capability | Where | What it does | What it does not do |
| --- | --- | --- | --- |
| Bulk city + inventory **creation** | `POST /api/v1/admin/bulk`, `BulkInventoryCreationTabContent.tsx` | Creates `City` + empty `Inventory` rows for `locodes × years`, invites users, optionally connects third-party data sources | Does not accept files. Does not write `ActivityValue` / `GasValue` |
| Single-city file import | `POST /api/v1/city/{city}/inventory/{inventory}/import` then `/approve` | Upload one XLSX/CSV/PDF (max 20 MiB) to one inventory. Validate → optional AI interpret → human approve → background import | Per-inventory only. Interactive wizard. No zip. No city matching. No batch job |
| eCRF import | `FileValidatorService`, `ECRFImportService`, `InventoryImportService.importECRFData` | Parses GPC eCRF workbooks and writes activity/gas rows after approve | Wizard still requires a human approve click per file. Bulk job should auto-approve valid eCRF |
| File storage | `InventoryFileStorageService` + S3 | One `ImportedInventoryFile` per upload; `Inventory.hasOne(ImportedInventoryFile)` | No job table for a batch of files |
| Long-running admin jobs | `BulkHiapPrioritizationService` + cron | Async start, batch, poll status, retry failed, exclude cities | Pattern to copy — not file import |

The GHGI wizard (`ghgi-import-wizard.tsx`) is the right pipeline for **one** eCRF file. At 380 cities it is the wrong product: each file still needs upload, wait, and an approve click even though eCRF mapping is deterministic.

---

## Epic

### IMP-000 — Bulk-import inventory files for 380+ Chilean cities

**Type:** Epic  
**Size:** L–XL (phased; first Chile run is the success bar)  
**Owner:** product engineering + data

Paste the block below into Linear as the parent issue description.

---

#### Linear title

Bulk-import inventory files for 380+ Chilean cities

#### Linear description

Chile onboarding needs real GHGI inventories, not empty shells. The file pack is **eCRF** (XLSX/CSV, one file per city). Admin bulk-create (`POST /api/v1/admin/bulk`) can make cities and years. The GHGI import wizard can load **one** eCRF file into **one** inventory. There is no way to drop 380+ eCRF files (or a zip) onto a project and have CityCatalyst match, validate, import, and report failures.

**Problem**

Walking the wizard 380 times is not operable. eCRF import is already deterministic (`ECRFImportService` → `InventoryImportService.importECRFData`) — the approve click is ceremony at this scale. Request timeouts (`maxDuration` 30s on the upload route), the 20 MiB per-file cap, and the 200 req/min rate limiter all assume a single city. Many Chilean comunas have no UN/LOCODE (`CL ANT` vs INE codes like `CL13112`), which already blocks OpenClimate name lookup in bulk create.

**Goal**

An OEF-admin bulk action that:

1. Accepts a zip of eCRF files (optional CSV manifest) for one project and inventory year.
2. Matches each file to a city (filename convention and/or manifest).
3. Creates the city + inventory shell if missing (reuse `AdminService.createBulkInventories` behaviour).
4. Runs the **existing** eCRF pipeline in the background (do not rewrite `ECRFImportService` / `InventoryImportService`).
5. **Auto-approves valid eCRF.** Non-eCRF files fail the item with a clear error — no AI / Path B / BIOMATEC / CIRIS / PDF in this epic.
6. **Persists negative CO2e (removals).** AFOLU / land-use sinks in the eCRF must land as negative `ActivityValue.co2eq` / `InventoryValue.co2eq`. Today’s upload drops or ignores them; bulk import of 380 cities would bake that bug in. Fix once in `ECRFImportService` + `InventoryImportService` (IMP-013).
7. Shows progress, per-file success/fail, and retry.

**Approach**

Copy the bulk HIAP job shape: enqueue immediately, process in small batches, poll status, retry failed, exclude broken cities. Reuse S3 storage and `ImportedInventoryFile`. Add a batch/job table so 380 files are not 380 unrelated uploads with no roll-up.

**Success**

- One admin can start a Chile import and walk away.
- ≥95% of well-formed eCRF files for the Chile set complete without per-file UI.
- A fixture (and a real Chile sample) with **negative total CO2e** imports as a removal; GHGI results show it under removals (CC-580 / CC-749), not as zero / missing.
- Failures are a downloadable report (locode, filename, error), not a toast.
- A second run is idempotent: same digest + same inventory does not duplicate activity rows (or is an explicit replace).
- MEED / HIAP / dashboards can read the imported inventories through the normal inventory layer.

**Out of scope for this epic**

- Rewriting the single-city GHGI wizard
- BIOMATEC, CIRIS, PDF, near-eCRF adapters, or any LLM interpretation (Path B/C)
- Multi-city-in-one-workbook splitting (if a file is not single-city eCRF, fail the item)
- Changing GPC maths or emission-factor catalogues
- Full Global API coverage / HIAP bulk prioritization (separate)
- End-user (non-admin) bulk upload

**Docs:** `app/docs/BULK_INVENTORY_FILE_IMPORT_TICKETS.md`

---

**Non-goals (do not ticket as work in this epic):**

- Per-city mapping UI at 380 scale (eCRF does not need it)
- Replacing S3 or the 20 MiB single-file limit in v1 (zip of many ≤20 MiB eCRF files is the v1 shape)
- Shipping a public self-serve “upload your region” product

---

## Ticket index

| ID | Size | Title | Depends on |
| --- | --- | --- | --- |
| IMP-001 | S | Spike: Chile eCRF pack naming, year, city keys | — |
| IMP-013 | M | eCRF upload must persist negative values (removals) | IMP-001 (sample row) |
| IMP-002 | S | Decide locode / matching key for comunas without UN/LOCODE | IMP-001 |
| IMP-003 | M | Bulk import job model + status API | IMP-001 |
| IMP-004 | M | Match file → city + year (filename + optional manifest) | IMP-001, IMP-002 |
| IMP-005 | L | Upload zip to S3 and enqueue job (admin API) | IMP-003, IMP-004 |
| IMP-006 | L | Worker: reuse eCRF pipeline and auto-approve | IMP-005, IMP-013 |
| IMP-007 | M | Create missing city + inventory shells during the job | IMP-005, IMP-002 |
| IMP-008 | L | Admin UI: bulk file import tab, progress, retry | IMP-006, IMP-003 |
| IMP-009 | S | Dry-run (validate + match, do not write activities) | IMP-006 |
| IMP-010 | M | Failure report CSV + retry / skip | IMP-006 |
| IMP-011 | M | Jest coverage + small fixture pack | IMP-006, IMP-004 |
| IMP-012 | S | Chile production run playbook | IMP-008, IMP-010, IMP-002 |

---

## IMP-001 — Spike: Chile eCRF pack naming, year, city keys

**Type:** Spike  
**Size:** S  
**Priority:** P0 — first ticket; format is already eCRF

#### Linear title

Spike: eCRF file pack for 380+ Chilean cities (naming + city keys)

#### Linear description

**Decided:** files are GPC **eCRF** (XLSX/CSV). Do not re-open format. The remaining unknowns are how to match a file to a city and whether a sample imports cleanly today.

**Work**

- Obtain (or document the path to) the Chile eCRF set: file count, years, total bytes, typical size vs 20 MiB cap.
- Import 5–10 sample files through the existing single-city wizard. Confirm they detect as eCRF (not CIRIS/BIOMATEC), year in the file vs target year, and that approve → `importECRFData` succeeds.
- **Removals:** find at least one AFOLU / land-use row with negative total CO2e (or activity amount). Record the raw Excel cell, the value after `FileParserService`, and the stored `co2eq`. If it becomes `undefined` / `0` / skipped, that is IMP-013.
- Propose a **filename convention** (example: `CL-IQQ-2023.xlsx` or `{ine_comuna}_{year}.xlsx`) and/or a **manifest CSV** (`filename,locode,ine_code,city_name,year`).
- Confirm **one eCRF per city** (not a multi-city workbook). If any file is multi-city, list it; v1 will fail those items.

**Output**

A short note: matching key, year field, sample import result, any eCRF quirks (Spanish sheet names, empty GPC ref column, notation keys), and one removal-row before/after.

**Done when**

Engineering can implement IMP-004 without guessing filenames, and IMP-006 can assume `ECRFImportService` is the only importer.

### IMP-001 findings (2026-09-17 samples)

Inspected 9 `*_CRFFormat_*.xlsx` files from Downloads (not Chile locodes — Brazilian SEEG cities plus Abangares / Costa Rica). Same exporter shape we should assume for the Chile pack until a Chile zip lands.

| File | City | Year | Bytes | Data rows | AFOLU rows |
| --- | --- | --- | --- | --- | --- |
| Abadia de Goiás × 2022 / 2023 | Brazil | 2022, 2023 | ~37 KB | 41–48 | 18–24 |
| Abadia dos Dourados | Brazil | 2023 | 37 KB | 39 | 19 |
| Abangares | Costa Rica | 2017 | 39 KB | 160 (9 with totals; rest `NE`) | 0 |
| Abdon Batista | Brazil | 2021, 2023 | ~37 KB | 35–38 | 16–19 |
| Abel Figueiredo | Brazil | 2021, 2023 | ~37 KB | 37–39 | 18–20 |

**Filename:** `{City Name}_CRFFormat_{inventoryYear}_{yyyymmdd}.xlsx`  
Example: `Abadia de Goiás_CRFFormat_2023_20260917.xlsx`. City name has spaces + accents. Year is in the name **and** in column `Inventory year` (always matches in these files). Trailing date is export day — same city+year can appear twice (`20260909` and `20260917`); matcher should keep the latest export.

**Matching key:** no UN/LOCODE or INE code in the filename. IMP-004 must parse city name (NFKD) + year. A **manifest CSV** (`filename,locode,ine_code,city_name,year`) is still required to attach OpenClimate/HIAP locodes. One file = one city = one year (not multi-city). Several cities have **multiple year files** — job year vs file year must be an explicit policy (import into that year’s inventory, do not force the job default).

**Detection:** `isValid: true`, not CIRIS/BIOMATEC, `isMultiCity: false`. Sheets `eCRF_1`, `eCRF_2`, `eCRF_3`. Headers are English eCRF. **`adapterType` is `near-ecrf` (Adapter D)**, not Path A. Cause: `GPC ref. no.` column exists but is **100% empty**; `Notation key` column exists. Today’s upload route therefore uses `FormatAdapterService.toExtractedRows`, not `ECRFImportService.processECRFFile`. **IMP-006 as written (`not_ecrf` for adapters) would fail this entire pack.** Treat `eCRF_3` + CRF sector/subsector (Adapter D / near-eCRF) as the bulk happy path; still fail CIRIS / BIOMATEC / PDF / LLM Path B.

**Other quirks**

- Scope cells are `"Direct emissions"` / `"Indirect emissions"`, not `"1"` / `"2"` / `"3"`. Approve must use taxonomy scope from resolved GPC, not the file string.
- Subsectors like `On-road > Passenger car` need the existing ` > ` split + left-part fallback (`On-road` → II.1.1).
- Sector/subsector still resolve for Stationary Energy (e.g. Residential Buildings → `I.1.1`). Adapter D extracts all data rows.
- Source is `SEEG` (BR) or `Balances Energéticos` (CR). Activity units are often `MJ`.
- Well under 20 MiB (~37–39 KB each).

**Removals (IMP-013):** **no negative `totalCO2e` in these 9 files.** AFOLU rows are present and **all positive**. Keep IMP-013 on a synthetic `-239.5` fixture; re-check when a Chile (or later SEEG) file actually contains a sink.

**Wizard import:** not run end-to-end in a browser in this spike (files classified and Adapter D row counts confirmed in-process). Next: one sample through the GHGI wizard on a test city matched by name.

---

## IMP-013 — eCRF upload must persist negative values (removals)

**Type:** Bugfix on the shared import path (single-city wizard **and** bulk)  
**Size:** M  
**Priority:** P0 — product requirement; blocks a correct Chile bulk run  
**Depends on:** IMP-001 (one real removal row from the Chile pack)

#### Linear title

eCRF inventory upload must import negative CO2e (removals / sinks)

#### Linear description

Product: *the current upload inventory feature doesn't read negative values (removals). And this should.*

GHGI **results** already understand removals: negative `InventoryValue.co2eq` is a sink (CC-580), shown separately from gross emissions (CC-749). `InventoryImportService.importECRFData` even comments that negative `totalCO2e` is valid. The upload still does not keep those numbers in practice. Bulk-importing 380 Chilean eCRFs without a fix will silently drop AFOLU / land-use sinks.

Fix the **shared** pipeline (`FileParserService` → `FormatAdapterService.numVal` / `ECRFImportService.extractGasValue` → `InventoryImportService.importECRFData`). CRFFormat samples from IMP-001 are Adapter D (`near-ecrf`), so signed parsing must live there too, not only Path A. Do not add a bulk-only workaround. The single-city wizard must gain the same behaviour.

**Likely failure modes to check (do not assume which one it is)**

- Truthy empty-row checks such as `if (!co2 && !ch4 && !n2o && !totalCO2e)` — in JS `!0` is true, but confirm nothing uses `value > 0` or `Math.abs` drop.
- Excel / CSV encodings: unicode minus (`−`), accounting parentheses `(1,234)`, thousands separators, formula cells (`{ result: -n }`).
- Activity amount vs GHGs total: a negative **activity** with a blank total (or the reverse) skipped as “no gas values”.
- Tonne → kg via `decimalToBigInt` / `Decimal.trunc()` on negatives (trunc toward zero is OK; dropping the sign is not).
- Mapping / review UI hiding negative example cells so it *looks* unread even if stored.

**Work**

- Reproduce with a tiny eCRF fixture: one GPC V (AFOLU) row with `totalCO2e = -239.5` (tonnes) and the Chile sample from IMP-001.
- Parse and import through the real services (not only a unit of `Number()`).
- Persist negative kg on both `ActivityValue.co2eq` and rolled-up `InventoryValue.co2eq`.
- GET inventory results: that sector’s `removalsCo2eq` / `removalsTotal` is non-zero; net total is lower than gross.
- Keep `totalCO2e === 0` as empty/notation-key behaviour (do not treat 0 as a removal).
- Single-city wizard: mapping/review still shows the negative number (or “removal”), not a blank.

**Out of scope**

- Redesigning the stacked emissions chart for negative sectors (already guarded in `EmissionBySectorChart`).
- Changing GWP / calculation of gases from activity × EF (if the eCRF already supplies total CO2e, persist that signed total).

**Done when**

Jest covers a negative eCRF row end-to-end. A Chile sample removal row from IMP-001 survives the single-city wizard. IMP-006 can call the same importer without extra sign logic.

---

## IMP-002 — Locode / matching key for comunas without UN/LOCODE

**Type:** Product + data decision (small engineering follow-up)  
**Size:** S  
**Priority:** P0 — blocks city create and Global API / HIAP-MEED lookups  
**Related:** `MeedModuleMigration.md` open question B

#### Linear title

Decide city identity for Chilean comunas without a UN/LOCODE

#### Linear description

`AdminService.createBulkInventories` looks up the city name in OpenClimate by locode and **throws** if missing. `hiap-meed` validates `^[A-Za-z]{2}\s[A-Za-z]{3}$`. The MEED prototype already uses INE-style keys such as `CL13112` (La Pintana). UN/LOCODE covers only a fraction of ~345–380+ comunas.

**Decision needed**

Pick one matching key for import (and store it on `City`):

- UN/LOCODE where it exists (`CL IQQ` / `CLIQQ`), **plus** a documented fallback (INE comuna code), or
- Always INE code in a dedicated field, locode nullable, or
- A mapping table `ine_code ↔ locode ↔ city_name` checked into the repo / seeders.

**Work after the decision**

- Persist the chosen key so bulk import does not depend on OpenClimate returning a name.
- Document how filenames/manifest map to `City.locode` (and any new column).

**Done when**

IMP-007 can create a city for every row in the Chile list, including comunas with no UN/LOCODE.

### IMP-002 proposed decision (from IMP-001 samples)

CRFFormat filenames carry **city name + year only** (`Abadia de Goiás_CRFFormat_2023_20260917.xlsx`). No UN/LOCODE or INE code.

**Proposal for IMP-004 / IMP-007 (pending product sign-off):**

1. Match files by **normalized city name** (NFKD, case-insensitive) + inventory year.
2. Require a **manifest CSV** to attach identity: `filename,city_name,year,locode,ine_code` (locode nullable).
3. Persist `City.locode` as UN/LOCODE when the manifest has one (`CL IQQ`); otherwise store INE (`CL13112`) in `locode` for now **or** add `ineCode` — product picks. Do not call OpenClimate as a hard requirement to create the city; use it only to enrich name when locode exists.
4. Same city + year + newer export date replaces the older file in the zip.

Until product confirms (3), IMP-004 can land as a pure matcher (name + year + manifest) without writing cities.

---

## IMP-003 — Bulk import job model + status API

**Type:** Backend  
**Size:** M  
**Depends on:** IMP-001 (job payload shape)

#### Linear title

Add a bulk inventory-file import job (model + status API)

#### Linear description

Single `ImportedInventoryFile` rows have no batch. Admin cannot answer “where is the Chile upload?” Copy the bulk HIAP idea: one job, many items, statuses, retry.

**Work**

- New Sequelize models + `.cjs` migrations (UUID PKs, `created` / `lastUpdated`, register in `init-models.ts`):
  - `BulkInventoryImportJob`: `projectId`, `year`, `userId`, `status` (`pending` / `matching` / `importing` / `completed` / `failed` / `cancelled`), counts, optional `s3Key` for the zip, options (`dryRun`, `createMissingCities`, `replaceExisting`). Valid eCRF is always auto-approved; no format flag.
  - `BulkInventoryImportItem`: `jobId`, `originalFileName`, `s3Key`, matched `cityId` / `inventoryId` / locode, `importedFileId`, `status`, `errorLog`.
- Admin-only API via `apiHandler` + `UserService.ensureIsAdmin`:
  - `GET /api/v1/admin/bulk-inventory-import?projectId=` — latest job + item roll-up
  - `GET /api/v1/admin/bulk-inventory-import/{jobId}` — items (filter by status)
- Do **not** change `Inventory.hasOne(ImportedInventoryFile)` in this ticket unless a city already has a file and `replaceExisting` is required — if so, document the policy (new file wins; old row failed/superseded).

**Done when**

A job and items can be created in tests and listed by an admin session without uploading files yet.

**Implementation notes (2026-09-17)**

- Tables `BulkInventoryImportJob` / `BulkInventoryImportItem`; GET `/api/v1/admin/bulk-inventory-import?projectId=` (latest job + counts) and `GET /{jobId}` (items, optional `status=`).
- `replaceExisting` is stored on the job. Policy for IMP-006: new file wins; mark the previous `ImportedInventoryFile` failed/superseded. `Inventory.hasOne(ImportedInventoryFile)` is unchanged here.

---

## IMP-004 — Match file → city + year

**Type:** Backend  
**Size:** M  
**Depends on:** IMP-001, IMP-002

#### Linear title

Match bulk-upload filenames (and optional manifest) to city + inventory year

#### Linear description

The worker must not guess. Matching is a pure function.

**Work**

- `BulkInventoryImportMatcher` (name as you like) in `src/backend/`:
  - Parse filename per the convention from IMP-001.
  - If a manifest CSV is present in the zip, it wins over filename.
  - Resolve to an existing `City` in the target `projectId`, or return `unmatched`.
  - Resolve year: manifest → filename → job default year; warn if file-inferred year ≠ inventory year (same rule as single-city eCRF import).
- Explicit errors: `unmatched_city`, `ambiguous_city`, `missing_year`, `unsupported_extension` (not xlsx/csv), `file_too_large`.
- Spanish / accented filenames: normalize (NFKD) so `Concón` still matches.

**Done when**

Unit tests cover: locode filename, INE filename, manifest override, unknown city, wrong extension, year mismatch warning.

**Implementation notes (2026-09-17)**

- `BulkInventoryImportMatcher` is a pure function: CRFFormat `{City}_CRFFormat_{year}_{yyyymmdd}`, UN/LOCODE, and INE filenames; manifest CSV wins per field; NFKD name match; year is manifest → filename → job default (file year is kept; `year_mismatch` warning if it differs). `pickLatestExports` keeps the newest CRFFormat export date for the same city+year.

---

## IMP-005 — Upload zip to S3 and enqueue job

**Type:** Backend  
**Size:** L  
**Depends on:** IMP-003, IMP-004

#### Linear title

Admin API: upload a zip of inventory files and enqueue a bulk import job

#### Linear description

A multipart POST of 380 × 20 MiB cannot run inside one Next handler (`maxDuration` 30s on today’s import route). V1: one zip of eCRF XLSX/CSV files uploaded to S3, unpacked server-side (or by a worker), one `BulkInventoryImportItem` per inner file.

**Work**

- `POST /api/v1/admin/bulk-inventory-import` (multipart): `projectId`, `year`, `file` (zip), flags from IMP-003.
- Store the zip with `InventoryFileStorageService` (same bucket/prefix family as inventory files; distinct key prefix e.g. `bulk-import/{jobId}/`).
- Return **202** with `{ jobId, itemCount, unmatchedCount }` after the zip is stored and items are inserted (`pending` / `unmatched`). Do not import in the request.
- Reject non-zip, empty zip, files over 20 MiB inside the zip, path traversal (`../`), and more than a documented max (suggest 500 files / ~2 GiB zip — enough for 380+ with headroom).
- Rate limit: this is admin-only; still avoid looping 380 inner uploads through the public import route (that would hit 200 req/min). The worker should call services in-process.

**Out of scope**

Browser folder-picker of 380 loose files without zip (nice-to-have later). Multipart of many files is worse for timeouts.

**Done when**

Admin can POST a small zip (3 fixtures) and GET the job with 3 items, no activity rows written yet.

**Implementation notes (2026-09-17)**

- `POST /api/v1/admin/bulk-inventory-import` (multipart: `projectId`, `year`, `file`, optional flags). Returns **202** `{ jobId, itemCount, unmatchedCount }`. Matching runs in-process; import does not.
- Zip limits: `.zip` only, 500 inner files, 2 GiB archive, 20 MiB per inner file, reject `../` / absolute paths. Skip `__MACOSX` / `.DS_Store`. Optional root `manifest.csv`.
- S3 keys: `bulk-import/{jobId}/archive.zip` and `bulk-import/{jobId}/files/{name}`. When S3 is unset, items are still inserted (`s3Key` null) so local tests can enqueue.

---

## IMP-006 — Worker: reuse eCRF pipeline and auto-approve

**Type:** Backend  
**Size:** L  
**Depends on:** IMP-005, IMP-013  
**Do not:** copy-paste the import route. Extract a function both the route and the worker call if needed.

#### Linear title

Process bulk eCRF imports through ECRFImportService (auto-approve)

#### Linear description

For each `pending` item, run the same path as `POST .../import` + `POST .../import/approve` for **eCRF**, without a browser. Skip the mapping UI.

**Work**

- Batch size small (e.g. 5–10 files) so one cron/worker tick cannot stall the app. Follow `BulkHiapPrioritizationService` + existing cron pattern (`api/v1/cron/...`) if the process is long; a `after()` / background continuation is acceptable only if it is reliable in k8s (today’s single-file import already backgrounds validation).
- For each file: validate (`FileValidatorService`) → parse → if it is eCRF, auto-approve and `InventoryImportService.importECRFData` (same as the approve route). Persist `ImportedInventoryFile` + S3 object per city.
- If validation says CIRIS, BIOMATEC, PDF, adapter-only, or unknown: **fail the item** (`not_ecrf`) with the detected type. Do not call OpenAI.
- Concurrency: **one file at a time per job** in v1 (safer for DB). Optional small parallelism later.
- Idempotency: if `contentDigest` already completed for that `inventoryId`, skip or replace per job flag (see IMP-003). Do not double-insert activities.
- Year mismatch (file year ≠ inventory year): fail or warn per the same rule as single-city eCRF import; surface it on the item.
- Never import a file with `isMultiCity: true` into a single city — fail the item.

**Done when**

A 3-file eCRF zip completes with `ActivityValue` rows on the right inventories, including a negative-CO2e (removal) row whose `co2eq` stays negative. A non-eCRF fixture fails the item with `not_ecrf` and does not call OpenAI.

**Implementation notes (2026-09-17)**

- Worker accepts Path A eCRF **and** Adapter D (`near-ecrf`) — Chile CRFFormat packs are near-ecrf. CIRIS / BIOMATEC / PDF / other adapters fail `not_ecrf` with no OpenAI.
- `POST /api/v1/cron/process-bulk-inventory-import` (Bearer `CC_CRON_JOB_API_KEY`), batch of 8, one file at a time. Inner file bytes live on S3 or item `data` (dev fallback).
- Same `contentDigest` + completed inventory → skip. `replaceExisting` supersedes the previous `ImportedInventoryFile` and replaces inventory values.

---

## IMP-007 — Create missing city + inventory shells during the job

**Type:** Backend  
**Size:** M  
**Depends on:** IMP-005, IMP-002

#### Linear title

Optionally create missing Chilean cities and inventories during bulk file import

#### Linear description

Today bulk create and file import are two admin steps. For 380 cities, the job should do both when `createMissingCities` is true.

**Work**

- Reuse `AdminService` city + inventory creation (GPC basic vs basic+, GWP AR5/AR6, `projectId`, invited admin emails) instead of a second code path.
- Do **not** require OpenClimate for the name if IMP-002 stored a name in the manifest / mapping table. Keep OpenClimate as enrichment when the locode exists.
- Population / boundary backfill can stay best-effort (same as current bulk create) and must not fail the file import.

**Done when**

A zip for a locode that is not yet in the project creates the city + inventory, then imports. A second run does not duplicate the city.

**Implementation notes (2026-09-17)**

- `AdminService.findOrCreateCityAndInventory` creates/reuses a city in the project by locode (UN/LOCODE or INE in `City.locode`) or NFKD name. OpenClimate name/population/boundary is best-effort and never fails the item.
- Enqueue with `createMissingCities` turns `unmatched_city` into a pending item after creating the shell. Matched cities still get a missing inventory year created. Job stores `inventoryType` / `globalWarmingPotentialType` (defaults `gpc_basic` / `ar6`). The uploading admin is added as `CityUser`.
- Locode already in another project fails the item (`city_in_other_project`). Missing name+locode stays `unmatched` (`missing_city_identity`).
- Dry-run (IMP-009) ignores `createMissingCities` and does not create inventory years.

---

## IMP-008 — Admin UI: bulk file import tab

**Type:** Frontend  
**Size:** L  
**Depends on:** IMP-006, IMP-003  
**Where:** `src/app/[lng]/admin/` bulk-actions tabs (sibling of `BulkInventoryCreationTabContent` / `BulkHiapPrioritizationTabContent`)

#### Linear title

Admin tab to upload a zip and watch bulk inventory file import

#### Linear description

**Work**

- New tab `bulk-inventory-file-import` on the admin bulk-actions list (replace one of the disabled placeholders or add beside creation).
- Form: project, year, inventory type, GWP, zip dropzone of eCRF files, checkboxes (create missing cities, replace existing, dry-run). Caption: eCRF XLSX/CSV only; non-eCRF files will fail.
- After submit: poll job status. Show counts (pending / importing / completed / failed / unmatched). Table of items with filename, locode, status, error snippet.
- i18n: English keys only (`admin.json`), kebab-case. Do not hardcode user-facing strings.
- Chakra v3 semantic tokens; reuse `FileUpload*` primitives.
- No per-row mapping editor. Failed eCRF validation is fixed by replacing the file and retrying, not by the GHGI wizard.

**Done when**

An OEF admin can complete a 3-file happy path from the UI without using curl.

**Implementation notes (2026-09-17)**

- Tab `bulk-inventory-file-import` on admin bulk-actions (beside creation). Form: project, year, GPC type, GWP, zip dropzone, create-missing / replace / dry-run. Polls `GET /{jobId}` every 5s while pending/importing and shows counts plus a per-file table.

---

## IMP-009 — Dry-run (validate + match, do not write activities)

**Type:** Backend + small UI flag  
**Size:** S  
**Depends on:** IMP-006

#### Linear title

Dry-run mode for bulk inventory file import

#### Linear description

Chile’s first 380-file drop will have naming and eCRF-sheet surprises. Dry-run must unpack, match, validate as eCRF, and return the same report **without** creating activity rows (city/inventory create should also be off or rolled back — prefer off).

**Done when**

`dryRun: true` leaves `ActivityValue` counts unchanged and still produces unmatched/invalid item errors.

**Implementation notes (2026-09-17)**

- Dry-run unpacks, matches, and validates eCRF / near-ecrf the same as a real run. Valid files are `skipped` with `errorCode: dry_run`. Invalid files still fail (`not_ecrf`, `multi_city`, …). Unmatched filenames stay `unmatched`.
- No `ActivityValue` / `ImportedInventoryFile` writes. `createMissingCities` and missing-year inventory shells are not written even if the flags are set. API form field `dryRun`; the admin checkbox lands with IMP-008.

---

## IMP-010 — Failure report CSV + retry / skip

**Type:** Backend + UI  
**Size:** M  
**Depends on:** IMP-006

#### Linear title

Download bulk-import failures and retry or skip items

#### Linear description

**Work**

- `GET /api/v1/admin/bulk-inventory-import/{jobId}/report` → CSV: filename, locode, city name, status, error, importedFileId.
- `PATCH` retry failed items (after a filename/manifest fix or a replaced eCRF in the zip / per-item re-upload).
- Skip / exclude an item so the job can complete with known bad files (same idea as bulk HIAP `excludedCityLocodes`).

**Done when**

Data can fix three bad filenames, retry, and the job reaches `completed` with those three skipped or succeeded.

---

## IMP-011 — Tests

**Type:** Test  
**Size:** M  
**Depends on:** IMP-006, IMP-004

#### Linear title

Jest coverage for bulk inventory file import

#### Linear description

Follow `tests/api/import-routes.jest.ts`, `tests/api/admin.jest.ts`, `tests/helpers.ts`. No Playwright required for v1 (admin-only).

**Work**

- Matcher unit tests (IMP-004).
- API: non-admin 403; zip enqueue 202; dry-run writes no activities; eCRF fixture imports; digest skip; non-eCRF and multi-city files fail the item.
- **Removals:** eCRF fixture with negative `totalCO2e` stores negative kg and shows up in results `removalsTotal` (IMP-013; also run through the bulk worker).
- Keep fixtures tiny (one-sheet eCRF stub), not a 20 MiB Chile file. No OpenAI mocks required for the happy path.

**Done when**

`npx jest --testPathPattern=bulk-inventory-import` is green in CI.

---

## IMP-012 — Chile production run playbook

**Type:** Ops / data  
**Size:** S  
**Depends on:** IMP-008, IMP-010, IMP-002

#### Linear title

Playbook: first bulk import of 380+ Chilean inventory files

#### Linear description

Not a code ticket. After IMP-008:

1. Dry-run on staging with the real zip.
2. Fix unmatched names (mapping table).
3. Full import on staging; spot-check 5 cities in the GHGI UI (totals vs source file), including at least one city with AFOLU **removals** (net vs gross, not “missing row”).
4. Production: job on the CORFO / Chile project; keep the zip and report in S3.
5. Re-export / fix any `not_ecrf` or validation failures offline, then retry those items.

Record locode gaps, eCRF quirks, and duration so the next country pack is a config change, not a rewrite.

**Done when**

The Chile project has imported inventories for the agreed city set, with a written exception list for the rest.

---

## Risks (read before scheduling)

1. **Locode scheme (IMP-002)** — if this slips, bulk create still throws `Failed to query city name from OpenClimate` for most comunas.
2. **Removals dropped on upload (IMP-013)** — product confirmed the current wizard does not read negatives. Shipping bulk first would write 380 inventories without sinks. Fix the shared importer before IMP-006.
3. **eCRF validity at scale** — a few sample wizard imports are not 380 files. Dry-run (IMP-009) must catch sheet/column drift before writing activities.
4. **One-file-per-inventory association** — `Inventory.hasOne(ImportedInventoryFile)` makes re-import policy mandatory (replace vs reject).
5. **Timeouts and memory** — unpacking a large zip in the Next process can OOM; stream to S3 and process entries sequentially.
6. **Idempotency** — a retried job must not duplicate GHGI activity rows.
7. **Do not block MEED UI on this epic** — `MeedModuleMigration.md` already recommends shipping the module against a verified subset; this epic is the rolling data operation that fills the rest.

---

## Suggested Linear labels and estimates

| ID | Estimate | Priority |
| --- | --- | --- |
| IMP-000 | Epic | P0 |
| IMP-001 | S (1–2 days) | P0 |
| IMP-013 | M | P0 — before bulk worker |
| IMP-002 | S (decision) | P0 |
| IMP-003 | M | P1 |
| IMP-004 | M | P1 |
| IMP-005 | L | P1 |
| IMP-006 | L | P1 |
| IMP-007 | M | P1 |
| IMP-008 | L | P1 |
| IMP-009 | S | P2 (do before Chile prod) |
| IMP-010 | M | P1 |
| IMP-011 | M | P1 |
| IMP-012 | S | P0 once code is in |

Build order: **001 → 013 in parallel with 002 → 003+004 in parallel → 005 → 006+007 → 009 → 008+010+011 → 012**. Do not start IMP-006 until a negative eCRF row round-trips.
