# CC-771 — avaliação Gemini 3.1 Pro Preview via OpenRouter

- Run: `2026-09-03-openrouter-gemini-3-1-pro-preview`
- Modelo: `google/gemini-3.1-pro-preview`
- Provedor retornado: Google
- Entrada: o mesmo PDF do baseline, SHA-256 `d00d2d6f9161f3def691f7778e39de9acd18005bd569dd9be04ba39a7b3cbf41`
- Modo: OpenRouter Chat Completions com entrada de arquivo PDF nativa
- Páginas: 3
- Tempo: 29,319 s
- Custo real informado pelo OpenRouter: US$ 0,051632
- Tokens: 5.746 no total

## Resultado

O modelo preservou o texto e as tabelas e criou uma representação textual do gráfico com séries, valores, unidades, linha de meta, callout e tendências. Recuperou os cinco fatos visuais do ground truth.

## Matriz de fatos visuais

| ID | Resultado | Observação |
| --- | --- | --- |
| CHART-01 | ✅ correto | Identificou Transport como maior em 2020 e aproximadamente 48 ktCO2e. |
| CHART-02 | ✅ correto | Identificou 2024 e aproximadamente 34 ktCO2e. |
| CHART-03 | ✅ correto | Identificou a meta de 50 ktCO2e e a linha tracejada. |
| CHART-04 | ✅ correto | Registrou 2025 como 65 ktCO2e e explicou a soma dos componentes. |
| CHART-05 | ✅ correto | Identificou Waste e a redução aproximada de 4 ktCO2e. |

**Score de preservação de fatos visuais:** 5/5 (100%).

## Riscos observados

- A saída chama o valor de Transport em 2025 de “exactly 30”, embora o gráfico não tenha rótulos numéricos; para produção, a linguagem deveria indicar que o valor foi estimado visualmente.
- Também descreve a linha do callout como tracejada; isso é secundário e não altera os fatos principais.

## Conclusão

Foi um resultado forte e mais barato que o Claude nesta rodada, mas com latência ligeiramente maior. Deve avançar para validação em PDFs reais sanitizados junto com o Claude.
