# Data Model Design

## Philosophy

A database schema is infrastructure — it is expensive to change and expensive to get wrong. The standards here exist to make our schemas **legible**, **traceable**, and **migration-friendly** from the moment a table is created, not as an afterthought when a migration is already painful.

There are three properties we should be able to assert about every table in the `modelled` schema:

1. **When was this row written, and when was it last updated?** — Timestamps answer this without requiring a pipeline run history lookup.
2. **Where did this data come from?** — Every row should carry enough information to trace it back to a specific dataset release in the catalog.
3. **Can we change this schema without breaking things?** — Tables should be designed with their own future in mind: predictable primary keys, additive change patterns, and explicit documentation of anything destructive.

These are not aspirational. They are baseline requirements for any table that enters the `modelled` schema that holds externally-sourced data. See [Reference Tables](#reference-tables) below for the distinction.

This document works alongside the [Naming Conventions](./naming-conventions.md) standard, which governs column names, casing, and related rules. It does not repeat those rules here.

---

## Required Columns

Every data-bearing table in the `modelled` schema must include the following columns. These are non-negotiable and should be included in the initial `CREATE TABLE` statement, not added later.

### Timestamps

| Column | Type | Default | Notes |
|---|---|---|---|
| `created_at` | `TIMESTAMPTZ` | `NOW()` | Set once at insert; never updated |
| `updated_at` | `TIMESTAMPTZ` | `NOW()` | Updated on every upsert |

Both must be `TIMESTAMPTZ` (timestamp with time zone), not plain `TIMESTAMP` or `datetime`. All timestamps are stored in UTC. See [Timestamp Standards](#timestamp-standards) for detail.

### Provenance

| Column | Type | Notes |
|---|---|---|
| `release_id` | `VARCHAR` | Foreign key to `modelled.dataset_release` — identifies the exact dataset release that produced this row |

A single `release_id` FK is sufficient. The `dataset_release` table already carries `publisher_id`, `dataset_id`, `version_label`, `retrieved_at`, and `source_url`, so any row with a `release_id` is fully traceable back through the catalog without duplicating those fields inline. See [Data Source & Release Provenance](#data-source--release-provenance) for how this chain works.

### Example table header

```sql
CREATE TABLE modelled.emissions (
    emissions_id         VARCHAR         PRIMARY KEY,

    -- domain columns
    actor_id             VARCHAR         NOT NULL,
    gpc_reference_number VARCHAR         NOT NULL,
    emissions_value      NUMERIC,
    emissions_units      VARCHAR,
    reporting_year       INTEGER,

    -- provenance
    release_id           VARCHAR         REFERENCES modelled.dataset_release(release_id),

    -- timestamps
    created_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

---

## Timestamp Standards

### Always use `TIMESTAMPTZ`

Plain `TIMESTAMP` stores no timezone information. When pipelines run across environments (local, CI, production), the implicit timezone can vary and produce inconsistent records. `TIMESTAMPTZ` eliminates this ambiguity. All values are stored as UTC internally by PostgreSQL.

```sql
-- Correct
created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()

-- Wrong — do not use
created_at   TIMESTAMP     NOT NULL DEFAULT NOW()
```

### `created_at` — set once, never touched again

`created_at` records when the row was first written to the database. It is set by the `DEFAULT NOW()` on insert and must not be updated in any subsequent upsert. The upsert `DO UPDATE SET` clause must not include `created_at`.

```sql
ON CONFLICT (emissions_id)
DO UPDATE SET
    emissions_value         = EXCLUDED.emissions_value,
    emissions_units         = EXCLUDED.emissions_units,
    reporting_year          = EXCLUDED.reporting_year,
    datasource_id           = EXCLUDED.datasource_id,
    dataset_release_version = EXCLUDED.dataset_release_version,
    updated_at              = NOW();
    -- created_at is intentionally omitted here
```

### `updated_at` — updated on every upsert

`updated_at` records the last time the row was written, whether on initial insert or any subsequent update. In the upsert pattern we use (see [Pipeline Design Patterns](./pipeline-design-patterns.md)), `updated_at` should be explicitly set to `NOW()` in the `DO UPDATE SET` clause.

`updated_at` is not a trigger-managed column. It is the responsibility of the SQL block performing the write to update it. This keeps the behaviour explicit and visible in the pipeline code rather than hidden in database triggers.

### What timestamps mean in pipeline context

Because pipelines are the primary write path for `modelled` tables, `created_at` records the first time a pipeline wrote a given row (identified by its primary key), and `updated_at` records the most recent pipeline run that touched it. This means if a dataset release is reprocessed, `updated_at` will advance — providing a lightweight audit trail of when data was refreshed without needing to query pipeline run logs.

---

## Data Source & Release Provenance

### The provenance chain

Every data-bearing row in the `modelled` schema should be traceable back to a specific release of a specific dataset. The chain looks like this:

```
modelled table row
  └── release_id → modelled.dataset_release
        ├── publisher_id → modelled.publisher_datasource
        ├── dataset_id   → modelled.publisher_datasource
        ├── version_label (e.g. "2023", "v2")
        ├── retrieved_at
        └── source_url
              └── catalog release entry (index.yaml)
                    └── pipeline_name / pipeline_version
```

`modelled.dataset_release` is the database representation of the catalog's release entries. `modelled.publisher_datasource` is the database representation of publishers and their datasets. A single `release_id` FK anchors any row to a specific ingestion event, from which all other provenance details are recoverable.

### Why `release_id` and not `dataset_id` + `version_label` inline

Storing `dataset_id` and `version_label` directly on every row might seem equivalent, but it means provenance data is duplicated and can drift if labels are corrected in `dataset_release`. A FK to `release_id` keeps a single source of truth. It also ensures the release actually exists in the database before rows referencing it can be inserted, providing a lightweight integrity check.

Some existing tables (e.g. `city_attribute`, `city_polygon`) already carry a `release_id` column — this is the correct pattern and should be adopted consistently.

### Population in SQL blocks

The `release_id` should be sourced from a lookup against `modelled.dataset_release`, using the `release_version` pipeline variable (see [Pipeline Design Patterns](./pipeline-design-patterns.md#parameters-over-hardcoding)).

```sql
INSERT INTO modelled.emissions (
    emissions_id,
    actor_id,
    gpc_reference_number,
    emissions_value,
    emissions_units,
    reporting_year,
    release_id,
    updated_at
)
SELECT
    ...,
    dr.release_id,
    NOW()
FROM raw_data.ct_onroad_staging s
JOIN modelled.dataset_release dr
    ON dr.dataset_id = 'ct-onroad'
    AND dr.version_label = '{{ release_version }}'
ON CONFLICT (emissions_id)
DO UPDATE SET
    emissions_value = EXCLUDED.emissions_value,
    release_id      = EXCLUDED.release_id,
    updated_at      = NOW();
```

### What not to do

Do not use a free-form `datasource_name` or `datasource` string as the sole provenance field. A string like `'ClimateTRACE'` is not traceable to a specific release, cannot be joined to publisher metadata, and drifts as teams use slightly different names across pipelines. This pattern is present in several existing tables (`emissions`, `emissions_factor`, `ghgi_city_facility_occurance`, `ccra_indicator`, `ghgi_emission_forecast`) and should be replaced with `release_id` when those tables are next touched.

Do not store `dataset_id` alone without a `release_id`. A `dataset_id` without a release version cannot distinguish between the 2021 and 2023 ingestions of the same dataset. `formula_input` and `population` currently have this gap.

---

## Reference Tables

Not all tables in the `modelled` schema contain externally-sourced, release-bound data. Some are internally managed reference datasets that the team maintains directly and that do not change on a per-release basis. The requirements above apply differently to these.

**Reference tables** — maintained internally, not tied to an external dataset release:
- `modelled.gpc_sector`
- `modelled.gpc_methodology`
- `modelled.ghgi_methodology`
- `modelled.global_warming_potential`

For reference tables, `release_id` is not required. However, `created_at` and `updated_at` timestamps are still required — they provide an audit trail for when reference data was added or changed, which is useful during migrations and debugging.

**Data tables** — ingested from external sources, must have `release_id`:
All other tables in the `modelled` schema that receive data from external pipelines. If a pipeline writes to a table, that table needs `release_id`.

---

## Migration-Friendly Design

Schema changes to `modelled` tables propagate through the pipeline system, the GlobalAPI, and downstream consumers. Design decisions made at table creation time either make future migrations routine or make them painful.

### Prefer additive changes

The safest schema migration is one that adds something without removing or renaming anything. Design tables with this in mind.

- **New columns** should be nullable or carry a sensible `DEFAULT` so they can be added without a full table rewrite and without breaking existing inserts that do not yet supply the new column.
- **Renaming columns or tables** is a breaking change. If a rename is necessary, add the new column first, migrate data, update all write paths, then drop the old column — never rename in a single step in production.
- **Dropping columns or tables** must be explicitly discussed and staged. If data consumers (the GlobalAPI, Metabase) query a column, dropping it is an outage.

```sql
-- Safe: adding a nullable column with a default
ALTER TABLE modelled.emissions
    ADD COLUMN IF NOT EXISTS confidence_level VARCHAR DEFAULT 'not_assessed';

-- Risky without a staged rollout:
ALTER TABLE modelled.emissions
    RENAME COLUMN emissions_value TO emissions_quantity;
```

### Use stable surrogate primary keys

Primary keys should be stable, synthetic identifiers — not derived from business values that could change. A key built from `locode + gpc_reference_number + reporting_year + datasource_id` will break if any component naming convention changes; a UUID or a deterministic hash of those components provides the same uniqueness with more stability.

Whichever approach is used, the derivation logic for composite primary keys must be documented in the pipeline code at the point of generation, and it must be consistent across all pipeline versions that write to that table.

### Choose text types by query intent, not by fear

`TEXT` is an appropriate type for descriptive fields (for example project names,
descriptions, free-form methodology notes, and thematic labels). Avoid treating
`TEXT` as inherently "bad" or too expensive by default.

Use type choice based on intent:

- **Identifiers and join keys** should use constrained, stable types (`UUID`,
  numeric IDs, or short `VARCHAR` codes).
- **Descriptive/narrative fields** should use `TEXT`.
- **Frequently filtered dimensions** should be indexed where needed; performance
  issues are more commonly caused by missing indexes than by the presence of
  `TEXT` columns.

If a text field becomes a high-volume search target (contains/ILIKE/full-text),
add explicit indexing (for example trigram or FTS) as a deliberate follow-up.

### Do not encode assumptions in column structure

Avoid splitting a concept into multiple columns when a single structured column (or a related table) would serve better and be more flexible. For example, splitting emissions by gas into separate columns (`co2_value`, `ch4_value`, `n2o_value`) makes it impossible to add a new gas without a schema migration. A single `emissions_value` + `gas` column pair handles any gas without schema changes.

Similarly, avoid using column presence to encode state (e.g. a nullable `approved_at` column that doubles as a boolean flag). Use explicit status columns or separate state tables.

### Use unambiguous regional naming in global datasets

In globally-scoped tables, `region_name` is ambiguous because teams often use
"region" for subnational administrative areas. Prefer explicit names that state
the scale (for example `world_region_name` for macro regions like "Latin America
and Caribbean"), and reserve local administrative naming for subnational fields
(for example `admin1_name`, `state_name`, `province_name`).

### Document breaking changes before they happen

Any migration that renames, drops, or changes the type of an existing column is a breaking change. Before executing it:

1. Create a Jia issue describing the change, the tables and columns affected, and the downstream consumers that need updating.
2. Confirm the GlobalAPI and any dashboard queries that reference the affected columns are updated or compatible before the migration runs in production.
3. Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and `DROP COLUMN IF EXISTS` in migration scripts to make them re-runnable without error.

There is no dedicated migration tooling mandated at this stage — migrations are SQL scripts run against the database. If the number of migrations grows significantly, adopting a migration framework (e.g. Flyway, Alembic) should be evaluated.

---

## Data Architecture Review Checklist

Use this checklist when reviewing a new table definition — whether in a PR, a Phase 2 physical model, or a migration script. A table should not enter the `modelled` schema without passing all items in the first section.

### Required (blocking)

- [ ] **`created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`** is present
- [ ] **`updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`** is present
- [ ] **`release_id`** is present and references `modelled.dataset_release(release_id)` — required for all data tables; not required for reference tables (see [Reference Tables](#reference-tables))
- [ ] **`release_id` is populated from a join on `modelled.dataset_release`** using the pipeline's `release_version` variable — not hardcoded
- [ ] **Primary key is defined** and its derivation logic is documented if composite
- [ ] **All write paths use the upsert pattern** (`ON CONFLICT DO UPDATE`) and `created_at` is not included in the `DO UPDATE SET` clause

### Recommended (flag if absent)

- [ ] **New nullable columns have a `DEFAULT`** or a clearly documented reason for not having one
- [ ] **No `TIMESTAMP`, `TIMESTAMPTZ`, or `datetime` columns** — all timestamps use `TIMESTAMPTZ`
- [ ] **No free-form `datasource_name` or `datasource` string** used as the sole provenance identifier
- [ ] **No `dataset_id` without `release_id`** — a dataset reference without a release version is not a full provenance record
- [ ] **Column names follow [Naming Conventions](./naming-conventions.md)** — snake_case, units included for measured quantities, `is_` prefix for booleans, `_at` suffix for timestamps
- [ ] **No business logic encoded in column structure** (e.g. per-gas columns, nullable-as-flag patterns)

### For breaking changes (migrations to existing tables)

- [ ] **Jira issue exists** describing the change and affected downstream consumers
- [ ] **GlobalAPI queries** against the affected table have been reviewed
- [ ] **Migration script is idempotent** — uses `IF NOT EXISTS` / `IF EXISTS` guards so it can be re-run safely
- [ ] **Staged rollout plan** documented if consumers cannot be updated simultaneously

---

## Current Schema State

As of the schema last reviewed (April 2026), the following gaps are known and accepted as a migration backlog. They do not block current work but should be addressed opportunistically when a pipeline touching that table is next updated.

| Table | Missing timestamps | Missing `release_id` | Free-form provenance to replace |
|---|---|---|---|
| `modelled.emissions` | ✗ | ✗ | `datasource_name` |
| `modelled.emissions_factor` | ✗ | ✗ (has `dataset_id` only) | `datasource_name` |
| `modelled.activity_subcategory` | ✗ | ✗ | — |
| `modelled.formula_input` | ✗ | ✗ (has `dataset_id` only) | — |
| `modelled.population` | ✗ | ✗ (has `dataset_id` only) | — |
| `modelled.ghgi_city_facility_occurance` | ✗ | ✗ | `datasource_name` |
| `modelled.ghgi_emission_forecast` | ✗ | ✗ | `datasource` |
| `modelled.ccra_indicator` | ✗ | ✗ | `datasource` |
| `modelled.ccra_impactchain_indicator` | ✗ | ✗ | `datasource` |
| `modelled.ccra_riskassessment` | ✗ | ✗ | — |
| `modelled.cap_climate_action` | ✗ | ✗ | — |
| `modelled.publisher_datasource` | ✗ | n/a (is provenance table) | — |
| `modelled.dataset_release` | `datetime` → needs `TIMESTAMPTZ` | n/a (is provenance table) | — |
| `modelled.city_attribute` | ✗ | Has `release_id` ✓ | `datasource` (redundant, can drop) |
| `modelled.city_polygon` | ✗ | Has `release_id` ✓ | — |

Reference tables (`gpc_sector`, `gpc_methodology`, `ghgi_methodology`, `global_warming_potential`) are omitted from this table as they do not require `release_id`, but should still have timestamps added.

The flat tables outside the `modelled` schema (`citywide_emissions`, `regionwide_emissions`, `datasource`) use `created_date`/`modified_date` with `datetime` type — both the naming convention and the type violate current standards and should be migrated to `created_at`/`updated_at TIMESTAMPTZ`.
