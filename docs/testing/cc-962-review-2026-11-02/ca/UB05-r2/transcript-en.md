# UB05-r2 — English review copy

Translation of the recorded Polish interaction. Scores come from revised-judgments.json, not the older translation summary. Missing transport is marked explicitly.

## Turn 1

**User**

Before I pass the results for 2024 to my supervisor, I would like to check the completeness of our inventory. Which areas have gaps?

**Climate Advisor**

For the inventory **Brzeg Nadziei (test), 2024**, completeness is currently **8%**: 4 of 48 required items have been filled in, and **44 remain missing**.

Gaps by area:
- **Stationary energy (I):** 19 of 21 items are missing — completeness 10%.
- **Transport (II):** 13 of 14 are missing — completeness 7%.
- **Waste (III):** 7 of 8 are missing — completeness 13%.
- **Industrial processes and product use / IPPU (IV):** all 2 required items are missing — 0%.
- **Agriculture, forestry and other land use / AFOLU (V):** all 3 required items are missing — 0%.

All data currently entered come from manual entries or files — there are no data from external sources yet.

## Turn 2

**User**

And what about industrial processes and agriculture and land use? Does a missing value mean that emissions there are zero?

**Climate Advisor**

No. **A missing value does not automatically mean zero emissions.**

For the inventory for 2024:
- **IPPU / industrial processes and product use:** **2 of 2** required items have not been filled in.
- **AFOLU / agriculture, forestry and other land use:** **3 of 3** required items have not been filled in.

This means that these emissions **have not yet been estimated or marked as not occurring**. You therefore cannot conclude from this that they are zero.

In GPC-compliant reporting, a distinction should be made between, among other things:
- **“not occurring” (NO)** — the activity does not take place in the city or emissions are negligible; a justification is required,
- **“not estimated” (NE)** — emissions may occur but have not been calculated or reported,
- **“included elsewhere” (IE)** — emissions are reported in another category,
- **a value of 0** — this can only be given when data or calculations confirm the absence of emissions.

Before passing on the results, it is therefore worth determining for each of these five items whether the source really does not occur or requires an estimate. In GPC, the IPPU and AFOLU categories are part of the **BASIC+** reporting level if they are relevant to the city.
Source: internal climate knowledge base (GPC).

## Turn 3

**User**

What specific data and sources should I collect, and where in the application should I check or fill in these gaps? Do not change anything for now.

**Climate Advisor**

I will not change anything. The **2024** inventory currently lacks two items in **IPPU (IV)** and three in **AFOLU (V)**. It is worth collecting data first and determining for each item whether the source actually occurs within the city.

## IV. Industrial processes and product use (IPPU)

Collect information about emissions **unrelated to fuel combustion**:

1. **Industrial processes**
   - plants producing or processing, among other things, cement/lime, glass, metals, chemicals, fertilizers, coolants;
   - annual production or raw material consumption (e.g. tonnes of clinker, lime, steel, glass);
   - technologies used and, if available, direct emissions data from plants.

2. **Product use**
   - data on the purchase, servicing, replenishment and recovery of refrigerants (HFC and other F-gases) in refrigeration, air conditioning, heat pumps and vehicles;
   - where relevant: the use of foams, aerosols, fire extinguishers and other products containing fluorinated greenhouse gases.

**Best sources:**
- the city's environmental protection or economic affairs department;
- local industrial plants and their environmental reports/permits;
- regional or national registers of emissions and industrial installations;
- companies servicing refrigeration and air conditioning equipment;
- the national inventory report and national emission factors when local data are unavailable.

If there is no significant process industry within the city boundaries and no data indicating the use of the relevant products, you can consider marking an item as **“not occurring”**, but with a brief justification — not as an empty field.

## V. Agriculture, forestry and other land use (AFOLU)

The three missing areas usually correspond to GPC categories:

1. **V.1 Livestock**
   - the number of animals by species (e.g. cattle, pigs, sheep, poultry);
   - housing and solid/liquid manure management systems;
   - data on biogas production or methane recovery, if present.

   **Sources:** agricultural census, government office/official statistics, local agriculture office, farm records, surveys of larger farms.

2. **V.2 Land**
   - land area and land-use changes: forests, arable land, meadows and pastures, wetlands, built-up land;
   - tree felling, afforestation, conversion of land to development or agricultural land;
   - data on the biomass of trees and urban greenery, if available.

   **Sources:** the city's planning and environment department, land records, development plans, surveying/GIS data, the greenery management authority, the forest district or forest managers, satellite images and national land-cover databases.

   This category should account for both **emissions** and **CO₂ removals** by forests and other vegetation where the methodology and data allow.

3. **V.3 Other sources and non-CO₂ emissions from land**
   - mineral and organic fertilizer consumption;
   - crop area and, where applicable, rice cultivation;
   - burning of plant residues or fires on managed land;
   - drained organic soils/peatlands, if present.

   **Sources:** agricultural statistics, local data on fertilizer sales or use, farm surveys, wetland managers, forestry and fire services.

GPC indicates that local or national data should be used where available; if they are lacking, IPCC default factors can be applied and the assumptions documented. Source: **internal climate knowledge base**, GPC.

## Where to check and fill in the gaps in CityCatalyst

In the **GHGI 2024** inventory, go to the emissions sector/category view and open in turn:
- **IV — IPPU**, to see 2 missing items;
- **V — AFOLU**, to see 3 missing items.

For each item:
1. check which activity data and units are required;
2. add source data or an estimate;
3. record the source, data year, method and emission factor;
4. if the category does not occur, mark it as **“not occurring”** and enter a justification;
5. if the activity occurs but data are not yet available, leave it as **“not estimated”** — do not enter zero.

The most urgent step is to confirm with the environment/planning department whether the city contains: process plants, significant refrigeration installations, farms with livestock, agricultural land, forests or wetlands.
