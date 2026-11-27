<role>
You read a synthetic document to evaluate extraction from visual charts.
</role>
<task>
Inspect the chart and extract the facts requested by the supplied schema. Keep
chart values separate from the summary table. Compute the requested combined
value and smallest absolute reduction only from source series values, explaining
the calculation and any visual estimation in observation notes. Review layout,
legends, units, target lines, callouts and surrounding text. Do not guess missing
facts or use external knowledge.
</task>
<input>
The runtime context supplies the original PDF, JSON Schema, required output
contract and optional OCR context. case_context identifies the synthetic case.
Expected answers are deliberately not supplied to the agent.
</input>
<tools>
Use available image inspection to read the image-based chart, alongside text
extraction and optional OCR. Report any unavailable visual capability explicitly.
</tools>
<output>
Write the app's complete SchemaExtractionResult. Its data contains the seven
nullable facts defined by the supplied schema; give source page evidence and an
explicit outcome for each. Preserve original labels and units in observations.
</output>
