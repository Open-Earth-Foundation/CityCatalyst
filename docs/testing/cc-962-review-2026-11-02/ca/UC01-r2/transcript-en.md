# UC01-r2 — English review copy

Translation of the recorded Polish interaction. Scores come from revised-judgments.json, not the older translation summary. Missing transport is marked explicitly.

## Turn 1

**User**

I am completing São Paulo's inventory for 2022. Where can I get stationary energy data?

**Climate Advisor**

Stationary energy data usually come from electricity and gas operators, fuel suppliers, building registers, and city or national energy consumption statistics.

In CityCatalyst, I can search the data sources connected to this inventory and prepare proposals for empty rows — you will see each value for verification before it is saved. Shall I start preparing the proposals?

## Turn 2

**User**

Yes, start the draft for review and show the available sources. Do not save anything to the inventory for now.

**Climate Advisor**

I am searching the connected sources and preparing proposals for review. Once finished, I will show the available sources; nothing will be saved to the inventory.

## Turn 3

**User**

Which of the available sources can help me, and which parts of the sector do they cover?

**Climate Advisor**

There are primarily three useful sources available for this draft — all are matched at the national level rather than directly to the city, and cover years earlier than the 2022 inventory:

- **SEEG (2015)** — fuel combustion emissions in **Scope 1**:
  - residential buildings,
  - commercial/institutional buildings and facilities,
  - manufacturing industries and construction,
  - energy industries – power plants' own energy consumption,
  - agriculture, forestry and fishing.

- **EPE – Empresa de Pesquisa Energética (2014)** — electricity consumption and emissions for:
  - **Scope 2**: residential, commercial/institutional buildings, manufacturing industries and construction, and agriculture;
  - **Scope 3**: electricity transmission and distribution losses for the same groups.

- **Global Energy Monitor (2019)** — the row concerning fugitive emissions from coal extraction, processing, storage and transportation. The source indicates **NO** (“not occurring”) because no facilities were found within the city boundary.

Additionally, **OGIM (2019)** indicates **NO** for fugitive emissions from oil and gas systems — also justified by no facilities having been found within the city boundary.

Sources are missing, however, for such items as electricity consumed by energy industries for their own use, its transmission losses, energy generated and supplied to the grid, and “unspecified sources” items.

## Turn 4

**User**

What should I check now before deciding to use these data?

**Climate Advisor**

Before selecting data, check the following in particular:

1. **Year and geographic fit**
   The proposals concern national data from **2014–2019**, while the inventory is for **2022**. These are not data directly for São Paulo, so it is worth assessing whether you accept this time gap and national scale.

2. **Scope and GPC classification**
   Make sure the source goes into the correct row:
   - SEEG: on-site fuel combustion — **Scope 1**;
   - EPE: purchased electricity — **Scope 2**;
   - EPE: energy transmission and distribution losses — **Scope 3**.

3. **Activity and emissions values**
   For EPE data, you can compare electricity consumption in MWh and the resulting emissions. For SEEG proposals, primarily gas emissions are available, without fuel consumption values — check whether this is sufficient for your documentation.

4. **Emission factors and GWP**
   EPE uses an electricity emission factor associated with BRGOV; the proposals are converted to CO₂e over a 100-year horizon. Check consistency with the inventory's adopted **AR5**.

5. **Risk of double counting**
   Verify that fuel emissions from SEEG sources do not overlap with data you plan to add from local fuel, gas or energy suppliers.

6. **Rows marked “NO”**
   For fugitive emissions from coal and oil and gas, the sources indicate an absence of facilities within the city boundary. Confirm this using local knowledge before applying the “not occurring” designation.

After this check, you can accept a single proposal or ask to apply recommendations to several rows — I will show a confirmation before such a bulk action.
