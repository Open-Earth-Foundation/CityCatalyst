# Avaliação — PDF real de 2025 / Gemini 2.5 Pro — resposta sem conteúdo útil

- Entrada: `2025_Annual_CAP_Report_FINAL_06-17-26_web.pdf` (33 páginas)
- Modo: OpenRouter Chat Completions com PDF nativo por Base64
- Tempo: 134,202 s
- Custo real: US$ 0,1680325
- Resultado: a API retornou `finish_reason: stop`, mas `message.content` veio nulo; apenas o campo de reasoning declarou genericamente que o documento teria sido processado. O artefato Markdown contém somente `None`.
- Veredito: falha operacional/contratual para o objetivo do CC-771, apesar do HTTP 200 e do custo cobrado. Não considerar o modelo aprovado para PDFs longos sem corrigir a resposta vazia.
