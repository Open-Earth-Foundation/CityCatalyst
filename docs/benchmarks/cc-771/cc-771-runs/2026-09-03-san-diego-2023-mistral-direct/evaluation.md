# Avaliação — PDF real de 2023 / Mistral OCR direto

- Entrada: `2023_CAP_Annual_Report_9-23-24_AM_FINAL.pdf`
- Páginas: 20
- Tempo: 6,484 s
- Custo: aproximadamente US$ 0,080, estimado por 20 páginas a US$ 4/1.000 páginas
- Modo: mesma integração do CC, `mistral-ocr-latest`, via Files API/URL assinada, sem `include_image_base64`

## Resultado

- Texto corrido: bom para o conteúdo textual extraível.
- Tabelas: não foi possível avaliar muitas tabelas estruturadas no corpo principal; não houve evidência de falha geral de texto.
- Gráficos: insuficiente. A Figura do inventário de emissões na página 5 foi emitida como `![img-4.jpeg](img-4.jpeg)`, sem título semântico, eixos, séries ou valores do gráfico.

## Veredito

`Passa` no caminho básico de texto; `não passa` no requisito central de recuperar informação visual. Este documento é uma confirmação independente, com um gráfico real diferente do fixture sintético.
