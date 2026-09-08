# Avaliação — PDF real de 2025 / Mistral OCR direto

- Entrada: `2025_Annual_CAP_Report_FINAL_06-17-26_web.pdf`
- Páginas: 33
- Tempo: 7,161 s
- Custo: aproximadamente US$ 0,132, estimado por 33 páginas a US$ 4/1.000 páginas
- Modo: mesma integração do CC, `mistral-ocr-latest`, via Files API/URL assinada, sem `include_image_base64`

## Resultado

- Texto corrido: bom; o conteúdo narrativo e a estrutura de seções foram preservados.
- Tabelas: bom; a Tabela 2 foi convertida para Markdown com os valores principais preservados.
- Gráficos: insuficiente para o objetivo do CC-771. As Figuras 1–5 aparecem como referências de imagem (`img-*.jpeg`), sem uma representação semântica completa de eixos, séries e tendências.
- Contexto textual sobre os gráficos: parcialmente preservado. O texto ao redor das figuras contém alguns valores, mas não substitui os dados visuais.

## Evidência representativa

Na Figura 1, a saída preserva o título, a legenda e as notas, mas em seguida emite `![img-9.jpeg](img-9.jpeg)`. Na Figura 2 há uma lista textual de setores e percentuais, em parte derivada do conteúdo da página, mas a própria figura continua sendo apenas uma imagem.

## Veredito

`Passa` para texto/tabelas; `não passa` para interpretação de gráficos. O PDF real confirma o problema observado no fixture sintético: a saída Markdown do caminho atual não carrega de forma confiável a informação que existe somente nos elementos visuais.
