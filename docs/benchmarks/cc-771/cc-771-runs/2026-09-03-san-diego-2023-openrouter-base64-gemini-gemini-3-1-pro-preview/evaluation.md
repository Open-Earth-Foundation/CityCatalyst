# Avaliação — PDF real de 2023 / Gemini 3.1 Pro Preview via OpenRouter

- Entrada: `2023_CAP_Annual_Report_9-23-24_AM_FINAL.pdf`
- Páginas: 20
- Tempo: 85,757 s
- Custo real registrado pelo OpenRouter: US$ 0,160164
- Modo: Chat Completions com PDF nativo por Base64

## Resultado

- Texto corrido: bom para o conteúdo extraído.
- Gráfico: parcialmente bom. O modelo identificou o tipo, eixos, legenda, pontos de 2020–2022 e metas. Porém, há um erro factual relevante: descreveu a linha de Business as Usual como descendente até aproximadamente 4 MMTCO₂e em 2035, enquanto a figura mostra essa projeção crescendo levemente para cerca de 11 MMTCO₂e.
- Outros elementos visuais: flowchart e infográfico receberam descrições textuais.

## Veredito

`Parcial`: recupera informação visual, mas exige validação factual antes de uso em produção. O teste também mostra que o transporte importa: com URL assinada o Google retornou “The document has no pages”; com Base64 no mesmo PDF menor, o run foi concluído.
