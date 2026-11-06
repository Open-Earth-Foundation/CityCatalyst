# UA03-r3 — English review copy

Translation of the recorded Polish interaction. Scores come from revised-judgments.json, not the older translation summary. Missing transport is marked explicitly.

## Turn 1

**User**

I have our previous inventory in Excel and would like to use it in CityCatalyst. How can I enter it without having to retype everything manually?

**Climate Advisor**

You can avoid manual retyping by preparing an Excel file to import data into the inventory.

1. **Create or open the correct inventory** in CityCatalyst — for the city and year to which the spreadsheet relates.
2. **Check the available import template** in the data/data sources section. The safest approach is to transfer the data into that template's structure rather than importing an arbitrary layout of an existing file.
3. In Excel, organize the data so that, for each entry, the following are clear, among other things:
   - sector and subsector,
   - data year,
   - activity or consumption value,
   - unit,
   - data source,
   - emission factor used, if already available,
   - emission scope, if defined.
4. **Import the file**, then verify column mapping, units, and calculation results. Pay particular attention to electricity, fuels, waste, and transport — incorrect units can significantly change the result.
5. Manually fill in only fields that cannot be reliably transferred from the spreadsheet, e.g. source metadata, assumptions, or missing sector breakdowns.

If your version of CityCatalyst has no Excel import option for a given module, it is worth using the file as source material and entering data in aggregate by sector, rather than record by record. I can also help translate your spreadsheet layout into the structure required for the inventory — describe the columns you have in Excel.

## Turn 2

**User**

Can I upload that file here? How can I check the year, units, and assignment of data to sectors before confirming?

**Climate Advisor**

Yes — if you see an **attachment** icon or an option to add a file in this chat, you can upload the Excel spreadsheet here. I can then help review its structure and indicate how to prepare the data for entry into CityCatalyst. I will not confirm or change your inventory without your explicit decision.

Before confirming, it is worth checking three areas:

1. **Year**
   - check that all data concern the same inventory year;
   - separate data from different years, e.g. bills for a period spanning two years;
   - make sure the year in the file matches the year of the selected inventory in CityCatalyst.

2. **Units**
   - verify units for every value: e.g. kWh/MWh of energy, litres of fuel, tonnes of waste, km or passenger-kilometres in transport;
   - check conversion factors, especially MWh vs kWh, kg vs t, and m³ vs litres;
   - do not mix activity values with already calculated CO₂e emissions — they should be clearly marked.

3. **Assignment to sectors**
   - compare every row with its target category in CityCatalyst, e.g. stationary energy, transport, waste, industrial processes, and agriculture/land use — depending on the inventory scope;
   - check that electricity, fuels, and heat are not counted twice;
   - for transport, distinguish data on municipal vehicles, public transport, traffic within the city area, and fuels sold — the correct assignment depends on the methodology;
   - retain information about the source and assumptions with each record.

After uploading, it is best to review the import preview: column mapping, recognized units, year, and sector/subsector for each dataset. If anything is ambiguous, correct it before confirming — do not automatically confirm the entire import.

## Turn 3

**User**

What should I check before final confirmation?

**Climate Advisor**

Before final confirmation, perform a short quality check:

- **Scope and year:** whether the data concern the correct city, administrative boundaries, and a single inventory year.
- **Sector completeness:** whether all relevant sectors have been included and whether missing data are marked as missing rather than zero.
- **Units and conversion factors:** e.g. kWh vs MWh, litres vs m³, kg vs t; also check conversion factors and emission factors.
- **Mapping to sectors:** whether electricity, heat, fuels, transport, waste, and process emissions have gone into the correct categories.
- **Double counting:** make sure the same energy or fuel does not appear in two sectors or simultaneously as consumption data and as calculated emissions.
- **Credibility of results:** compare total emissions and the largest sectors with the previous year or a similar city. Explain and document large deviations.
- **Boundaries and emission scopes:** check whether emission scopes and emissions outside the city area are treated in accordance with the adopted methodology — especially for electricity, transport, and waste.
- **Data sources:** whether each dataset has a source, period, data owner, and a description of any assumptions or estimates.
- **Confidential data and duplicates:** remove unnecessary personal data, check for repeated records and negative values.
- **Technical check:** review validation messages, uncompleted fields, and the mapping preview before confirming.

A good final step is to save a list of exceptions: what was estimated, what is missing, which conversion factors were used, and why. This makes subsequent audits and inventory updates easier.
