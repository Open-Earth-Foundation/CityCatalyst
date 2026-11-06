# UC02-r2: recorded CA conversation

## Turn 1

**User**

Prepare stationary energy proposals for São Paulo’s 2022 inventory so that I can review them. Do not save anything to the inventory.

**Climate Advisor**

I’m preparing source-backed Stationary Energy proposals for review. They’ll appear in the review pane when ready; nothing has been saved to the inventory.

## Turn 2

**User**

Let’s look at the SEEG proposal for residential buildings, Scope 1 (I.1.1). Where do the data come from, what year are they for, and what value are you proposing?

**Climate Advisor**

For **Residential Buildings — Scope 1 (I.1.1)**, the proposal uses **SEEG (Sistema de Estimativa de Emissão de Gases do Efeito Estufa)**.

- **Data origin:** SEEG connected city-level dataset for São Paulo
- **Year:** **2022**, matching the inventory year
- **Proposed emissions:** **1,117,504,701 kgCO₂e** (about **1.11 MtCO₂e**, 100-year GWP)

The underlying gas values are CO₂: 1,111,223,686 kg; CH₄: 19,335 kg; and N₂O: 21,659 kg. The source provides emissions directly; it does not provide an activity quantity or activity unit for this row.

## Turn 3

**User**

Do these data fit our city and this category? What assumptions or limitations should I explain to my team?

**Climate Advisor**

Yes. The SEEG proposal is a **city-level São Paulo 2022** source mapped directly to **Scope 1 residential fuel combustion (I.1.1)**, so it fits both the inventory geography and reporting year.

**Key assumptions to explain**
- It represents fuel combusted in residential buildings **within the city boundary**.
- It treats the reported fuel use as energy combustion, rather than industrial feedstock use.
- The total combines CO₂, CH₄, and N₂O using **100-year AR5 global-warming potentials**.

**Limitations**
- SEEG provides emissions directly, not a fuel-consumption quantity or unit, so the underlying activity data cannot be independently checked in this proposal.
- The proposal is an aggregate residential estimate; it does not show a fuel-by-fuel or building-type breakdown.
- The source record does not provide a methodology field or emission factors, so document it as a connected source estimate rather than a locally calculated inventory result.
