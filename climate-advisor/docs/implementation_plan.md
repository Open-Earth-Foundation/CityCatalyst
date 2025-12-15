# Climate Advisor Implementation Plan

Plan to slim tool payloads before they reach the LLM, add a city-level inventory lookup, and tighten prompts so the agent lists inventories, lets the user pick one, then drills down with the right tool calls.

## Tool Inventory and Payload Notes

- **get_user_inventories** (`service/app/tools/cc_inventory_wrappers.py` -> `/api/v1/user/inventories`)

  - Current payload: `{ data: InventoryWithCity[] }` where each inventory includes `inventoryId`, `inventoryName`, `year`, `totalEmissions`, `cityId`, `totalCountryEmissions`, `isPublic`, `publishedAt`, `inventoryType`, `globalWarmingPotentialType`, timestamps, plus `city: { name, locode }` (see `app/src/app/api/v1/user/inventories/route.ts`).
  - Context waste: `cityId`, `totalCountryEmissions`, publish flags, timestamps, and nulls add tokens without helping selection.
  - Keep for LLM: `inventoryId` (key for follow-up), `inventoryName`, `year`, `totalEmissions` (optional), `inventoryType`, `globalWarmingPotentialType`, `city.name`, `city.locode`.
  - Drop before serialization: `cityId`, `totalCountryEmissions`, `isPublic`, `publishedAt`, `created`, `lastUpdated`, empty/null fields. Optionally sort newest-year first.

- **get_inventory** (`service/app/tools/cc_inventory_wrappers.py` -> `/api/v1/inventory/{id}`)

  - Current payload: `{ data: Inventory }` with city, project, and organization attached.
  - Context waste: `city.shape` (GeoJSON-heavy), project and organization objects, timestamps, unused IDs.
  - Keep for LLM: `inventoryId`, `inventoryName`, `year`, `totalEmissions`, `inventoryType`, `globalWarmingPotentialType`, `city: { name, locode, country, region, countryLocode, regionLocode, area }`.
  - Drop/condense: remove `city.shape`, collapse project/org to a single `organizationName` if needed, strip timestamps and publish flags unless explicitly requested; keep only `inventoryId` as ID.

- **get_all_datasources** (`service/app/tools/cc_inventory_wrappers.py` -> `/api/v1/datasource/{inventoryId}`)

  - Current payload: `{ data: successfulSources[], removedSources[], failedSources[] }` where each successful entry is `{ source: DataSourceI18n (+ scopes, publisher, inventoryValues, subSector/subCategory...), data: API response + scaleFactor + issue }`.
  - Context waste: datasetDescription/transformation/methodology text, URL/apiEndpoint, priority, language/accessibility flags, timestamps, large associations (`inventoryValues`, `scopes`, `publisher`, full sector/subsector/subcategory objects), full `records` arrays and unused keys inside `totals`, plus `removedSources[]` and `failedSources[]` (not needed for LLM).
  - Keep for LLM: only `successfulSources` array; per source `{ datasourceName || datasetName, sourceType, retrievalMethod, geographicalLocation, startYear, endYear, subSector/subCategory names + referenceNumber, scope name, issue, scaleFactor }` plus a compact data summary (`totals` with `co2eq_100yr`/gas masses, `recordsCount`, or `unavailableReason` when notation key).
  - **Note:** `datasourceId` is NOT needed—Climate Advisor only describes datasources informally; it does not apply/connect them (that is a web UI operation). Keep `inventoryId` as the only ID for follow-up operations.
  - Drop entirely: `removedSources[]`, `failedSources[]` (only return successful sources). Within successful sources: strip `records`, truncate `data` to counts + headline emissions, remove `inventoryValues`, publisher blob, and long text fields.

- **climate_vector_search** (`service/app/tools/climate_vector_tool.py`)

  - Current payload: formatted context string built from up to `top_k` (default 5) full chunks with filename/path/indices/score/content.
  - Context waste: full chunk bodies for 5 matches; file paths and distances add tokens without changing answers.
  - Possible trimming: limit to top 3 matches, drop `file_path` and `distance` in rendered context,

