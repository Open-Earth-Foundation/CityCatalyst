# UC01-r3 — English review copy

Translation of the recorded Polish interaction. Scores come from revised-judgments.json, not the older translation summary. Missing transport is marked explicitly.

## Turn 1

**User**

I am completing São Paulo's inventory for 2022. Where can I get stationary energy data?

**Climate Advisor**

To see the data sources and stationary energy proposals available for this inventory, the sector draft first needs to be started. I can prepare it — the system will search the connected datasets and show values for verification before saving. Shall I start the draft?

## Turn 2

**User**

Yes, start the draft for review and show the available sources. Do not save anything to the inventory for now.

**Climate Advisor**

I have started preparing the draft. When it is ready, the proposals and available sources will appear in the review panel; nothing will be saved to the inventory.

## Turn 3

**User**

Which of the available sources can help me, and which parts of the sector do they cover?

**Climate Advisor**

The available and **applicable** sources mainly include national data, so it is worth treating them as a starting point for the São Paulo 2022 review:

- **SEEG (2015, national level)** — fuel combustion emissions in **scope 1** for:
  - residential buildings,
  - commercial and institutional buildings,
  - manufacturing industries and construction,
  - energy industries (power plants' auxiliary energy consumption),
  - agriculture, forestry and fishing.

- **EPE — Empresa de Pesquisa Energética (2014, national level)** — electricity consumption and associated emissions for:
  - **scope 2**: residential, commercial and institutional buildings, manufacturing industries and construction, and agriculture;
  - **scope 3**: electricity transmission and distribution losses for the same four groups.

- **Global Energy Monitor (2019, national level)** — indicates the **NO** (“not occurring”) designation for fugitive emissions from coal extraction, processing, storage and transportation: no such facilities were detected within the city boundary.

- **OGIM — Oil and Gas Infrastructure Mapping (2019, national level)** — indicates **NO** for fugitive emissions from oil and gas systems: no facilities were detected within the city boundary.

No suitable source was found for some rows: scopes 2 and 3 for auxiliary energy consumption in power plants, production of energy supplied to the grid, and the “unspecified sources” category.

## Turn 4

**User**

What should I check now before deciding to use these data?

**Climate Advisor**

Before accepting the proposals, check the following in particular:

1. **Year and geographic fit**  
   The inventory concerns São Paulo in **2022**, whereas the available data are national and older: SEEG from 2015 and EPE from 2014. Assess whether they are sufficient as a proxy or whether you have newer city/regional data.

2. **Correct scope and subsector**  
   Make sure the source goes into the correct GPC row:
   - SEEG: fuel combustion in scope 1,
   - EPE: grid energy consumption in scope 2 and transmission and distribution losses in scope 3.

3. **Activity and emissions values**  
   Check units, fuel or electricity consumption, and CO₂e emissions. For SEEG rows, the proposals contain gas emissions, but not always the quantity of fuel consumed; EPE contains electricity consumption in MWh and associated emissions.

4. **Emission factors and methodology**  
   For EPE proposals, the electricity emission factor is associated with BRGOV; World Bank is indicated for transmission and distribution losses. Check whether these correspond to the methodology and GWP used in the inventory (AR5).

5. **Completeness and possible double counting**  
   Check whether the categories overlap with other inventory data and whether the separation between scopes 1, 2 and 3 is maintained.

6. **“NO” designations for fugitive emissions**  
   Global Energy Monitor and OGIM indicate an absence of relevant facilities within the city boundary. Verify this against local registers before setting “NO”.

7. **Data gaps**  
   There are still no sources for some energy industry items and the “unspecified sources” category. Decide whether to leave them empty or mark them with the appropriate notation key after confirming the scope.
