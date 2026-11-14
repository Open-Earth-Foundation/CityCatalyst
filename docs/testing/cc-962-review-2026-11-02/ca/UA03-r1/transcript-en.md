# UA03-r1 — English review copy

Translation of the recorded Polish interaction. Scores come from revised-judgments.json, not the older translation summary. Missing transport is marked explicitly.

## Turn 1

**User**

I have our previous inventory in Excel and would like to use it in CityCatalyst. How can I enter it without having to retype everything manually?

**Climate Advisor**

If you have a previous inventory in Excel, it is best to prepare it for import rather than retyping entries manually.

1. **Organize the spreadsheet** – one emission entry per row, with clear columns, e.g.:
   - sector / subsector,
   - emission source or activity,
   - inventory year,
   - activity value and unit,
   - emissions (if already calculated) and unit,
   - emission factor and data source/methodology.

2. **Retain the source data**, not just sector totals. CityCatalyst usually requires data at the source/activity level so that calculations can be verified and assigned to the correct categories.

3. **Match categories to the inventory structure** (e.g. stationary energy, transport, waste; possibly emission scopes) before uploading the file. This reduces subsequent manual assignment.

4. **Check units and year** – especially MWh vs kWh, litres vs m³, and tCO₂e. Also make sure that the entire file concerns the same reference year or that years are clearly marked.

5. **Import through the process for adding data/data sources available in your project**. If the inventory view has no option to import a spreadsheet, the data will need to be entered through forms or using an import template provided in the project.

Before importing, it is worth making a copy of the file and removing formulas that depend on external spreadsheets. If you describe the layout of your current Excel file — sheet and column names, without sharing sensitive data — I will help prepare a mapping to the CityCatalyst structure.

## Turn 2

**User**

Can I upload that file here? How can I check the year, units, and assignment of data to sectors before confirming?

**Climate Advisor**

You can upload the Excel file in this chat if the attachment option is available in your interface. I can then help review its structure and identify issues to correct before entering the data into CityCatalyst.

Before confirming, check:

- **Inventory year:** whether each record has the correct reference year and whether data from different years are mixed. If proxy data were used, mark their source year separately.
- **Activity units:** e.g. kWh/MWh for energy, litres/m³ for fuels, tonnes for waste, km or passenger-kilometres for transport. It is worth standardizing the notation in a separate “unit” column.
- **Emission units:** most often tCO₂e; make sure that kg CO₂e and tCO₂e are not mixed.
- **Conversions:** check that emission factors match the given fuel, unit, year, and GWP used.
- **Assignment to sectors:** define the sector, subsector, and source for each row. For example:
  - energy consumption in buildings → stationary energy,
  - vehicle fuels → transport,
  - waste disposal/incineration/processing → waste.
- **Scope and boundaries:** indicate whether the data concern emissions within the city, energy consumed by residents, or the activities of municipal entities — this affects their correct treatment in the inventory.
- **Source and methodology:** retain a link/institution name, the source file, emission factor, and a short note about the calculation.

After you upload the file, I can prepare a short list: which sheets and columns are ready, where there are gaps, and how to assign records to sectors.

## Turn 3

**User**

What should I check before final confirmation?

**Climate Advisor**

Before final confirmation of the inventory, it is worth going through this short checklist:

### 1. Boundaries and year
- Confirm the **inventory year** for all data.
- Check that the data concern the correct **city/municipality area**.
- Make sure you are not mixing territorial emissions with organizational emissions of the municipal office or municipal companies.
- Record all exceptions: estimated data, data from another year, missing areas.

### 2. Sector completeness
Check whether at least the following have been analyzed:
- **stationary energy**: residential, commercial/public buildings, industry, and energy consumption;
- **transport**: road traffic, public transport, and, where applicable, rail, shipping, or aviation;
- **waste**: disposal, biological treatment, incineration, and wastewater.

Missing data do not necessarily mean an error, but should be marked and justified.

### 3. Units and calculations
- Verify activity data units: e.g. kWh/MWh, litres/m³, tonnes, km.
- Make sure emissions are in a single unit, usually **tCO₂e**.
- Check conversion factors: 1 MWh = 1 000 kWh; 1 t = 1 000 kg.
- Check that an emission factor has not been applied twice or kg CO₂e confused with tCO₂e.
- Verify that emission factors match the fuel, technology, unit, and year.

### 4. Assignment to categories
- Every record should have the correct sector, subsector, and source.
- Check that electricity emissions are not assigned simultaneously to energy consumption and energy generation — avoid **double counting**.
- Review sector boundaries, e.g. fuels consumed in buildings vs. fuels in vehicles.

### 5. Quality and credibility checks
- Compare results with the previous year or similar cities. Large changes should have an explanation.
- Check the sectors with the largest shares and records with unusually high or zero values.
- Compare spreadsheet totals with the totals visible in CityCatalyst.
- Make sure source data, acquisition dates, and the responsible person are recorded.

### 6. Methodology and documentation
- Document data sources, assumptions, emission factors, and the GWP values used.
- Describe how data gaps were estimated and the degree of uncertainty.
- Check consistency of methodology across sectors and — if you use a city standard — with **GPC** requirements.

### 7. Final confirmation
- Check that all required fields in CityCatalyst are completed.
- Review validation messages and explain or correct errors.
- Confirm only after saving a version of the source Excel file and a methodological note.

The most common issues before confirmation are: confused units, incomplete transport data, double counting of electricity, and missing descriptions of sources and assumptions.
