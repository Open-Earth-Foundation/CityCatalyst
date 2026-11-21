# UA04-r2 — English review copy

Translation of the recorded Polish interaction. Scores come from revised-judgments.json, not the older translation summary. Missing transport is marked explicitly.

## Turn 1

**User**

I have a report on our city's emissions in PDF. Can it be used to fill in the inventory in CityCatalyst? I do not know where to start.

**Climate Advisor**

Yes — a PDF report can be a good source for filling in the inventory, provided it contains numerical data and information about the year, city boundaries, and methodology.

Suggested way to work in CityCatalyst:

1. **Establish the report's scope**
   Check the inventory year, geographical area, GWP factor used, and reporting method (e.g. GPC), if provided.

2. **Prepare data from the PDF**
   List or transfer to a table the values by sector and fuel/source, e.g.:
   - stationary energy: residential, commercial and institutional buildings, industry;
   - transport: fuels, energy consumption, or emissions;
   - waste: solid waste and wastewater;
   - possibly agriculture, industrial processes, and other sources.

3. **Retain sources and assumptions**
   For each value, record the report page, unit, data year, activity source, and emission factors. This makes verification and subsequent updates easier.

4. **Enter data sector by sector in CityCatalyst**
   It is best to start with sectors with complete data and mark missing entries as needing completion — they should not be replaced with guessed values.

5. **Check the consistency of the result**
   Compare the total in CityCatalyst with the total emissions given in the report. Differences often result from a different emission scope, units, base year, or emission factors.

If you share the contents of the key tables or describe which sectors the PDF covers, I will help break it down into specific inventory fields and indicate which sector to start with.

## Turn 2

**User**

I have not uploaded the report anywhere yet. Where should I select it, and how can I check whether the numbers and year have been read correctly?

**Climate Advisor**

If adding documents is available in your version of CityCatalyst, start in the **emissions inventory** view and look for an option such as **“Add data source”**, **“Upload document”**, or an attachment icon next to a sector. Select the PDF, then assign it to the correct year and subject area.

After uploading, check primarily:

- **Data year** — whether it concerns the inventory year, rather than the report's publication year.
- **City boundaries** — whether the report covers the same municipality/city as the inventory.
- **Units** — e.g. tCO₂e, tCO₂, kg CO₂e, MWh, GJ; make sure values have not been converted 1 000 times too high or too low.
- **Emission scope** — whether these are direct emissions, indirect energy emissions, or the total value; do not add together entries that already contain a summary.
- **Sectors** — compare table names and values with the fields in CityCatalyst, e.g. buildings, transport, waste.
- **Control total** — add up the sectors entered and compare with the total emissions given in the report. A small difference may result from rounding; a larger one usually requires checking the scope or units.

If you do not see an option to upload a PDF, documents may not be imported directly in this view. In that case, use the report as reference material: open it locally and transcribe the data into the appropriate sectors, recording the page and table number as the source.

## Turn 3

**User**

And if a table is read incorrectly or units are missing, can I check that before saving?

**Climate Advisor**

Yes — it is worth verifying the data **before saving**. The safest approach is to treat the extraction from the PDF as a draft and confirm it only after checking.

Check in sequence:

- **Preview of the extracted table:** whether columns and rows have shifted and decimal numbers are correct (e.g. `1,234` may mean 1,234 or 1 234 — depending on the report).
- **The unit beside the table and in footnotes:** look for it in the title, column heading, legend, and footnotes below the table. If it is missing, do not automatically assume these are tCO₂e.
- **Data year:** confirm it in the table title or methodology. The report's publication year need not be the emissions year.
- **Control totals:** add the detailed entries and compare with the sector or entire report total. This quickly reveals a missing row, an incorrect unit, or double counting.
- **Order of magnitude:** compare the result with population, energy consumption, or the previous year's result, if available. A jump of 10× or 1 000× usually indicates a unit or separator error.
- **Data scope:** check whether the table concerns only direct emissions, only electricity, or the sum of all categories. Do not enter both a summary and its components as separate data.

If the units or year are unclear, mark the entry as **requiring clarification** or leave it unconfirmed. Only after finding confirmation in the methodology, data source, or from the report's author is it worth saving it as final.
