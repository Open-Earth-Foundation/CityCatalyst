# CC-771 — avaliação Claude Opus 5 via OpenRouter

- Run: `2026-09-03-openrouter-claude-opus-5`
- Modelo: `anthropic/claude-opus-5`
- Provedor retornado: Claude Platform on AWS
- Entrada: o mesmo PDF do baseline, SHA-256 `d00d2d6f9161f3def691f7778e39de9acd18005bd569dd9be04ba39a7b3cbf41`
- Modo: OpenRouter Chat Completions com entrada de arquivo PDF nativa
- Páginas: 3
- Tempo: 27,041 s
- Custo real informado pelo OpenRouter: US$ 0,093260
- Tokens: 8.540 no total

## Resultado

O modelo preservou o texto e as tabelas e criou uma representação textual detalhada do gráfico. Recuperou os cinco fatos visuais do ground truth, incluindo séries, anos, unidades, linha de meta e callout.

## Matriz de fatos visuais

| ID | Resultado | Observação |
| --- | --- | --- |
| CHART-01 | ✅ correto | Identificou Transport como maior em 2020 e registrou aproximadamente 48 ktCO2e. |
| CHART-02 | ✅ correto | Identificou 2024 e aproximadamente 34 ktCO2e. |
| CHART-03 | ✅ correto | Identificou a meta de 50 ktCO2e e a linha tracejada. |
| CHART-04 | ✅ correto | Registrou 2025 como aproximadamente 65 ktCO2e e a soma dos componentes. |
| CHART-05 | ✅ correto | Identificou Waste e a redução aproximada de 4 ktCO2e. |

**Score de preservação de fatos visuais:** 5/5 (100%).

## Riscos observados

- Os valores foram corretamente lidos, mas o modelo os qualificou como aproximados, o que é adequado para um gráfico sem rótulos numéricos.
- Há uma interpretação adicional sobre a linha de meta funcionar como alvo citywide, que não precisa ser exigida pelo OCR e deve ser tratada como observação do modelo.

## Conclusão

Foi um resultado forte para o objetivo do CC-771: o modelo transforma a figura em Markdown textual utilizável por um LLM. O trade-off é custo e latência maiores que o baseline direto do Mistral.
