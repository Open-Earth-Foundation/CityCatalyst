# Avaliação — PDF real de 2025 / Gemini 3.1 Pro Preview — falha de ingestão

- Entrada: `2025_Annual_CAP_Report_FINAL_06-17-26_web.pdf` (33 páginas)
- Modo: OpenRouter Chat Completions com PDF nativo por URL assinada temporária
- Resultado: o provider Google retornou erro de conteúdo equivalente a `The document has no pages`; não houve Markdown utilizável nem custo de inferência.
- Interpretação: falha de compatibilidade do parser/transporte para este documento e modo de entrada. A tentativa anterior com Base64 terminou com `IncompleteRead`, portanto o modelo não foi considerado aprovado para o PDF de 2025.
