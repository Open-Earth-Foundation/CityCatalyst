# UA05-r2 — English review copy

Translation of the recorded Polish interaction. Scores come from revised-judgments.json, not the older translation summary. Missing transport is marked explicitly.

## Turn 1

**User**

I have a small table for our city. Can you add these data to the inventory for 2024?

| Year | Category | Scope | Emissions (tCO2e) |
|---|---|---|---:|
| 2024 | Residential buildings | Scope 1 | 1200 |
| 2024 | Road transport | Scope 1 | 800 |
| 2024 | Total | — | 2000 |

**Climate Advisor**

I can help prepare the data, but I cannot save them directly to the inventory from this chat.

For 2024, the data to enter are:
- **Residential buildings — Scope 1:** 1 200 tCO₂e
- **Road transport — Scope 1:** 800 tCO₂e

**Total:** 2 000 tCO₂e.
The total should usually not be added as a separate emission category, to avoid double counting — it should follow from the two source entries.

In CityCatalyst, select the city's inventory for **2024**, then add or update these two entries in the appropriate sectors. If you specify the import layout you are working with, I can prepare a table in the required format.

## Turn 2

**User**

The total of 2000 tonnes is only a summary of these two rows. How can I check that the data have actually gone into the correct year and will not be counted twice?

**Climate Advisor**

To check this:

1. **Open the inventory with the base year 2024** — make sure the inventory heading/settings indicate exactly 2024, rather than the reporting year or a different draft.
2. **Check the two source entries**:
   - Residential buildings, Scope 1: **1 200 tCO₂e**
   - Road transport, Scope 1: **800 tCO₂e**
3. **Do not add the “Total” row as a separate category or data source.** The value **2 000 tCO₂e** should appear solely as an automatic summary of these two entries.
4. **Check the emissions summary for Scope 1**. If these are the only entries within this scope, the total should be **2 000 tCO₂e**. If there are other Scope 1 sources as well, check that the increase in the overall total relative to the previous value is exactly 2 000 tCO₂e.
5. **Check the sources/input data list** after importing: only two emission records should be visible, without a third record with the category “Total”.

If the import requires a file, remove the “Total” row before uploading — keep it only in your own spreadsheet as a quality check.

## Turn 3

**User**

Are these two values sufficient, or do you need any more details from me before I enter them?

**Climate Advisor**

The values alone are sufficient only for a simple manual entry of emissions in the appropriate Scope 1 entries. Before entering them, however, it is worth also having:

- **The exact unit and calculation method** — confirmation that 1 200 and 800 are already in **tCO₂e**, rather than, for example, MWh, litres of fuel, or tonnes of CO₂.
- **Data period** — whether they concern the entire calendar year 2024.
- **Inventory boundaries** — whether they cover the entire city and a scope consistent with your inventory.
- **Data source** — e.g. the municipal office, grid operator, traffic survey, fuel invoices; this will be useful for audits and subsequent updates.
- **Category assignment method**:
  - “Residential buildings” — which fuels/consumption it includes,
  - “Road transport” — whether it includes local traffic, transit traffic, private vehicles and/or the municipal fleet.
- **Risk of overlapping data** — confirmation that these values are not already included in other records, e.g. in an aggregated buildings or transport category.

Do not enter the row **“Total: 2 000 tCO₂e”** separately. It is only a control summary of two records.
