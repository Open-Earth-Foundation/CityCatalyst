# GHGI / eCRF data

## GPC reference table

**File:** `gpc-reference-table.json`

A table of all possible GPC rows with:

- **gpcRefNo** – GPC reference number (e.g. `I.1.1`, `II.1.1`, `IV.1`, `V.1`)
- **sector** – Sector name (slug, e.g. `stationary-energy`, `transportation`)
- **subsector** – Subsector name (slug)
- **subcategoryName** – Subcategory name when applicable (null for sectors IV–V)
- **scope** – Scope 1/2/3 when applicable
- **fuelTypeOrActivity** – List of possible fuel types or activity types for this GPC ref (from methodologies)

**Purpose:** Some eCRF files do not contain a GPC reference number column. This table lets you look up or validate rows by **sector + subsector + fuel/activity** and resolve them to a `gpcRefNo`.

**Usage in app:** The import layer uses `@/util/GHGI/gpc-ref-resolver` (`resolveGpcRefNo(sector, subsector, fuelTypeOrActivity?)`) when the eCRF has no GPC ref column or a row has an empty ref: sector and subsector (and optionally activity/fuel) are read from the file and resolved to a GPC ref before DB lookup.

**Source:** Generated from `src/data/inventory-structure.json` and `src/util/form-schema/manual-input-hierarchy.json`.

**Regenerate:** From the `app` directory:

```bash
npx tsx scripts/generate-gpc-reference-table.ts
```

## Example eCRF file

**File:** `A_Kothapalle_CRF_2013_GPC_Filled_ALL_Sheet3.xlsx`

Example GPC-filled eCRF with columns such as GPC ref no., CRF – Sector, CRF – Sub-sector, and Activity Type / Fuel Type. Use it as a reference for column naming and expected values when mapping or validating imports.
