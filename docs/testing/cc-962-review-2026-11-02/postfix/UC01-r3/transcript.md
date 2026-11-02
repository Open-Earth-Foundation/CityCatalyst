# UC01-r3: recorded CA conversation

## Turn 1

**User**

I am completing São Paulo’s inventory for 2022. Where can I get stationary energy data?

**Climate Advisor**

For São Paulo’s 2022 Stationary Energy inventory, common data sources include:

- **SEEG** for Brazilian energy and emissions estimates  
- **Electricity utility data** (electricity sales/consumption by customer class)  
- **Natural gas distributor data** (gas consumption by sector)  
- **Fuel sales statistics** and local energy-balance datasets  
- **Municipal, state, or national energy agencies** for sector-specific activity data  

To see which connected sources are available for this inventory and generate row-level, source-backed proposals, I can start the Stationary Energy review run.

## Turn 2

**User**

Yes, prepare a draft for review and show me the available sources. Do not save anything to the inventory yet.

**Climate Advisor**

I’m preparing source-backed Stationary Energy proposals for review. Available sources and row options will appear in the review pane when the draft is ready; nothing has been saved to the inventory.

## Turn 3

**User**

Which of these sources can help us, and which stationary energy categories do they cover?

**Climate Advisor**

The connected sources that can support São Paulo’s **2022** Stationary Energy draft are:

- **SEEG** — city-level Scope 1 emissions for:
  - Residential buildings: fuel combustion
  - Commercial and institutional buildings: fuel combustion
  - Manufacturing industries and construction: fuel combustion
  - Energy industries: power-plant auxiliary operations
  - Agriculture, forestry and fishing: fuel combustion

- **EPE (Empresa de Pesquisa Energética)** — city-level electricity data for:
  - **Scope 2:** grid electricity consumed by residential, commercial/institutional, manufacturing/construction, and agriculture/forestry/fishing activities
  - **Scope 3:** transmission and distribution losses associated with those same electricity uses

- **Global Energy Monitor** — supports a **NO (not occurring)** notation key for fugitive emissions from coal mining, processing, storage and transport, based on no facilities being found within the city boundary.

- **OGIM (Oil and Gas Infrastructure Mapping)** — supports a **NO (not occurring)** notation key for fugitive emissions from oil and gas systems, also based on no facilities being found within the city boundary.

There are no applicable connected sources for Energy Industries Scope 2 and Scope 3, electricity generation supplied to the grid, or the Non-Specified Sources rows.

## Turn 4

**User**

Before I use them, what should I check about their year, geographic coverage and fit for our inventory?

**Climate Advisor**

Check these points before accepting a source:

- **Inventory alignment:** Your inventory is for **São Paulo, 2022**. The applicable **SEEG** and **EPE** candidates are both city-level and match 2022, so they are the strongest fit in this draft.
- **Geographic coverage:** Confirm the source is city-specific—not national, state-level, or population-downscaled. The accepted candidates are tagged as matching the city; several other connected sources were excluded because their geography did not match São Paulo.
- **Category and scope fit:** Use each source only for its proposed GPC row:
  - **SEEG:** Scope 1 fuel-combustion categories for residential, commercial/institutional, manufacturing/construction, energy industries, and agriculture/forestry/fishing.
  - **EPE:** Scope 2 grid-electricity consumption and Scope 3 transmission-and-distribution losses for residential, commercial/institutional, manufacturing/construction, and agriculture/forestry/fishing.
- **Value completeness and units:** EPE electricity rows include activity in **MWh** and emissions; SEEG’s fuel-combustion proposals provide emissions but do not include activity quantities or units in this draft.
- **Notation-key evidence:** Global Energy Monitor and OGIM are city-level 2022 evidence for **NO (not occurring)** in the coal- and oil/gas-fugitive rows, respectively—based on no facilities being found inside the city boundary.
- **Gaps:** Do not substitute a poorly matched source for categories with no applicable candidate. This draft has no applicable source for some Energy Industries, grid-generation, and Non-Specified Sources rows.