- **city_inventory_search (new)** (to add)
  - Purpose: search inventories by city name with optional year filtering. Returns all inventories matching the city name (case-insensitive regex match), optionally filtered to a specific year if provided.
  - Inputs: `city_name` (required, string); `year` (optional, integer or null). If `year` is provided, only return inventories for that year; otherwise return all years for the city sorted descending by year.
  - **Implementation details:**
    - Fetch `get_user_inventories` internally to get the full list.
    - Match `city_name` against `city.name` in each inventory using **case-insensitive regex** to handle variations (e.g., "New York", "new york", "NEW YORK" all match).
    - If `year` is provided and is not null, filter results to only that year; otherwise include all years.
    - Sort results by year descending when multiple inventories exist for the same city.
  - Payload: `{ data: InventoryWithCity[] }` filtered to matching city(ies) and optionally year(s).
  - Keep for LLM: `inventoryId`, `inventoryName`, `year`, `totalEmissions`, `inventoryType`, `globalWarmingPotentialType`, `city: { name, locode, country, region }`.
  - Drop before serialization: same as `get_user_inventories` (publish flags, timestamps, auxiliary IDs/nulls).

## Prompt and Tool-Use Adjustments

- Update `prompts/default.md` to spell out the inventory flow: (1) call `get_user_inventories` when the user has no `inventoryId`, (2) confirm the chosen `inventoryId`, (3) call `get_inventory`, and (4) only then consider `get_all_datasources` for enrichment. Explicitly tell the model not to ask the user for an ID if tools are available.
- Add guidance to summarize tool outputs instead of dumping JSON; focus on IDs, names, years, emissions, city, and availability status.
- Add a brief tool blurb for `get_all_datasources` describing what to return after filtering (name, applicability, coverage years, retrieval method, high-level emissions/record counts, issues).
- Add a note to the climate KB section to keep retrieved excerpts tight (top 3, concise quotes) and only call when the user asks for climate knowledge, not CityCatalyst operations.
- Add a blurb for `city_inventory_search`: use when the user names a city (with or without a year); summarize inventories by year and surface inventoryId(s); if a year is given, only return that year; otherwise list all years concisely.

## Implementation Steps

### ✅ Payload Trimming (COMPLETED)

1. ✅ Added response trimming utilities in `service/app/tools/payload_trimmers.py` with dedicated functions for each tool's response shape.
2. ✅ Implemented datasource reducer (`trim_datasource_entry` & `trim_datasources_response`) that:
   - Filters to only `successfulSources` (drops `removedSources[]` and `failedSources[]` entirely).
   - For each source, keeps only: `datasourceName`, `sourceType`, `retrievalMethod`, `geographicalLocation`, `startYear`, `endYear`, `subSector`/`subCategory` names + reference number, `scope` name, `issue`, `scaleFactor`, and compact data summary.
   - Strips `datasourceId`, `records`, `inventoryValues`, publisher metadata, and long description fields.
3. ✅ Integrated trimmers into `service/app/tools/cc_inventory_wrappers.py`:
   - `cc_list_user_inventories` uses `trim_inventory_for_listing` to keep inventoryId, name, year, type, city name/locode.
   - `cc_get_inventory` uses `trim_inventory_detailed` to keep inventory details + city metadata (no GeoJSON).
   - `cc_get_all_datasources` uses `trim_datasources_response` for compact source summaries.
4. ✅ Updated `service/app/tools/climate_vector_tool.py` to limit vector search matches to top 3 (instead of 5) for token savings.

### ✅ Prompt & Testing (COMPLETED)

3. ✅ Revised `prompts/default.md` with:
   - Clear **Inventory Tool Usage Flow** (4-step sequence): get_user_inventories → confirm ID → get_inventory → get_all_datasources
   - Tool output summarization guidelines for each tool (no JSON dumps, actionable summaries)
   - Reinforced instruction not to ask for inventory ID if tools are available
   - Climate knowledge tool usage clarification (science/policy only, not product support)

### ✅ City Inventory Search (COMPLETED)

5. ✅ Implemented `city_inventory_search` tool with:
   - Search function `_search_inventories_by_city` with case-insensitive regex matching
   - Year filtering support (optional `year` parameter)
   - Results sorted by year descending (newest first)
   - Integrated into `build_cc_inventory_tools` as 4th available tool
   - Updated `prompts/default.md` with:
     - Two flow paths: "browsing without city context" and "searching by city"
     - Tool usage details (parameters, examples, output format)
     - Response summarization guidelines for city search results

## Summary

All 5 core tasks of the payload limitation and tool enhancement phase are now complete:

- ✅ Payload trimming utilities created and tested (69.3% token reduction)
- ✅ All 4 inventory tools (get_user_inventories, get_inventory, get_all_datasources, city_inventory_search) have optimized payloads
- ✅ Prompt revised with clear tool usage flows and summarization guidelines
- ✅ Comprehensive tests created and passing
- ✅ City-level inventory lookup implemented with year filtering and sorting
