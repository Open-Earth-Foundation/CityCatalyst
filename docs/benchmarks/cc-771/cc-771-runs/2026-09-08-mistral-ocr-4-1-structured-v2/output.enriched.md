<!-- page: 1 -->
<!-- header -->
CityCatalyst OCR Benchmark — Synthetic Fixture v2
<!-- footer -->
CC-771-STRUCTURED-V2 | Page 1 | Synthetic data only
# Synthetic Climate Inventory Report

## Scope and Methodology

### Data boundaries

This document is a deliberately synthetic fixture for OCR and layout benchmarking. It mimics the shape of a municipal greenhouse-gas inventory without referencing any real city, real policy outcome, or verified emissions total.

The narrative sections introduce reporting conventions, inventory cycles, and quality-control language typical of climate action planning documents. Readers should treat every numeric example outside the designated chart as illustrative scaffolding.

This inventory aggregates sector-level estimates using a consistent boundary definition so that year-over-year comparisons remain meaningful when municipal policy shifts the operational scope of reporting agencies, and the resulting totals reflect only activities occurring within the synthetic metropolitan boundary rather than

Table 1. Synthetic municipal activity indicators (illustrative)

[tbl-0.md](tbl-0.md)

Table 1 caption: Illustrative non-emissions indicators used for layout testing only; values are synthetic and must not be confused with sector inventory totals.

Note: This table exercises title-above, caption-below, and footnote placement. It is unrelated to the sector emissions chart on the following page.
<!-- block:p0-b0 type=header order=0 -->
<!-- block:p0-b1 type=title order=1 -->
<!-- block:p0-b2 type=title order=2 -->
<!-- block:p0-b3 type=title order=3 -->
<!-- block:p0-b4 type=text order=4 -->
<!-- block:p0-b5 type=text order=5 -->
<!-- block:p0-b6 type=text order=6 -->
<!-- block:p0-b7 type=caption order=7 -->
<!-- block:p0-b8 type=table order=8 -->
<!-- block:p0-b9 type=caption order=9 -->
<!-- block:p0-b10 type=text order=10 -->
<!-- block:p0-b11 type=footer order=11 -->

<!-- page: 2 -->
<!-- header -->
CityCatalyst OCR Benchmark — Synthetic Fixture v2
<!-- footer -->
CC-771-STRUCTURED-V2 | Page 2 | Synthetic data only
extrapolated regional transport corridors that lie outside municipal jurisdiction.

Sector trends are summarized visually in the figure below. The surrounding discussion focuses on interpretation habits—such as distinguishing inventory totals from activity drivers—rather than restating numeric values that appear only inside the chart image.

Synthetic sector emissions trend

![img-0.jpeg](img-0.jpeg)

<!-- visual-annotation:img-0.jpeg -->
**Visual annotation (`img-0.jpeg`)**
- kind: chart
- title: None
- description: Line chart showing the annual emissions in ktCO2e for Transport, Buildings, and Waste from 2020 to 2025, with a target line at 50 ktCO2e.
- visible text: Target 50(120)30; Transport falls below 35 ktCO2e
- chart_type: line
- y-axis: label=ktCO2e; unit=None
- legend: Transport, Buildings, Waste
- series Transport: 2020=50 (printed), 2021=45 (printed), 2022=42 (printed), 2023=38 (printed), 2024=35 (printed), 2025=30 (printed)
- series Buildings: 2020=25 (printed), 2021=24 (printed), 2022=23 (printed), 2023=22 (printed), 2024=21 (printed), 2025=20 (printed)
- series Waste: 2020=15 (printed), 2021=14 (printed), 2022=13 (printed), 2023=12 (printed), 2024=11 (printed), 2025=10 (printed)
- target: Target 50(120)30=50 (printed)
- callout: Transport falls below 35 ktCO2e
- trend: Transport emissions decrease steadily from 50 to 30 ktCO2e
- trend: Buildings emissions decrease steadily from 25 to 20 ktCO2e
- trend: Waste emissions decrease steadily from 15 to 10 ktCO2e
- trend: Transport emissions fall below 35 ktCO2e in 2024
- structured_anchor: `image:img-0.jpeg`


Figure 1. Synthetic sector emissions (ktCO2e), 2020–2025.

Analysts reviewing this figure should note how legend placement, axis units, and callout boxes interact with nearby captions. Structured extraction should associate the caption with the image block while keeping explanatory paragraphs separate.
<!-- block:p1-b0 type=header order=0 -->
<!-- block:p1-b1 type=text order=1 -->
<!-- block:p1-b2 type=text order=2 -->
<!-- block:p1-b3 type=caption order=3 -->
<!-- block:p1-b4 type=image order=4 -->
<!-- block:p1-b5 type=caption order=5 -->
<!-- block:p1-b6 type=text order=6 -->
<!-- block:p1-b7 type=footer order=7 -->

<!-- page: 3 -->
<!-- header -->
CityCatalyst OCR Benchmark — Synthetic Fixture v2
<!-- footer -->
CC-771-STRUCTURED-V2 | Page 3 | Synthetic data only
# Layout and Reading Order Checks

## Multi-column annex

The final page verifies side-by-side layout handling. No additional chart facts are introduced here; the page exists to test header/footer repetition and column ordering.

Column A: Primary reading order begins here. This column contains the first block of side-by-side content in the synthetic fixture. Evaluators should confirm that structured OCR preserves left-to-right column order before advancing to the adjacent column.

Column B: Secondary reading order follows column A. This column contains complementary material about reporting cadence, revision tags, and placeholder annex references used solely to test multi-column layout recovery.

End of synthetic fixture. All content is labeled as non-operational test data.
<!-- block:p2-b0 type=header order=0 -->
<!-- block:p2-b1 type=title order=1 -->
<!-- block:p2-b2 type=title order=2 -->
<!-- block:p2-b3 type=text order=3 -->
<!-- block:p2-b4 type=text order=4 -->
<!-- block:p2-b5 type=text order=5 -->
<!-- block:p2-b6 type=text order=6 -->
<!-- block:p2-b7 type=footer order=7 -->
