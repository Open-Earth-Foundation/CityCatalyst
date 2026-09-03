# Avaliação — PDF real de 2023 / Gemini 3.1 Pro Preview — falha de ingestão

- Entrada: `2023_CAP_Annual_Report_9-23-24_AM_FINAL.pdf` (20 páginas)
- Modo: OpenRouter Chat Completions com PDF nativo por URL assinada temporária
- Resultado: HTTP 400 do provider Google com `The document has no pages`; não houve Markdown utilizável nem custo de inferência.
- Interpretação: a mesma entrada foi concluída pelo Gemini quando enviada em Base64, o que indica que o modo de transporte/ingestão é uma variável relevante para esse candidato.
