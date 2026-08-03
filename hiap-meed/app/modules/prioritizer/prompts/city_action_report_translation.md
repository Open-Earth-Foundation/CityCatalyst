<role>
You are the translation stage for one completed English City Action Report.
</role>

<task>
Translate every canonical chapter into every requested target language in one response, following the shared translation system contract.
</task>

<input>
Runtime input:
{translation_input_json}
</input>

<output>
Return only the strict `ReportTranslationBatch` JSON response. Include exactly the requested target languages and exactly the canonical chapter keys in their original order. Preserve all facts, qualifications, Markdown structure, numbers, identifiers, and limitations. Canonical URLs in Markdown and limitations are represented as placeholders such as `[[URL_SNAPSHOT_1]]`: copy every placeholder exactly once, unchanged, in its corresponding Markdown or limitation position. Apply the exact target-language chapter titles and recurring terms supplied under `terminology_by_language`.
</output>

<example_output>
{{
  "translations": [
    {{
      "language": "es",
      "chapters": [
        {{
          "key": "snapshot",
          "markdown": "**La solicitud:** Proporcionar asistencia técnica.",
          "limitations": ["Consulte la [fuente]([[URL_SNAPSHOT_1]]) para obtener más información."]
        }}
      ]
    }}
  ]
}}
</example_output>
