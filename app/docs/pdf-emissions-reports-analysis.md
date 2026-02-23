# Analysis: GHG inventory PDF reports (app/docs)

Analysis of five city GHG inventory PDFs to inform **Path C** (PDF → AI extraction) schema, prompts, and normalization.

---

## 1. Files analyzed

| File | City | Year(s) | Pages | Protocol / tool |
|------|------|---------|-------|------------------|
| 2022 GHG Inventory Report - Final 12-13-24 (1).pdf | Seattle | 2008–2022 | 58 | ICLEI U.S. Community Protocol |
| 2022-greenhouse-gas-inventory-report.pdf | Philadelphia | 2006–2022 | 30 | GPC (BASIC+) |
| columbus-2023-ghg-inventory-report.pdf | Columbus | 2013–2023 | 34 | ICLEI ClearPath (Gov Ops + Community) |
| NYC_GHG_Inventory_2015.pdf | New York City | 2005–2015 | 56 | GPC BASIC |
| Report-GHG-City-of-Miami_Final-231201.pdf | Miami | 2018, 2019, 2021 | 17 | GPC BASIC, ClearPath |

---

## 2. Common structure

- **Narrative** – Intro, methodology, goals, trends, COVID context.
- **Summary totals** – Citywide (and often government operations) totals by sector, sometimes per capita.
- **Detailed tables** – Sector/subsector/category × year with numeric emissions (mtCO2e, MMTCO2e, etc.).
- **Appendix** – Methodology, source notes, sometimes full inventory tables.

Protocols referenced: **GPC** (Global Protocol for Community-Scale), **ICLEI** (U.S. Community Protocol, ClearPath). Sectors align with GPC/ICLEI: **Stationary Energy (Buildings)**, **Transportation**, **Waste** (and often **IPPU**, **AFOLU**, **Wastewater**).

---

## 3. Table patterns

### 3.1 Seattle (2022)

- **Appendix A**: “Emissions Category” (hierarchical: sector → subsector → category) with **year columns** (2008, 2012, 2014, 2016, 2018, 2020, 2022). Values in **metric tonnes CO2e** (rounded, thousands for large numbers).
- Example rows: “Buildings”, “Residential”, “Road: Passenger”, “Waste”, “Commercial”, “Food Waste”, “Grand Total”.
- Multiple tables (Core vs Expanded, Transportation, Buildings, Waste, etc.) with same pattern: category + year columns.

### 3.2 Philadelphia (2022)

- **GPC BASIC+**: Stationary Energy, Transportation, Waste, IPPU, AFOLU. Scopes 1/2/3.
- **Summary tables**: Sector × year (e.g. 2006, 2014, 2019, 2022) in **MMTCO2e**.
- **Table 2**: Demographics (Population, Employment, HDD, CDD) by year.
- **GWP**: 100-year and 20-year; CO2, CH4, N2O, SF6.

### 3.3 Columbus (2023)

- **Two tracks**: Government Operations vs Community-Scale.
- **Tables 3–4**: Gov Ops – sectors (Buildings & Facilities, Streetlights, Vehicle Fleet, Solid Waste, Water & Wastewater) × years 2013–2023; **metric tons CO2e** and per capita.
- **Table 6**: Community-Scale – “Annual Total Emissions by Sector | 2013 – 2023” (same sector list as Table 2).
- Clear **sector list** in Table 1/2 (e.g. “Residential Energy – Electricity Use”, “Transportation – On Road Fuel Use”).

### 3.4 NYC (2015)

- **GPC BASIC**: Stationary energy, Transportation, Waste.
- **Fig. 3**: Citywide annual GHG by sector (2005–2015), **MtCO2e**.
- **Fig. 1**: 2015 breakdown (buildings, transit, on-road, fugitive, etc.) in **MtCO2e** and energy (trillion BTU).
- Narrative and figures; detailed tables likely in later pages.

### 3.5 Miami (2019 & 2021)

- **Table 2**: **GPC #** (e.g. I.1.1, I.2.1, II.1.1, III.1.2), **Emissions Sub-sectors**, **Emissions (MTCO2e)** for 2018, 2019, 2021.
- **Sectors**: Stationary Energy (Residential, Commercial/Institutional, Industrial, Energy Production, Fugitive), Transportation (On-road, Public Transit, Waterborne, Off-road), Waste (Solid Waste, Wastewater, Septic).
- Very **structured**: GPC codes + subsector name + three year columns. Ideal for mapping to a standard schema.

---

## 4. Recommended extraction schema (Path C)

