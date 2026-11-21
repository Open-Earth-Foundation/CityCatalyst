# UC01-r2: recorded CA conversation

## Turn 1

**User**

I am completing São Paulo’s inventory for 2022. Where can I get stationary energy data?

**Climate Advisor**

To see the data sources connected to this inventory and their Stationary Energy coverage, I need to start a Stationary Energy draft run. It will prepare source-backed proposals for your review without writing anything to the inventory.

Would you like me to start it?

## Turn 2

**User**

Yes, prepare a draft for review and show me the available sources. Do not save anything to the inventory yet.

**Climate Advisor**

I’m searching the connected sources and preparing Stationary Energy proposals for review. Nothing will be saved to the inventory.

## Turn 3

**User**

Which of these sources can help us, and which stationary energy categories do they cover?

**Climate Advisor**

The connected sources that can help this 2022 São Paulo inventory are:

| Source | Stationary Energy categories covered |
|---|---|
| **SEEG** | **Scope 1 fuel combustion** in residential buildings; commercial and institutional buildings; manufacturing and construction; energy-industry auxiliary operations; and agriculture, forestry and fishing. |
| **EPE** | **Scope 2 grid electricity** for residential, commercial/institutional, manufacturing/construction, and agriculture/forestry/fishing. It also provides the corresponding **Scope 3 transmission and distribution losses** for those same categories. |
| **Global Energy Monitor** | Coal mining, processing, storage, and transport fugitive emissions — supports **NO (not occurring)** because no facilities were found within the city boundary. |
| **OGIM** | Oil and gas system fugitive emissions — supports **NO (not occurring)** because no facilities were found within the city boundary. |

There is currently **no applicable source-backed value** for:
- Energy Industries: Scope 2 auxiliary electricity, Scope 3 T&D losses, and generation supplied to the grid.
- Non-specified sources: Scopes 1, 2, and 3.

The other connected datasets were either unavailable for these inputs or did not match São Paulo’s geography.

## Turn 4

**User**

Before I use them, what should I check about their year, geographic coverage and fit for our inventory?

**Climate Advisor**

Before using any proposal, check these three points:

- **Year:** The applicable **SEEG, EPE, Global Energy Monitor, and OGIM** entries are matched to **2022**, the selected inventory year.
- **Geography:** Each applicable entry is matched at the **São Paulo city** level—not merely national or state level. The draft excluded sources that did not match the city geography.
- **Inventory fit:** Confirm the source is assigned to the correct GPC row and scope:
  - **SEEG:** Scope 1 stationary fuel combustion only.
  - **EPE:** Scope 2 purchased electricity and the associated Scope 3 electricity transmission-and-distribution losses.
  - **Global Energy Monitor / OGIM:** Scope 1 fugitive-emissions rows only, as **NO (not occurring)** where no relevant facilities were found in the city boundary.

Also review the data type:
- **SEEG** provides emissions by gas for fuel-combustion categories; activity quantities are not supplied in these proposals.
- **EPE** provides electricity activity in **MWh**, associated CO₂ emissions, and the emission factor used.
- The fugitive-emissions sources provide a notation key and explanation—not an emissions value.

The draft proposals are source-specific and mapped to their intended Stationary Energy category, so avoid applying a source across categories it does not cover.
