# UC01-r4: recorded CA conversation

## Turn 1

**User**

I am completing São Paulo’s inventory for 2022. Where can I get stationary energy data?

**Climate Advisor**

For this inventory, I can check the connected datasets and identify source-backed options once you start a Stationary Energy draft review.

Common sources include electricity and gas utilities, fuel-sales statistics, building-energy reports, and national or state energy balances. Would you like me to start the draft and look for available sources for São Paulo’s 2022 rows?

## Turn 2

**User**

Yes, prepare a draft for review and show me the available sources. Do not save anything to the inventory yet.

**Climate Advisor**

I’m searching the connected sources and will show the available options for review when the draft is ready. Nothing has been saved to the inventory.

## Turn 3

**User**

Which of these sources can help us, and which stationary energy categories do they cover?

**Climate Advisor**

The connected sources that can support São Paulo’s **2022 Stationary Energy** inventory are:

- **SEEG** — city-level Scope 1 fuel-combustion emissions for:
  - Residential buildings
  - Commercial and institutional buildings
  - Manufacturing industries and construction
  - Energy-industry auxiliary operations
  - Agriculture, forestry, and fishing activities

- **EPE (Empresa de Pesquisa Energética)** — city-level electricity data for:
  - **Scope 2:** grid electricity used by residential, commercial/institutional, manufacturing/construction, and agriculture activities
  - **Scope 3:** transmission-and-distribution losses associated with those same electricity uses

- **Global Energy Monitor** — supports a **NO (not occurring)** notation key for fugitive emissions from coal mining, processing, storage, and transport, because no facilities were found within the city boundary.

- **OGIM (Oil and Gas Infrastructure Mapping)** — supports a **NO** notation key for fugitive emissions from oil and gas systems, also because no facilities were found within the city boundary.

There are no applicable source-backed values currently available for energy-generation supplied to the grid, energy-industry Scope 2 and Scope 3 rows, or non-specified stationary sources.

## Turn 4

**User**

Before I use them, what should I check about their year, geographic coverage and fit for our inventory?

**Climate Advisor**

Before applying a source, check these points:

- **Year alignment:** The applicable **SEEG** and **EPE** records are for **2022**, matching this inventory year. **Global Energy Monitor** and **OGIM** notation evidence is also for 2022.
- **Geographic coverage:** Each applicable record is matched at the **São Paulo city** level—not national or population-downscaled data. Several other connected sources were excluded because their geography did not match the inventory.
- **GPC category fit:** Confirm the proposed row matches the intended subsector and scope:
  - **SEEG:** Scope 1 fuel combustion in residential, commercial/institutional, manufacturing/construction, energy-industry auxiliary operations, and agriculture.
  - **EPE:** Scope 2 purchased grid electricity and Scope 3 transmission-and-distribution losses for residential, commercial/institutional, manufacturing/construction, and agriculture.
  - **Global Energy Monitor / OGIM:** Scope 1 fugitive coal and oil-and-gas rows, respectively, as **NO—not occurring**.
- **Method and units:** SEEG provides direct emissions totals for fuel combustion; activity values are not provided for those proposals. EPE provides electricity activity in **MWh** plus associated emissions. Check that this supports your chosen reporting method and that you do not duplicate data already reported elsewhere.
- **Boundary and completeness:** The NO notation is appropriate only if you accept the evidence that no relevant facilities occur inside the city boundary. Rows with no applicable source should remain unfilled or receive an appropriate notation key after review—not be estimated from unrelated sources.
