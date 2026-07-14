# CC ↔ CA Markdown Output Schema Contract

> **Context**: CA converts a PDF → Markdown (via Mistral OCR). CC then reads that Markdown
> and must produce a structured list of inventory rows (`ExtractedRow[]`) to populate
> `InventoryValue` records. This document defines exactly what CA's Markdown must contain
> so that CC can do that work reliably.

---

## How the Data Flows

```
PDF upload (CC)
  → CA OCR → Markdown (stored in S3 under pdf-ocr/results/)
  → CC reads Markdown text
  → CC passes text to InventoryExtractionService (LLM prompt)
  → ExtractedRow[] → ImportedInventoryFile.mappingConfiguration.rows
  → User reviews in mapping step → approveImport → InventoryValue records created
```

The Markdown is an **intermediate** format. CC's LLM extraction prompt parses it — so the Markdown must be clean, structured, and table-focused. CA does **not** need to produce the JSON itself; that's CC's job. CA's only job is to produce high-fidelity Markdown that preserves the tabular data from the PDF.

---

## What CC Needs From the Markdown

CC's `InventoryExtractionService` feeds the Markdown text into an LLM with a structured prompt that extracts this row shape:

```typescript
type ExtractedRow = {
  year:                number | null;  // inventory year (integer, e.g. 2022)
  sector:              string | null;  // canonical GPC sector (see taxonomy below)
  subsector:           string | null;  // canonical GPC subsector
  scope?:              string | null;  // "1", "2", or "3"
  category:            string | null;  // activity/fuel type or "Subsector total"
  totalCO2e:           number | null;  // metric tonnes CO2e (NOT in thousands/millions)
  co2?:                number | null;  // gas breakdown if available
  ch4?:                number | null;
  n2o?:                number | null;
  gpcRefNo?:           string | null;  // e.g. "I.1.1", "II.2.1"
  source?:             string | null;  // e.g. "Table 5"
  methodology?:        string | null;  // e.g. "Fuel Sales", "Direct Measure"
  activityAmount?:     number | null;  // fuel consumed, distance, etc.
  activityUnit?:       string | null;  // "GJ", "litres", "MWh", "km"
  activityType?:       string | null;  // "Diesel", "Natural gas", "Electricity"
  activityDataSource?: string | null;
  activityDataQuality?:string | null;  // "high", "medium", "low"
}
```

---

## Markdown Quality Requirements for CA Output

The richer and cleaner the Markdown, the more accurately CC's LLM can extract rows.
CA must guarantee:

### ✅ Must Have

| Requirement | Why |
|---|---|
| Tables rendered as proper Markdown tables (`\| col \| col \|`) | CC's LLM prompt relies on tabular structure to identify per-row values |
| Column headers preserved exactly | Headers are used to identify `totalCO2e`, `activityAmount`, year columns |
| Row values in same columns as headers | Misaligned columns = wrong field mapping |
| Unit context preserved (e.g., "thousand tonnes CO2e") | CC normalises units numerically; without this it can't scale values |
| Year context preserved — either in headers (e.g., `CY 2022`) or in a `Year` column | CC extracts year per-row; missing year = `null` year = user must fix manually |
| All pages merged into one ordered Markdown doc | CC sends full text to extractor; page ordering matters for table continuity |

### ✅ Should Have

| Requirement | Why |
|---|---|
| GPC ref number column if present in PDF (e.g., `I.1.1`) | Directly mapped to `gpcRefNo`; avoids LLM guesswork |
| Scope column if present (`Scope 1`, `2`, `3`) | Reduces ambiguity in sector mapping |
| Sector/subsector names as printed in PDF | CC has a sector/subsector dictionary and hierarchy for normalisation |
| Gas breakdown columns (CO2, CH4, N2O) if present | Captured in `co2`, `ch4`, `n2o` fields |
| Activity/fuel type column if present | Captured in `activityType` |
| Activity amount + unit column if present | Captured in `activityAmount` + `activityUnit` |

### ❌ Must NOT Do

