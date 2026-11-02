# UA05-r1 — English review copy

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

I cannot directly add data to the inventory from the chat, but you can enter them in the inventory for 2024 as:

- **Residential buildings — Scope 1:** 1 200 tCO₂e  
- **Road transport — Scope 1:** 800 tCO₂e  

The total value is **2 000 tCO₂e**. Treat the “Total” row as a check, rather than as an additional emission entry, to avoid doubling the emissions.

## Turn 2

**User**

The total of 2000 tonnes is only a summary of these two rows. How can I check that the data have actually gone into the correct year and will not be counted twice?

**Climate Advisor**

Yes — since **2 000 tCO₂e** is only the sum of two entries, do not add this row as a separate category.

To check correctness in CityCatalyst:

1. Open the inventory with the base year **2024** — make sure you are not editing a different year.
2. Enter only two entries:
   - Residential buildings, Scope 1: **1 200 tCO₂e**
   - Road transport, Scope 1: **800 tCO₂e**
3. Do not create a “Total” / “Overall” entry as an emission source or category.
4. After saving, check the emissions summary view:
   - the total value for these two entries should be **2 000 tCO₂e**;
   - the sector breakdown should show **1 200** and **800 tCO₂e**, respectively, without a third entry of 2 000 tCO₂e.
5. Check the sources/data list and search for “Total” or “2000”. If such a record was added, delete it or mark it as excluded from counting.

If you provide the city's name, I can first check whether you have the correct inventory for 2024 available.

## Turn 3

**User**

Are these two values sufficient, or do you need any more details from me before I enter them?

**Climate Advisor**

For manually entering these two values, the basic data you already have are sufficient: year, category, scope, and emissions.

Before saving, it is also worth confirming:

- that the selected inventory concerns **2024**;
- the unit: **tCO₂e**;
- category assignment consistent with the sector layout in CityCatalyst:
  - **Residential buildings** → Scope 1, 1 200 tCO₂e,
  - **Road transport** → Scope 1, 800 tCO₂e;
- whether the values concern the entire city and the full year 2024, rather than only part of the area or period;
- the data source and any calculation method — this will be useful for documentation and subsequent verification;
- that **2 000 tCO₂e** remains solely a control total, without a separate entry.

If CityCatalyst requires additional fields when adding a source, these will most often be the source name, data coverage period, unit, and a short description/method.
