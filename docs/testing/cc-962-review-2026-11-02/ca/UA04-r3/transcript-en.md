# UA04-r3 — English review copy

Translation of the recorded Polish interaction. Scores come from revised-judgments.json, not the older translation summary. Missing transport is marked explicitly.

## Turn 1

**User**

I have a report on our city's emissions in PDF. Can it be used to fill in the inventory in CityCatalyst? I do not know where to start.

**Climate Advisor**

Yes — a PDF report can be a good starting point for filling in the inventory, provided it contains source data and a clear methodology, rather than only charts or summaries.

Suggested way to work in CityCatalyst:

1. **Check the report's scope**
   - inventory year,
   - city boundaries (administrative or functional area),
   - gases and GWP factors,
   - methodology, e.g. GPC,
   - whether emissions are given in tCO₂e.

2. **Extract the data by sector**
   Most often, data will be needed for:
   - stationary energy: residential, commercial/institutional buildings, industry;
   - transport: fuels, road traffic, public transport;
   - waste: disposal, wastewater, incineration;
   - possibly IPPU and agriculture, forestry, and land use.

3. **Start with activity data, not only emission totals**
   If the report gives, for example, energy consumption in MWh, fuels in litres or tonnes, the amount of waste in tonnes, and the emission factors used, these data are usually best entered into the appropriate CityCatalyst modules. The system can then retain a transparent calculation trail.

4. **Enter sources and assumptions**
   For each entry, note the source (report, table/page), year, unit, method, and important assumptions. This will make subsequent verification and updates easier.

5. **Compare the final result**
   After filling in the sectors, compare total emissions and sector shares with the report. Differences may result, for example, from different emission factors, inventory boundaries, or how emissions are assigned.

It is best to start with the table of emissions by sector and the methodology chapter. If you can paste the table of contents, a sector table, or an extract of the methodology from the PDF here, I will help indicate which values to enter where and what may be missing.

## Turn 2

**User**

I have not uploaded the report anywhere yet. Where should I select it, and how can I check whether the numbers and year have been read correctly?

**Climate Advisor**

If the report has not yet been uploaded, start from your inventory screen in CityCatalyst:

1. **Open the correct inventory for the city and year.**
2. Go to the section related to **source data / data sources** or select the sector you want to fill in.
3. Look for a button such as **“Add data source”**, **“Upload file”**, or an attachment icon and select the PDF from your computer.
4. After uploading, check whether the system shows:
   - the file name,
   - the recognized **data/inventory year**,
   - the city or area covered by the report,
   - pages/tables used for extraction,
   - values, units, and assigned sector.

Before confirming, compare the extraction with the PDF, especially:
- **year** — whether it concerns the emissions year, rather than the report's publication year;
- **units** — e.g. tCO₂e, tCO₂, MWh, GJ, litres, tonnes;
- **scope** — emissions for the whole city, rather than only municipal facilities;
- **sector** — e.g. buildings, transport, waste;
- **total emissions** and sector totals — whether they match the tables in the report.

If the system's extraction does not match the report, do not confirm it automatically: correct the year, unit, or sector assignment manually, and retain the PDF page/table number as the source.

Button names may differ slightly depending on the view and permissions. If you describe what you see after opening the inventory — or paste a screenshot without sensitive data — I will indicate the next step.

## Turn 3

**User**

And if a table is read incorrectly or units are missing, can I check that before saving?

**Climate Advisor**

Yes — it is worth checking this **before saving or confirming** the data.

For each extracted table, verify:

- **data year** — whether it is the emissions year, rather than the report's publication year;
- **row and column headings** — sector, fuel, waste type, emission scope, etc.;
- **numerical values** — compare a few entries with the original PDF;
- **unit** — e.g. tCO₂e, tCO₂, MWh, GJ, m³, litres, or tonnes;
- **number scale** — whether “thousand”, “million”, or decimal commas/points have been correctly recognized;
- **control totals** — whether the sum of the entries matches the row/column total in the report;
- **source page and table** — retain the reference so that you can return to the original.

If a unit has not been extracted, **do not guess**. Check the table legend, footnotes, chapter heading, or report methodology. If it is still missing, mark the data as requiring clarification and do not use them in the final inventory result.

It is good practice to first save data as a draft, review the preview, and only then confirm. If CityCatalyst shows an import preview, correct values, units, and assignment to sectors at this stage.
