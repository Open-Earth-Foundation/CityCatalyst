# Native Document Storage Architecture

> Draft for [CC-553](https://linear.app/openearth/issue/CC-553/create-architecture-for-agentic-native-document-storage) · 2026-07-22  
> Status: **draft for stakeholder review** (updated 2026-07-29 after architecture check with Mirco / Piotr)

## One-line intent

CityCatalyst **modules** own city-provided documents and structured intakes (owner = module where the user uploaded / committed). Climate Advisor (Clima) never holds S3 keys; it discovers inputs via a **CityCatalyst Core** pointer catalog and reads via **typed capabilities** (and optional Markdown access).

### Clear goal (why this exists)

Make it easy to **discover** everything a city (or org) has uploaded or generated — at any module, at any time — **without** Climate Advisor (or the frontend) querying five services one by one (“do you have data?” × N).


| With `NativeInputCatalog`                                                          | Without it                                                        |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| One **lookup table** in CC Core: what exists, who owns it, scope, where to resolve | CA must ask each module individually                              |
| Then request only the needed items via existing CC auth + capabilities             | No single place to list “all inputs we hold” for settings / Clima |


Secondary benefit: the same lookup can power a future CC frontend view (e.g. settings — “all data we have about this city/org”), including manage/delete flows later.

Today many flows already know the target module; the catalog matters as modules and uploads grow (e.g. CNB).

### What this draft is (and is not)


| This draft **is**                                                                        | This draft **is not**                                          |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Ownership + access + **discovery** layer for city-native intakes and generated artifacts | The Stationary Energy ↔ CNB **context-exchange** design itself |
| A **CC Core** catalog (lookup), plus module SoTs that still hold the real data           | A mega-database that copies every file/JSON into one store     |
| Prerequisite for later SE ↔ CNB / city-wide reuse                                        | Climate Advisor owning the catalog or S3 credentials           |


The **context bundle** (already how CA scopes context per service) **consumes** this layer — it is not the input store.

**Naming note:** Ticket title keeps “Native document storage.” In-architecture name: **`NativeInputCatalog`** — files **and** structured / generated city data, not only PDF bytes.

---



## Where the catalog lives (decision)

**`NativeInputCatalog` lives in CityCatalyst Core** as an explicit **lookup table** in the **CC core database** (synced in the 2026-07-28 architecture check) — not in Climate Advisor, not as a separate microservice that owns city data, and not as a facade-only layer over module tables.


| Option                                        | Verdict  | Why                                                                                                                                                                                         |
| --------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CC Core lookup table (chosen)**             | ✅        | Auth already lives in CC (JWT / module access). One register/lookup place for discovery. Modules keep SoTs; catalog stores pointers + owner + scope. Schema/migrations with Milan / Amanda. |
| Catalog owned by Climate Advisor              | ❌        | CA should not become the system of record for “what the city uploaded.” Frontend/settings also need this list.                                                                              |
| Separate catalog microservice with its own DB | ❌ for v1 | Risks bypassing CC auth (“query Mirco’s files without CC checks”).                                                                                                                          |


**Auth reminder:** A row in the catalog means “this input exists.” It does **not** grant access. CC still verifies that the CA request (on behalf of a user) may read that module/file. Capability wrappers still decide what enters a given context bundle.

---



## Two kinds of city data (both register)

Everything discoverable by Clima should appear in `NativeInputCatalog`. We split conceptually. The product modules in play are the original three intakes (**GHGI**, **HIAP / HIAP-MEED**, **CNB**) — same story as Mirco’s ask, without a separate “scope” section.


| Kind                    | Examples (by module)                                                                                                              | Owner                     | SoT                      | Clima read                                                                                                                                                          | Catalog                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **City inputs**         | **GHGI:** inventory PDF/CSV/XLSX · **CNB:** CAP, budget, letters… · **HIAP/MEED:** prefs, exclusions, selections the user commits | Module of upload / commit | Module DB + S3 for files | **GHGI** default = structured inventory (**Path A**); optional later Markdown via pointer · **CNB** docs = **Path B** (excerpts) · **HIAP/MEED** prefs = **Path A** | Register pointer + owning module + scope                           |
| **City generated data** | **HIAP / HIAP-MEED:** rankings, selected actions, output plans (and similar module-produced artifacts)                            | Module that produced it   | Module DB (structured)   | **Path A**                                                                                                                                                          | Register pointer so Clima can discover without knowing every table |


**Both kinds must be registered** in `NativeInputCatalog` when they become durable / “finished” enough to reuse (see HIAP option A below).

HIAP and HIAP-MEED stay **conceptually similar** for Path A, but **different services / schemas / storage** in implementation — do not merge them into one table by accident.

**Registration path:** different modules, **same catalog contract** (one register/lookup pattern into CC Core). Diagram arrows from modules → catalog are the same kind of registration, not three different architectures.

**Outside this catalog:** `global-api` remains an optional Clima resource (mostly shared / non-city-specific), capability-scoped — confirm datasets with product + data.

**Related:** [ConceptNoteBuilderArchitecture.md](./ConceptNoteBuilderArchitecture.md), [AgenticModuleScope.md](./AgenticModuleScope.md).

---



## DoD diagrams



### 1) Write path — persist + register

```mermaid
flowchart TB
  subgraph CityData["1. City data"]
    Inputs["City inputs<br/>files · prefs · exclusions · selections"]
    Generated["City generated data<br/>rankings · selected actions · plans"]
  end

  subgraph Modules["2. Modules hold the SoT"]
    GHGI["GHGI<br/>inventory rows<br/>+ files in S3 if any"]
    HIAP["HIAP / HIAP-MEED<br/>prefs · rankings · plans"]
    CNB["CNB<br/>uploads · OCR markdown in S3"]
  end

  Catalog["3. CC Core · NativeInputCatalog<br/>lookup row: what / where / owner / scope"]

  Inputs --> GHGI
  Inputs --> HIAP
  Inputs --> CNB
  Generated --> HIAP

  GHGI -->|"register pointer"| Catalog
  HIAP -->|"register pointer"| Catalog
  CNB -->|"register pointer"| Catalog
```





### 2) Read path — who consumes the catalog

Clima is the consumer. It **queries** `NativeInputCatalog`, then **requests** Path A / Path B. (Top → bottom = asker → lookup → fetch → bundle.)

```mermaid
flowchart TB
  Clima["Clima needs context<br/>for a city / org / service run"]
  Catalog["Queries NativeInputCatalog<br/>CC Core lookup · what exists?"]
  Discover["Picks relevant rows<br/>capability wrapper scopes access"]

  subgraph Paths["Then requests data via CC auth"]
    PathA["Path A<br/>structured JSON<br/>from module SoT"]
    PathB["Path B<br/>markdown bytes<br/>owning module reads S3<br/>Clima never gets S3 keys"]
  end

  Bundle["Context bundle per service<br/>wrapper decides what loads"]
  GlobalAPI["global-api optional<br/>not in catalog"]

  Clima --> Catalog
  Catalog --> Discover
  Discover --> PathA
  Discover --> PathB
  PathA --> Bundle
  PathB --> Bundle
  GlobalAPI -.-> PathA
```





### How to read this (30 seconds)

1. **Write:** city data → module SoT → **register** a pointer in `NativeInputCatalog` (CC Core).
2. **Read:** Clima **queries** the catalog (consumer), picks allowed rows, then **requests** Path A (JSON) and/or Path B (markdown).
3. S3 lives **under** GHGI/CNB ownership — no separate S3 box. Path B = module fetches markdown; Clima never gets keys.
4. Catalog link ≠ access granted.
5. `global-api` is optional and outside the catalog.

---



## Ownership


| Input / artifact                      | SoT                                               | Owner (module)                                                   | Clima access                                                |
| ------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| GHGI PDF + OCR `.md`                  | S3 + GHGI import / `PdfOcrJob`                    | **GHGI**                                                         | Path A default (inventory); Markdown when capability allows |
| CNB uploads                           | S3 + CNB upload rows                              | **CNB**                                                          | Path B / markdown request → excerpts                        |
| File uploaded in another module later | That module’s rows + S3                           | **That module**                                                  | Same pattern                                                |
| HIAP finished state                   | Ranking, ≤3 selected actions, output plan (in CC) | **HIAP**                                                         | Path A (`hiap.summary`)                                     |
| HIAP-MEED finished state              | Prefs, exclusions, + ranking / selections / plan  | **HIAP-MEED** (compute may run in hiap-meed; durable rows in CC) | Path A (MEED-aware fields); **separate schema**             |
| global-api datasets                   | global-api                                        | global-api                                                       | Optional Path A tools — **not** catalog rows                |
| Context bundle                        | CA / datateam CNB DB for CNB runs                 | CA orchestrates                                                  | Internal                                                    |


**Hard rules**

1. Clima never gets S3 keys or signed URLs for source/OCR objects.
2. **Owner = module** of upload or generation; store on catalog metadata. Readers use capability — they do not become owner.
3. Files in S3 **may** be readable cross-module later — only via catalog + CC auth + capability.
4. Path B is opt-in; today mainly CNB; extendable to other module-owned files.
5. Re-upload = new immutable id.
6. No cross-DB FKs — API IDs only. Modules stay self-contained; enrichment is additive.
7. **`NativeInputCatalog` is CC Core** — not CA-owned.

---



## How Clima gets access

In practice there are only two moments:

1. **Something durable happens in a module** → module saves its SoT **and** inserts a row in `NativeInputCatalog`.
2. **Clima needs context** → queries the catalog, picks allowed rows (capability wrapper), then **requests** either structured JSON (**Path A**), markdown (**Path B**), or both.

Clima never receives S3 keys. A catalog row only answers “what exists / where / who owns it.”

### Example 1 — GHGI inventory (Path A)

1. City uploads a 2024 inventory PDF in **GHGI**.
2. GHGI runs OCR / row extract, stores the approved inventory numbers in its DB (and the file in S3 as the source artifact).
3. GHGI **registers** a catalog row, e.g. kind=`inventory_import`, owner=`ghgi`, pointer to inventory id (+ optional file id).
4. Later, Clima (e.g. Stationary Energy) queries the catalog for that city, sees the GHGI row, and calls the existing capability (e.g. `emissions-context`).
5. GHGI returns **bounded JSON** (totals / sectors). That is **Path A** — numbers from the inventory SoT, not “read the PDF in the prompt.”

Optional later: if a CA step needs prose from the OCR markdown, Clima can request **Path B** for that same catalog file pointer still via GHGI, still without S3 keys.

### Example 2 — HIAP / HIAP-MEED finished state (Path A)

1. User generates a ranking, selects up to 3 actions, maybe an output plan; on MEED also saves prefs + exclusions.
2. Those finished states are stored in the HIAP / HIAP-MEED tables in CC.
3. Module **registers** catalog rows for those artifacts (owner=`hiap` or `hiap-meed`).
4. Clima queries the catalog, then requests something like `hiap.summary` and gets JSON (selected actions, prefs, exclusions, …).


| Service       | What Path A should expose (option A)                  |
| ------------- | ----------------------------------------------------- |
| **HIAP**      | Last ranking; up to 3 selected actions; output plan   |
| **HIAP-MEED** | City prefs; exclusions; + ranking / selections / plan |


Same idea for Path A; **separate schemas** in implementation.

### Example 3 — CNB supporting PDF (Path B)

1. City uploads a Climate Action Plan inside **CNB**.
2. CNB queues OCR, stores markdown in S3, keeps upload metadata in its SoT.
3. CNB **registers** a catalog row (owner=`cnb`, `markdown_ready=true`, pointer to upload id).
4. Clima for that CNB run queries the catalog, sees the CAP row, and **requests markdown** from the CNB module.
5. CNB reads S3 internally and returns markdown bytes (+ hash / ids). Clima keeps **excerpts** in the run’s context bundle.

That is **Path B**. Prefs/rankings are not Path B — they stay Path A (Example 2).

### Example 4 — Same run, both paths

CNB drafting a concept note might:

1. Query catalog → find GHGI inventory + HIAP selections + CAP upload.
2. **Path A** for emissions + selected actions.
3. **Path B** for CAP excerpts.
4. Load only what the capability wrapper allows into the CNB context bundle.

`global-api` can still feed optional Path A tools; it is **not** listed in `NativeInputCatalog`.

Contracts for Path A align with [AgenticModuleScope](./AgenticModuleScope.md). Live GHGI capabilities already exist under `/api/v1/internal/ca/capabilities/ghgi/…`. CNB may keep a `POST .../markdown` shape as transport; the model is always **Clima requests / CC module responds**.

---



## Downstream

```mermaid
flowchart LR
  Cat["NativeInputCatalog<br/>CC Core"] --> Cap["Capability / context wrapper"]
  Cap --> Bundle["Per-service context bundle"]
  Bundle --> SE["Stationary Energy"]
  Bundle --> CNBw["Concept Note Builder"]
  Bundle --> Recs["Future suggestions"]
```



Catalog informs **availability**; wrappers enforce **scope**. Services stay self-contained and can be enriched when another module’s input is allowed.

---



## Current vs target


| Area             | Now                                                | Target                                                |
| ---------------- | -------------------------------------------------- | ----------------------------------------------------- |
| Discovery        | Query modules ad hoc / know in advance what to ask | **CC Core** `NativeInputCatalog` lookup               |
| GHGI             | S3 + OCR + inventory Path A                        | Same SoT; catalog registers file + inventory pointers |
| HIAP / HIAP-MEED | Finished states partly in CC                       | Catalog registers those artifacts; Path A summaries   |
| CNB              | Ingest; storage adapter pending                    | Owner CNB; register uploads; markdown request         |
| global-api       | Separate                                           | Remains outside catalog; optional capabilities        |
| Frontend         | No unified “all uploads” view                      | Can reuse catalog later (settings)                    |


---



## Integration — no breaking changes


| Keep                        | Extend                                              |
| --------------------------- | --------------------------------------------------- |
| Module SoTs + `PdfOcrJob`   | Register into CC Core catalog                       |
| GHGI capability routes      | `hiap.summary` (+ MEED); optional markdown request  |
| Per-service context bundles | Feed discovery from catalog                         |
| CC auth / JWT checks        | Catalog lookups + fetches stay inside that boundary |


Suggested follow-ups: catalog table + register API (with Milan) · scoping with product · HIAP/MEED Path A · CNB markdown + [CC-570](https://linear.app/openearth/issue/CC-570/placeholder-implementation) · global-api shortlist · CA “summarize all my context” tool · S3 retention policy with product.

---



## Constraints


| Constraint             | Note                                             |
| ---------------------- | ------------------------------------------------ |
| ~20 MB PDF working cap | Ops plan for larger files                        |
| S3 for OCR             | Missing bucket → 503                             |
| Auth                   | CC module / city / org checks + capability scope |
| Versioning             | Immutable sources; new upload = new id           |
| Cross-DB               | API IDs only                                     |
| Module isolation       | No hard cross-module dependency                  |


---



## Open points — questions and trade-offs

Resolve with **product (Greta / Joaquin)** and **CC platform (Milan / Amanda)** before locking schema.


| #   | Question                       | Option A                                                                                                 | Option B                                                                               | Lean / notes                                                                                                            |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | **Catalog row scope**          | Scope primarily by **city / inventory** (task-centric)                                                   | Scope by **organization** (multi-city teams, e.g. C40)                                 | Need **all three** personas long-term (user, org, city). Likely a `scope_type` + ids. Confirm with Greta + Milan.       |
| 2   | **Who can see a catalog row?** | Same rules as today’s module access (user / org / project)                                               | New catalog-specific ACL                                                               | Prefer reuse existing CC auth; don’t rebuild permissions in CA.                                                         |
| 3   | **Catalog table schema**       | Minimal columns first (id, kind, owning_module, scope_type + scope ids, pointer/location, created_at)    | Richer metadata up front (labels, markdown_ready, retention flags, …)                  | Table itself is decided; column set with Milan / Amanda. Start minimal if unsure.                                       |
| 4   | **Register API shape**         | One shared **register/lookup** API in CC Core; modules call it when inputs/generated data become durable | Modules write SoT only; a side process backfills catalog rows                          | Meeting lean: same registration contract into Core at write time; not N different discovery protocols.                  |
| 5   | **S3 retention**               | Keep source + OCR for later CNB / Clima (Joaquin’s rich-knowledge direction)                             | Ephemeral: extract inventory then delete / cleanup jobs (closer to today’s OCR intent) | Architecture must **allow** durable files; **product** decides which kinds we keep. Double-check existing cleanup jobs. |
| 6   | **global-api datasets**        | Shortlist a few capability-scoped tools early                                                            | Defer until after catalog ships                                                        | In architecture scope; pick datasets with product + data.                                                               |
| 7   | **GHGI Markdown for agents**   | Default off; enable per CA step via pointer                                                              | Always offer Markdown alongside inventory                                              | Proposal: default **inventory Path A only**.                                                                            |
| 8   | **Frontend “all my data”**     | CA tool “summarize all my context” first                                                                 | Dedicated settings UI on catalog first                                                 | Prefer CA tool for v1 visibility; UI reuses same lookup later.                                                          |


---



## Document status


| Item                                        | Status                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| Goal: canonical discovery lookup            | Updated (2026-07-29)                                                           |
| `NativeInputCatalog` in **CC Core**         | Decided in architecture check                                                  |
| City inputs vs city generated data          | Updated — both register                                                        |
| Write + read Mermaid (no separate S3 actor) | Updated                                                                        |
| Path A/B + ownership + no S3 keys to Clima  | Unchanged intent                                                               |
| Open points with trade-offs                 | Updated — Milan / Amanda / Greta                                               |
| Stakeholder review                          | Mirco/Piotr architecture check done; **re-review after** product + Milan input |
| Implementation tickets                      | After open points above                                                        |


