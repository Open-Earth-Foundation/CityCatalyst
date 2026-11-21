# UA04-r1 — English review copy

Translation of the recorded Polish interaction. Scores come from revised-judgments.json, not the older translation summary. Missing transport is marked explicitly.

## Turn 1

**User**

I have a report on our city's emissions in PDF. Can it be used to fill in the inventory in CityCatalyst? I do not know where to start.

**Climate Advisor**

Yes — a PDF report can be a good starting point for filling in the inventory, provided it contains source data, the inventory year, and a description of the methodology.

**Suggested way to work in CityCatalyst:**
1. **Establish the report's scope**: base year, city boundaries (administrative or functional), gases included in the report, and the GWP factor used.
2. **Check the methodology**: ideally, the report refers to GPC (Global Protocol for Community-Scale GHG Emission Inventories) or clearly describes emission scopes and data sources.
3. **Extract the data by sector**: usually stationary energy/buildings, transport, waste, and — if available — industrial emissions, agriculture, and AFOLU.
4. **Enter the data into the appropriate CityCatalyst sectors**: not only the total emissions value, but also activities and source indicators if the report provides them (e.g. energy consumption, fuels, waste, vehicle mileage).
5. **Add sources and assumptions**: note the report name, page/table, publishing institution, data year, emission factors, and any limitations. This makes subsequent verification easier.
6. **Compare the final result with the report**: after filling in the sectors, check whether the total and sector breakdown match. Differences may result, for example, from different GWP, city boundaries, or assignment of emissions to scopes.

**Where to start in practice:** find the table of total emissions and the sector breakdown in the PDF, then a table or appendix describing data sources and the calculation method. This is usually enough to plan the first entries.

If you upload the PDF or paste the table of contents and emissions table, I will help map the report data to the fields and sectors of the CityCatalyst inventory.

## Turn 2

**User**

I have not uploaded the report anywhere yet. Where should I select it, and how can I check whether the numbers and year have been read correctly?

**Climate Advisor**

You have access to one inventory: **Brzeg Nadziei (test), 2024** — “GHGI 2024” (GPC Basic+; AR6 GWP factors).

To upload the report:
1. Open this inventory in CityCatalyst.
2. Go to the **data sources / activity data** section for the sector to which the report relates, or to the document import function, if available in your view.
3. Select **Add source / Upload file** and choose the PDF from your drive.
4. After the document is processed, check the preview of the extracted data before saving them.

When verifying, pay particular attention to:
- **data year** — it should correspond to 2024 or be deliberately assigned as historical data;
- **units** — e.g. tCO₂e, MWh, GJ, litres, tonnes of waste;
- **sector and emission scope** — whether values have gone into, for example, buildings, transport, or waste;
- **control totals** — compare the sector total in CityCatalyst with the summary table in the PDF;
- **methodology and GWP** — a report using factors other than AR6 may yield slightly different CO₂e values.

If you see a screen with the extracted numbers after uploading, paste its content or upload a screenshot — I will help check the year, units, and assignment to sectors.

## Turn 3

**User**

And if a table is read incorrectly or units are missing, can I check that before saving?

**Climate Advisor**

Yes — before saving, it is worth going through a **preview and verification** of the extracted data. In particular, check every table where the PDF has a complex layout, footnotes, or values in several columns.

Checklist before saving:

- **Value and unit**: for example, whether `1 250` means tCO₂e, MWh, GJ, litres, or tonnes of waste. Do not save values without an unambiguous unit.
- **Data year**: distinguish the report's publication year from the year to which the data relate. A report from 2025 may describe emissions for 2024.
- **Column and row headings**: make sure the number has been assigned to the correct sector, energy carrier, or gas.
- **Scope and boundaries**: check whether the table concerns the entire city, only municipal entities, or, for example, public buildings alone.
- **Control total**: add up the entries and compare them with the total given in the report. A difference often indicates a missing row, an incorrect decimal separator, or an incorrect column assignment.
- **Source in the PDF**: retain the page number, table name, and footnotes. This will make subsequent corrections and data audits easier.

If extraction did not recognize the unit, it is best to **fill it in manually based on the table heading or footnote**, and if the report does not contain it — do not assume it automatically. In that case, it is worth checking the methodology or the report author's source data.

If the import screen has no preview/editing stage, treat the automatic extraction as a draft: compare the entries with the PDF before confirming. You can also paste a table here or upload a screenshot of part of it — I will help check the interpretation of the values, year, and units.
