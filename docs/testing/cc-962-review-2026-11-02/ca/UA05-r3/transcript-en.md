# UA05-r3 — English review copy

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

I can help prepare the data for entry, but I cannot save them directly in the inventory from this chat.

To identify the correct inventory for 2024, please provide the city (and the inventory name if there is more than one for this city and year).

To enter:
- **Residential buildings** — Scope 1: **1 200 tCO₂e**
- **Road transport** — Scope 1: **800 tCO₂e**
- **Overall**: **2 000 tCO₂e**

Treat the “Total” row as a check on the result, rather than a separate emission entry, to avoid doubling the emissions.

## Turn 2

**User**

The total of 2000 tonnes is only a summary of these two rows. How can I check that the data have actually gone into the correct year and will not be counted twice?

**Climate Advisor**

Yes — treat **2 000 tCO₂e solely as a control total**, not as a third record to enter.

After saving the data, check the following in the inventory for **2024**:

1. **The correct year and inventory**  
   Make sure the heading shows the base/reporting year **2024** and the correct city and inventory name.

2. **Two source records**  
   There should be exactly:
   - Residential buildings, Scope 1 — **1 200 tCO₂e**
   - Road transport, Scope 1 — **800 tCO₂e**

3. **No separate “Total” entry**  
   Do not add a “Total” category or an emission source with a value of 2 000 tCO₂e. This is the most important safeguard against double counting.

4. **A check of the sector/overall total**  
   The total value for these two entries should be **2 000 tCO₂e**:
   \[
   1\,200 + 800 = 2\,000\ \text{tCO₂e}
   \]
   If you see **4 000 tCO₂e**, both the two detailed rows and the summary row were probably added.

5. **Scope and classification**  
   Verify that both entries have **Scope 1** and that each entry has been assigned to the correct sector/category. Do not enter the same emissions again in Scope 2, Scope 3, or another overlapping category.

It is good practice to retain the source table and a short note: “The value 2 000 tCO₂e is solely a control total for the Residential buildings and Road transport entries.”

## Turn 3

**User**

Are these two values sufficient, or do you need any more details from me before I enter them?

**Climate Advisor**

To enter the values themselves, some basic information is still needed to assign them correctly in the inventory:

- **The city and correct inventory for 2024** — especially if you have more than one.
- **Data source** for each value, e.g. the municipal office, grid operator, fuel statistics, model/estimate.
- **Calculation method**: whether 1 200 and 800 tCO₂e are already calculated emissions or result from activity data × emission factors.
- **Organizational/geographical scope**: whether the data cover the entire city and the full year 2024.
- **More precise category assignment**:
  - for residential buildings: the fuel/carrier type or information that it is a total value for fuels burned on site;
  - for road transport: whether it includes all traffic within the city, or only the municipal fleet / residents' traffic.
- **Standard and GWP**, if not already established in the inventory — e.g. the set of IPCC factors used to calculate CO₂e.
- **Information on avoiding data overlap**: confirmation that these emissions are not already included in another import or source.

If the numbers are already final results in tCO₂e, you do not need to provide emission factors again, but it is worth retaining their source and method for audit purposes.