Target one **row per emissions line item** (one sector/subsector/category + one year + one value). Normalize to a common shape for `mappingConfiguration.rows` and downstream `importECRFData`.

### 4.1 Suggested row fields (align with eCRF / GPC where possible)

| Field | Description | Notes |
|-------|-------------|--------|
| **year** | Inventory year | Integer (e.g. 2022). |
| **sector** | High-level sector | e.g. Stationary Energy, Transportation, Waste, IPPU, Government Operations. |
| **subsector** | Mid-level | e.g. Residential, Commercial, On-road, Solid Waste. |
| **category** | Line item / category | e.g. “Residential Electricity”, “On-road Gasoline and Diesel”, “Food Waste”. May be same as subsector in some reports. |
| **totalCO2e** | Emissions (CO2e) | Numeric; unit = metric tonnes CO2e (convert MMTCO2e × 1e6, etc.). |
| **co2** | CO2 only (if split) | Optional. |
| **ch4** | CH4 (if split) | Optional. |
| **n2o** | N2O (if split) | Optional. |
| **gpcRefNo** | GPC reference (if present) | e.g. I.1.1, II.1.1, III.1.2 (Miami-style). |
| **source** | Report/city identifier | e.g. “Seattle 2022”, “Miami 2021” (for multi-doc or debugging). |

- **Unit**: Normalize all to **metric tonnes CO2e** in one field (e.g. `totalCO2e`). If the report only has CO2e total, use that; if it has CO2/CH4/N2O, sum with GWP or store separately and compute CO2e in a later step.
- **One row per year**: If a table has “Category × 2008, 2012, 2014…”, extract one row per (category, year) with that year’s value.

### 4.2 Variability to handle in prompts / post-processing

- **Naming**: “Stationary Energy” vs “Buildings” vs “Buildings and Facilities”; “On-road” vs “Road: Passenger”; “Solid Waste” vs “Waste”. Map to a fixed sector/subsector list (e.g. GPC/ICLEI) in normalization.
- **Hierarchy**: Some reports use 2 levels (sector, category), others 3 (sector, subsector, category). Allow `subsector` or `category` to be empty.
- **Units**: mtCO2e, MTCO2e, MMTCO2e, tCO2e – convert to a single unit (e.g. metric tonnes).
- **GPC codes**: When present (e.g. Miami), preserve in `gpcRefNo` for better mapping to your GPC reference data.
- **Government vs community**: Some PDFs have both (Columbus, Miami). Treat as separate “inventory type” or add a field (e.g. `inventoryScope: "community" | "government_operations"`) if needed for your app.

---

## 5. Extraction prompt guidance (for LLM)

- **System**: “You extract GHG inventory line items from city emissions reports. Output a JSON array of objects. Each object = one line item: one category (or sector/subsector/category) for one year with emissions in metric tonnes CO2e. Fields: year, sector, subsector, category, totalCO2e [, gpcRefNo if present]. Use null for missing. Normalize sector names to: Stationary Energy, Transportation, Waste, IPPU, AFOLU, Other.”
- **User**: Provide document text (or chunked text) from the PDF. Optionally: “Focus on tables that list emissions by category and year; ignore narrative-only pages if no numbers.”
- **Output**: JSON array; validate and normalize (allowlisted keys, numeric totalCO2e, year in range).
- **Post-processing**: Map sector/subsector strings to your internal enums or GPC codes; resolve to sector/subsector/scope IDs (e.g. via GPC resolver) before storing in `mappingConfiguration.rows` and before approve/import. When `gpcRefNo` is absent, the app uses `gpc-name-mappings.json` (and `resolveGpcRefNo` / `normalizeSectorAndSubsector` in `util/GHGI/gpc-ref-resolver.ts`) to normalize PDF/LLM naming variants (e.g. "Buildings", "Road: Passenger", "Solid Waste") to canonical GPC slugs. The extraction prompt (in `InventoryExtractionService`) includes: (1) the GPC taxonomy as a sector–subsector hierarchy (each sector with its valid subsectors) so the model keeps (sector, subsector) pairs valid; (2) a mapping dictionary built from `gpc-name-mappings.json` (report terms → canonical sector or subsector name) so the model can convert report wording to the correct canonical names; (3) an instruction to output `gpcRefNo` when the document shows a GPC code. After extraction, rows still missing `gpcRefNo` are filled via `resolveGpcRefNo(sector, subsector, category)`.

---

## 6. Summary

