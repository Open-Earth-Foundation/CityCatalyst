# UB04-r3 — English review copy

Translation of the recorded Polish interaction. Scores come from revised-judgments.json, not the older translation summary. Missing transport is marked explicitly.

## Turn 1

**User**

For the note, I need emissions per resident for 2024, with the unit. Can you calculate this and tell me which data you are using?

**Climate Advisor**

I can calculate this, but the number of residents for 2024 is missing from the available data.

For the inventory **Brzeg Nadziei (test), 2024**, total emissions are:

- **1 800 000 000 kg CO₂e**, or **1 800 000 t CO₂e**

Formula:
**emissions per resident = 1 800 000 t CO₂e ÷ number of residents in 2024**

I will give the result in **t CO₂e/resident/year** (possibly also in kg CO₂e/resident/year).

I am using:
- total emissions from the GPC Basic+ inventory for 2024 (GWP AR6),
- the city's population for 2024 — this value is currently absent from the inventory data.

Please provide the number of residents (and the source, if it should be indicated in the note), and I will calculate the indicator.

## Turn 2

**User**

In the city data, I have 100 thousand residents. Can you recalculate the result using this number and show the calculation?

**Climate Advisor**

Yes.

**Data:**
- Total emissions in 2024: **1 800 000 t CO₂e**
- Number of residents: **100 000**

**Calculation:**

\[
\frac{1\,800\,000\ \text{t CO₂e}}{100\,000\ \text{residents}}
= 18\ \text{t CO₂e/resident/year}
\]

**Result: 18 t CO₂e per resident per year**  
that is **18 000 kg CO₂e/resident/year**.

The calculation used total emissions from the city's inventory for 2024 (GPC Basic+, AR6 GWP factors) and the number of 100 thousand residents you provided.

## Turn 3

**User**

And what was this indicator in 2023 with the same number of residents? Can I treat it as the complete result for the city?

**Climate Advisor**

For 2023, total emissions were **1 500 000 t CO₂e**.

With the same population — **100 000 residents**:

\[
\frac{1\,500\,000\ \text{t CO₂e}}{100\,000\ \text{residents}}
= 15\ \text{t CO₂e/resident/year}
\]

**Indicator for 2023: 15 t CO₂e/resident/year**  
that is **15 000 kg CO₂e/resident/year**.

For comparison, in 2024 the indicator was **18 t CO₂e/resident/year**, so with a constant number of residents it increased by **3 t CO₂e/person**, or **20%**.

However, I would not treat it as a fully complete result for the city. The 2023 inventory is GPC Basic+ and includes completed data for stationary energy, transport and waste, but the **IPPU** and **AFOLU** sectors have no data entered. The indicator is therefore correct for the emissions currently included, but may not cover all urban emission sources.
