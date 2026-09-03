# Avaliação — PDF real de 2025 / Claude Opus 5 via OpenRouter

- Entrada: `2025_Annual_CAP_Report_FINAL_06-17-26_web.pdf`
- Páginas: 33
- Tempo: 258,683 s
- Custo real registrado pelo OpenRouter: US$ 0,970075
- Modo: Chat Completions com PDF nativo por URL assinada temporária

## Resultado

- Texto corrido: bom; o conteúdo foi convertido em Markdown estruturado.
- Tabelas: bom; tabelas e valores do relatório foram preservados em tabelas Markdown.
- Gráficos: bom. A saída descreve as Figuras 1–5 com título, tipo, eixos, séries, unidades, valores legíveis e tendências.
- Imagens/infográficos: descritos textualmente, o que melhora a ingestão downstream, embora aumente bastante o número de tokens.

## Evidência representativa

Para a Figura 1, a saída registra a linha de Business as Usual, a linha de redução, as metas de 2030/2035, os valores 10,54 e 8,16 MMT CO₂e e a tendência dos dados reais. Para a Figura 4, registra os dois eixos, as barras de milhas dirigidas e a linha de emissões, explicitando quando os valores são apenas leituras aproximadas do gráfico.

## Veredito

`Passa` no objetivo visual do CC-771 para este documento. A principal ressalva é custo/latência: cerca de 4,3 minutos e quase US$ 1 por PDF neste run.