| Aspect | Recommendation |
|--------|----------------|
| **Row shape** | One row per (category/subcategory, year) with `year`, `sector`, `subsector`, `category`, `totalCO2e`; optional `gpcRefNo`, `co2`, `ch4`, `n2o`. |
| **Units** | Normalize to metric tonnes CO2e. |
| **Sector naming** | Allowlist + mapping to internal/GPC names in normalization step. |
| **Tables** | Prefer tables with “category/sector × year” layout; LLM should emit one row per cell (per year) for each category. |
| **Multi-year** | Extract every year column as separate rows (same category, different year). |
| **Gov vs community** | Optional field if both appear in one PDF. |

These five PDFs are representative of U.S. city reports (GPC/ICLEI, BASIC or BASIC+). Miami’s Table 2 is the closest to a ready-made tabular format; Seattle’s Appendix A is the most granular. Path C extraction + normalization should handle all of these patterns with the schema above and a single prompt strategy.

---

## 7. Example output: Seattle 2022 report (Appendix A)

Example extracted rows from **2022 Community GHG Emissions Inventory: Seattle** (Appendix A: Detailed Emissions Inventory Tables). Values are metric tonnes CO2e; report rounds to nearest thousand except waste. One row per (category, year). Seattle does not use GPC codes in the table, so `gpcRefNo` is null.

```json
[
  { "year": 2022, "sector": "Stationary Energy", "subsector": "Buildings", "category": "Commercial", "totalCO2e": 896000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Stationary Energy", "subsector": "Buildings", "category": "Commercial CenTrio Steam Fossil Gas", "totalCO2e": 69000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Stationary Energy", "subsector": "Buildings", "category": "Commercial PSE Fossil Gas", "totalCO2e": 464000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Stationary Energy", "subsector": "Buildings", "category": "Residential", "totalCO2e": 546000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Stationary Energy", "subsector": "Buildings", "category": "Residential PSE Fossil Gas", "totalCO2e": 446000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Stationary Energy", "subsector": "Buildings", "category": "Residential Seattle City Light Electricity", "totalCO2e": 32000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Stationary Energy", "subsector": "Industry", "category": "Cement Process", "totalCO2e": 315000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Transportation", "subsector": "Road: Passenger", "category": "Cars & Light Duty Trucks Gasoline", "totalCO2e": 1415000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Transportation", "subsector": "Road: Trucks", "category": "Medium & Heavy Duty Diesel", "totalCO2e": 180000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Transportation", "subsector": "Air", "category": "Sea-Tac Airport Jet Fuel", "totalCO2e": 1313000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Transportation", "subsector": "Marine", "category": "State Ferries Diesel", "totalCO2e": 29000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Waste", "subsector": "Commercial", "category": "Food Waste", "totalCO2e": 8800, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Waste", "subsector": "Residential", "category": "Food Waste", "totalCO2e": 9700, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Waste", "subsector": "Wastewater", "category": "Fugitive Emissions", "totalCO2e": 18200, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2022, "sector": "Stationary Energy", "subsector": null, "category": "Grand Total", "totalCO2e": 5674600, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2020, "sector": "Stationary Energy", "subsector": "Buildings", "category": "Commercial", "totalCO2e": 817000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2020, "sector": "Transportation", "subsector": "Road: Passenger", "category": "Cars & Light Duty Trucks Gasoline", "totalCO2e": 1360000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2008, "sector": "Stationary Energy", "subsector": "Buildings", "category": "Commercial", "totalCO2e": 824000, "gpcRefNo": null, "source": "Seattle 2022" },
  { "year": 2008, "sector": "Transportation", "subsector": "Road: Passenger", "category": "Cars & Light Duty Trucks Gasoline", "totalCO2e": 1673000, "gpcRefNo": null, "source": "Seattle 2022" }
]
```

Notes:
- **Sector** normalized to GPC-style names (Stationary Energy, Transportation, Waste). Seattle "Buildings" and "Industry" both map under Stationary Energy; "Wastewater" under Waste.
- **Subsector/category**: Seattle uses a deep hierarchy (e.g. Commercial then CenTrio Steam then Fossil Gas). Example shows both aggregated (e.g. "Commercial") and more granular (e.g. "Commercial PSE Fossil Gas") where useful for import.
- **Multi-year**: 2022, 2020, and 2008 shown for a few categories to illustrate one row per year.
- **Grand Total**: Included as one row with `category: "Grand Total"`; downstream logic may exclude or treat separately.
- **Negative values** (offsets, sequestration): Seattle reports these (e.g. -106,000 for Offsets in 2022). Schema supports negative `totalCO2e`; normalization can keep or split into a separate concept (e.g. `offsetCO2e`) if needed.
