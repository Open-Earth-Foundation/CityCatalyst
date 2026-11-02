# UC02-r3: recorded CA conversation

## Turn 1

**User**

Prepare stationary energy proposals for São Paulo’s 2022 inventory so that I can review them. Do not save anything to the inventory.

**Climate Advisor**

I’m preparing source-backed Stationary Energy proposals for review. Nothing will be saved to the inventory.

## Turn 2

**User**

Let’s look at the SEEG proposal for residential buildings, Scope 1 (I.1.1). Where do the data come from, what year are they for, and what value are you proposing?

**Climate Advisor**

For **Residential Buildings — Scope 1 fuel combustion (I.1.1)**, the proposed source is **SEEG (Sistema de Estimativa de Emissão de Gases do Efeito Estufa)**.

- **Geography and year:** city-level data for **São Paulo, 2022**, matching the inventory year.
- **Proposed emissions:** **1,117,504,701 kgCO₂e** (100-year AR5), or about **1.11 MtCO₂e**.
- **Reported gas values:** CO₂ 1,111,223,686 kg; CH₄ 19,335 kg; N₂O 21,659 kg.
- **Activity data:** the SEEG record reports total fuel consumption but does not provide an activity quantity or unit in this proposal.

It is the only applicable source candidate for this row.

## Turn 3

**User**

Do these data fit our city and this category? What assumptions or limitations should I explain to my team?

**Climate Advisor**

Yes. The SEEG proposal is a **city-level 2022 source for São Paulo**, matching the inventory year, and it maps directly to **Scope 1 Residential Buildings — fuel combustion within the city boundary (I.1.1)**.

Key points to explain to your team:

- **What it represents:** emissions from fuels combusted in residential buildings within São Paulo’s boundary—not electricity use. Grid electricity belongs in the separate Scope 2 residential row.
- **Methodological fit:** the Stationary Energy workflow uses a fuel-consumption approach aligned with GPC guidance and IPCC Tier 1 conventions.
- **Direct source value:** the proposal is taken from the connected SEEG dataset, without modelled interpolation in this workflow.
- **Activity-data limitation:** SEEG supplies emissions by gas but no fuel-consumption quantity or unit for this proposal, so the inventory can document the emissions estimate but not independently reproduce it from fuel activity data here.
- **Boundary/classification check:** confirm that fuels used as industrial feedstock or emissions from industrial processes are not included; those belong in IPPU rather than Stationary Energy.
- **Disaggregation limitation:** this row is an all-residential, all-fuel aggregate, so it does not show results by fuel type or building subtype.
