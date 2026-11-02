# UA03-r2 — English review copy

Translation of the recorded Polish interaction. Scores come from revised-judgments.json, not the older translation summary. Missing transport is marked explicitly.

## Turn 1

**User**

I have our previous inventory in Excel and would like to use it in CityCatalyst. How can I enter it without having to retype everything manually?

**Climate Advisor**

Yes — it is best to prepare the spreadsheet for import rather than retyping data manually. The general process in CityCatalyst looks like this:

1. **Create or open an inventory** for the correct city and base year.  
2. Go to the relevant emission sector (e.g. stationary energy, transport, waste) and select the **add/import data** option, if available.  
3. **Map the Excel columns** to the required CityCatalyst fields — these usually include the year, sector/subsector, activity (e.g. fuel or energy consumption), unit, emission factor, and data source.  
4. If the platform provides an **import template**, download it and transfer the data from your existing file into that layout. This is the safest way to avoid unit and classification errors.  
5. After importing, check the values, assignment to sectors, data years, and emission factors applied. Then fill in sources and assumptions for auditability.

Before importing, it is also worth:
- keeping raw data in a separate sheet,
- standardizing units (e.g. kWh, MWh, GJ, litres, tonnes),
- separating data by sector and energy carrier/fuel,
- marking missing data and estimates,
- checking whether the previous inventory used the same year and methodology (e.g. GPC).

If your version of CityCatalyst has no import option for a given sector, data can usually be entered in aggregate by category, using Excel as a working file and copying only aggregated values.

## Turn 2

**User**

Can I upload that file here? How can I check the year, units, and assignment of data to sectors before confirming?

**Climate Advisor**

If you see an attachment icon or an option to add a file in this chat, you can upload Excel here. I can then help review its structure: sheets, years, units, columns, and suggest assignment to sectors before the data are entered into CityCatalyst.

Before confirming, it is worth going through a short check:

- **Inventory year:** check whether each record concerns the selected base year or whether years are clearly marked. Do not combine data from different years without marking them.
- **Units:** make sure each activity value has a unit, e.g. kWh/MWh of electricity, GJ of gas, litres of fuel, tonnes of waste. Pay particular attention to thousand/million multipliers and kWh vs MWh.
- **Sectors and subsectors:** assign the data to the correct areas, e.g.:
  - energy in buildings and facilities,
  - road or off-road transport,
  - solid waste and wastewater,
  - industrial processes or agriculture — if within scope.
- **Data type:** separate activity data (e.g. fuel consumption) from already calculated CO₂e emissions. This is important to avoid counting the same emissions twice.
- **Scope and boundaries:** check whether the data concern the entire city area and whether they include emissions outside its boundaries.
- **Sources and assumptions:** retain the source name, data period, emission factors used, and a description of any estimates.

It is best not to confirm the import immediately: first compare sector summaries with the previous Excel file and check whether values have increased/decreased solely because of a change in units or classification.

## Turn 3

**User**

What should I check before final confirmation?

**Climate Advisor**

Before final confirmation, perform a short quality check:

1. **Correct year and city boundaries**
   - Do all data concern the selected inventory year?
   - Do they cover the correct administrative area of the city, rather than, for example, the entire county, region, or area served by a utility provider?

2. **Sector completeness**
   - Have all relevant sectors been included: buildings/energy, transport, waste, and — where applicable — industrial processes and agriculture?
   - Are empty sectors actually zero, or are their data simply missing?

3. **Units and conversions**
   - Do the units match the source data: kWh vs MWh, GJ vs MJ, litres vs m³, kg vs t?
   - Have values been converted twice?
   - Have activity data been distinguished from emissions already expressed in tCO₂e?

4. **Assignment to sectors**
   - Have energy in buildings, transport, waste, and other sources gone into the correct sectors and subsectors?
   - Is there any double counting, e.g. fuel consumption and the corresponding previously calculated emissions in two different places?

5. **Emission factors and GWP**
   - Do the emission factors match the year, fuel, and location?
   - Has a consistent set of GWP (global warming potential) values been used throughout the inventory?
   - Is it known whether electricity is calculated using the correct grid mix?

6. **Comparison with the previous inventory**
   - Are total emissions and sector results credible compared with the previous Excel file?
   - For larger changes, prepare a brief explanation: a change in boundaries, methodology, activity, factors, or data quality.

7. **Sources, assumptions, and audit trail**
   - Have the source, period, data owner, and collection method been recorded with the data?
   - Have estimates, extrapolations, missing data, and manual corrections been documented?
   - Can the calculations be reproduced from the input data?

8. **Logical checks**
   - Are there any negative values, unexpected zeros, or jumps of an order of magnitude?
   - Do subsector totals match sector totals?
   - Do sector shares look realistic for the city?

Finally, it is worth confirming only after checking the total emissions summary, the largest sectors, and the list of missing data. If you upload the file, I can help prepare a list of specific checks for its sheets and columns.
