# CC-771 — avaliação do baseline direto Mistral

## Identificação

- Run: `2026-09-03-mistral-ocr-direct`
- Modelo: `mistral-ocr-latest`
- Entrada: `cc-771-ocr-benchmark-v1.pdf`
- Páginas processadas: 3
- Tempo medido: 1,954 s (1.954 ms reportados pelo runner)
- Custo estimado: US$ 0,012 (3 páginas × US$ 4 / 1.000 páginas, tarifa standard de OCR)
- Status da API: HTTP 200

## Resultado

O baseline preservou bem o texto corrido e as duas tabelas. Porém, na página 2 ele retornou apenas a referência Markdown para a imagem:

```markdown
![img-0.jpeg](img-0.jpeg)
```

Como `include_image_base64` estava desabilitado, não há representação textual dos dados do gráfico no Markdown. Para o fluxo atual do CC, isso significa que um consumidor que receba somente o Markdown não consegue recuperar os valores e relações presentes na figura.

## Matriz de fatos visuais

| ID | Fato esperado | Preservado no Markdown? | Observação |
| --- | --- | --- | --- |
| CHART-01 | Em 2020, Transport teve o maior valor, 48 ktCO2e | Não | A imagem foi referenciada, mas não interpretada. |
| CHART-02 | Transport caiu abaixo de 35 ktCO2e pela primeira vez em 2024 | Não | Ano e valor não aparecem na saída. |
| CHART-03 | A linha tracejada representa a meta de 50 ktCO2e | Não como fato do gráfico | O número 50 aparece na tabela da página 1, mas a semântica da linha tracejada foi perdida. |
| CHART-04 | A soma dos três setores em 2025 é 65 ktCO2e | Não como soma dos setores | O total 65 aparece na narrativa, mas os três componentes não foram extraídos. |
| CHART-05 | Waste teve a menor redução absoluta, de 4 ktCO2e | Não | Não há séries nem variações por setor na saída. |

**Score de preservação de fatos visuais:** 0/5 (0%).

## Conclusão para o card

O teste confirma a hipótese do CC-771: o modelo atual é adequado para texto e tabelas, mas não cumpre sozinho o requisito de transformar gráficos em contexto textual. O próximo benchmark deve comparar este baseline com ferramentas que analisem a imagem da página e registrar separadamente:

1. preservação de texto e tabelas;
2. recuperação dos fatos visuais;
3. custo por página;
4. tempo de execução;
5. artefatos brutos e normalizados de cada run.

## Artefatos

- [PDF de entrada](../../cc-771-ocr-benchmark-v1.pdf)
- [Markdown gerado](output.md)
- [Resposta bruta da API](response.raw.json)
- [Metadados da execução](run.json)
