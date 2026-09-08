# Downstream comparison

- Model: `openai/gpt-4o-mini`
- Temperature: 0
- Max chars: 120000

## output.md

- context_chars: 2840 (source 2840)

### q1
Which sector had the highest emissions in 2020, and what was the value with unit?

NOT_FOUND

### q2
In which year did transport first fall below 35 ktCO2e?

NOT_FOUND

### q3
What is the dashed-line target value?

NOT_FOUND

### q4
What is the combined 2025 emissions value across Transport, Buildings, and Waste?

NOT_FOUND

### q5
Which sector had the smallest absolute reduction from 2020 to 2025, and by how much?

NOT_FOUND

### q6
On which page is the emissions chart located? Reply with a page number only if present.

page: 2

### q7
What caption text is associated with the emissions chart, if any?

Figure 1. Synthetic sector emissions (ktCO2e), 2020–2025.

### q8
Quote any repeated header or footer text that appears in the provided context.

NOT_FOUND

## output.enriched.md

- context_chars: 5560 (source 5560)

### q1
Which sector had the highest emissions in 2020, and what was the value with unit?

The sector with the highest emissions in 2020 was Transport, with a value of 50 ktCO2e.

### q2
In which year did transport first fall below 35 ktCO2e?

Transport first fell below 35 ktCO2e in the year 2024.

### q3
What is the dashed-line target value?

The dashed-line target value is 50 ktCO2e.

### q4
What is the combined 2025 emissions value across Transport, Buildings, and Waste?

The combined 2025 emissions value across Transport, Buildings, and Waste is 60 ktCO2e (30 ktCO2e for Transport, 20 ktCO2e for Buildings, and 10 ktCO2e for Waste).

### q5
Which sector had the smallest absolute reduction from 2020 to 2025, and by how much?

The sector with the smallest absolute reduction from 2020 to 2025 is Waste, which decreased by 5 ktCO2e (from 15 ktCO2e in 2020 to 10 ktCO2e in 2025).

### q6
On which page is the emissions chart located? Reply with a page number only if present.

page_index: 2

### q7
What caption text is associated with the emissions chart, if any?

Figure 1. Synthetic sector emissions (ktCO2e), 2020–2025.

### q8
Quote any repeated header or footer text that appears in the provided context.

The repeated header text is: "CityCatalyst OCR Benchmark — Synthetic Fixture v2"

The repeated footer text is: "CC-771-STRUCTURED-V2 | Synthetic data only"

## document.structured.json

- context_chars: 35918 (source 35918)

### q1
Which sector had the highest emissions in 2020, and what was the value with unit?

The sector with the highest emissions in 2020 was "Transport," with a value of 50 ktCO2e.

### q2
In which year did transport first fall below 35 ktCO2e?

Transport first fell below 35 ktCO2e in the year 2024.

### q3
What is the dashed-line target value?

NOT_FOUND

### q4
What is the combined 2025 emissions value across Transport, Buildings, and Waste?

The combined 2025 emissions value across Transport, Buildings, and Waste is 30 ktCO2e (Transport) + 20 ktCO2e (Buildings) + 10 ktCO2e (Waste) = 60 ktCO2e.

### q5
Which sector had the smallest absolute reduction from 2020 to 2025, and by how much?

The sector with the smallest absolute reduction from 2020 to 2025 is the "Waste" sector, which had a reduction of 5 ktCO2e (from 15 ktCO2e in 2020 to 10 ktCO2e in 2025).

### q6
On which page is the emissions chart located? Reply with a page number only if present.

page_index: 1

### q7
What caption text is associated with the emissions chart, if any?

The caption text associated with the emissions chart is "Figure 1. Synthetic sector emissions (ktCO2e), 2020–2025."

### q8
Quote any repeated header or footer text that appears in the provided context.

The repeated header text is: "CityCatalyst OCR Benchmark — Synthetic Fixture v2"

The repeated footer text is: "CC-771-STRUCTURED-V2 | Page X | Synthetic data only" (where X is the page number).