| Anti-pattern | Impact |
|---|---|
| Merge or aggregate table rows | CC extracts **one row per activity/subsector line** — pre-aggregated data loses granularity |
| Drop table rows that look like totals | Subtotals and section totals are valid inventory rows |
| Rearrange column order relative to header | Breaks field alignment |
| Convert numbers to text (e.g., "48,000" → "forty-eight thousand") | CC LLM must parse numbers; strip separators but keep digits |
| Omit table captions / titles | CC uses them to discriminate full-coverage tables from partial ones |

---

## GPC Sector Taxonomy

CC's extraction prompt enforces a canonical sector → subsector hierarchy.  
CA does **not** need to normalise to this — that's the LLM's job. But the Markdown must preserve the original sector/subsector names so the LLM can map them.

**Mandatory fields CC maps against:**

| CC Field | GPC Concept | Example values |
|---|---|---|
| `sector` | Top-level GPC sector | `Stationary Energy`, `Transportation`, `Waste`, `IPPU`, `Agriculture`, `AFOLU` |
| `subsector` | Sub-level category | `Residential Buildings`, `On Road Transportation`, `Solid Waste Disposal` |
| `gpcRefNo` | GPC reference code | `I.1.1`, `I.2.1`, `II.1.1`, `III.1.1` |
| `scope` | GPC scope | `"1"`, `"2"`, `"3"` |

---

## What CC Currently Does With the Markdown Text (Path C)

For context, here is the existing pipeline in CC that will consume the CA Markdown:

```
1. User uploads PDF → importStatus: pending_ai_extraction
2. User clicks "Extract with AI" → POST /extract
3. CC calls pdfBufferToText() today (will be replaced by CA Markdown)
4. CC calls extractInventoryRowsFromDocument(text, { targetYear })
   └─ Splits into chunks (large docs), sends each to LLM with SYSTEM_PROMPT
   └─ LLM returns { rows: ExtractedRow[] } JSON
   └─ Chunks merged + deduped → final ExtractedRow[]
5. importStatus → waiting_for_approval; rows saved in mappingConfiguration.rows
6. User reviews rows in mapping step (step 2 of wizard)
7. User approves → ImportedInventoryFile rows → InventoryValue DB records
```

When CA's Markdown replaces the raw PDF text in step 3, the rest of the pipeline is **unchanged**. CC just needs to fetch the Markdown from S3 instead of running local PDF-to-text.

---

## Summary: What CA Must Deliver to CC

| Item | Format | Required? |
|---|---|---|
| OCR output | UTF-8 Markdown (`.md`) | ✅ Yes |
| Tables as Markdown tables | `\| Header \| Header \|` with `\|---\|---\|` separator row | ✅ Yes |
| All pages merged in order | Single document, no page breaks that split table rows | ✅ Yes |
| Numeric values as digits | No thousands separators inside numbers, unit context in headers | ✅ Yes |
| Column headers preserved | Exactly as they appear in the PDF | ✅ Yes |
| Year in header or column | E.g., `CY 2022` column or `Year` column with row values | ✅ Yes |
| GPC ref / scope columns | If present in source PDF | 🟡 Best effort |
| Gas breakdown columns | If present in source PDF | 🟡 Best effort |
| Activity data columns | If present in source PDF | 🟡 Best effort |
| Page numbers / footers | Can be omitted | ⚪ Optional |
| Narrative prose sections | Should be included (LLM ignores non-table text safely) | ⚪ Optional |

---

## Open Question for the PR

The architecture doc says CA "stops after producing Markdown" and does not do row extraction.
CC's current extraction LLM prompt is in [InventoryExtractionService.ts](file:///c:/Users/frank/Desktop/Workspace/oef/CityCatalyst/app/src/backend/InventoryExtractionService.ts) —
it already knows how to parse Markdown tables into `ExtractedRow[]`.

**The only change CC needs** is: instead of calling `pdfBufferToText()` locally, fetch the Markdown
from S3 using the signed GET URL returned by CA's status endpoint.
