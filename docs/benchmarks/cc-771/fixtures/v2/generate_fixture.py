#!/usr/bin/env python3
"""Generate CC-771 structured benchmark v2 PDF fixture."""

from __future__ import annotations

import hashlib
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    Image as RLImage,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

FIXTURE_DIR = Path(__file__).resolve().parent
OUTPUT_PDF = FIXTURE_DIR / "cc-771-structured-benchmark-v2.pdf"

PAGE_HEADER = "CityCatalyst OCR Benchmark — Synthetic Fixture v2"
PAGE_FOOTER_PREFIX = "CC-771-STRUCTURED-V2 | Page {page} | Synthetic data only"

SPLIT_SENTENCE_PART1 = (
    "This inventory aggregates sector-level estimates using a consistent boundary definition "
    "so that year-over-year comparisons remain meaningful when municipal policy shifts the "
    "operational scope of reporting agencies, and the resulting totals reflect only activities "
    "occurring within the synthetic metropolitan boundary rather than "
)
SPLIT_SENTENCE_PART2 = (
    "extrapolated regional transport corridors that lie outside municipal jurisdiction."
)

CHART_YEARS = [2020, 2021, 2022, 2023, 2024, 2025]
CHART_SERIES = {
    "Transport": [48, 46, 43, 39, 34, 30],
    "Buildings": [31, 30, 29, 27, 25, 23],
    "Waste": [16, 16, 15, 14, 13, 12],
}
CHART_UNIT = "ktCO2e"
CHART_TITLE = "Synthetic sector emissions trend"
CHART_TARGET = 50
CHART_TARGET_YEAR = 2030
CHART_CALLOUT = "Transport falls below 35 ktCO2e in 2024"
FIGURE_CAPTION = "Figure 1. Synthetic sector emissions (ktCO2e), 2020–2025."


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("DejaVuSans.ttf", "LiberationSans-Regular.ttf", "Arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def build_chart_image() -> bytes:
    width, height = 900, 520
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    font = _load_font(16)
    font_sm = _load_font(12)
    font_lg = _load_font(20)

    margin_left, margin_right, margin_top, margin_bottom = 80, 40, 60, 90
    plot_w = width - margin_left - margin_right
    plot_h = height - margin_top - margin_bottom
    plot_x0, plot_y0 = margin_left, margin_top
    plot_x1, plot_y1 = plot_x0 + plot_w, plot_y0 + plot_h

    draw.text((width // 2 - 180, 15), CHART_TITLE, fill="black", font=font_lg)
    draw.text((plot_x0, plot_y1 + 10), "Year", fill="black", font=font)
    draw.text((15, plot_y0 + plot_h // 2 - 30), CHART_UNIT, fill="black", font=font)

    y_min, y_max = 0, 55
    series_colors = {
        "Transport": (37, 99, 235),
        "Buildings": (234, 88, 12),
        "Waste": (22, 163, 74),
    }

    def x_pos(i: int) -> float:
        return plot_x0 + (i / (len(CHART_YEARS) - 1)) * plot_w

    def y_pos(val: float) -> float:
        return plot_y1 - ((val - y_min) / (y_max - y_min)) * plot_h

    draw.rectangle([plot_x0, plot_y0, plot_x1, plot_y1], outline="black", width=1)
    for tick in range(0, 56, 10):
        y = y_pos(tick)
        draw.line([(plot_x0, y), (plot_x1, y)], fill=(220, 220, 220))
        draw.text((plot_x0 - 35, y - 8), str(tick), fill="black", font=font_sm)

    for i, year in enumerate(CHART_YEARS):
        x = x_pos(i)
        draw.line([(x, plot_y0), (x, plot_y1)], fill=(240, 240, 240))
        draw.text((x - 16, plot_y1 + 22), str(year), fill="black", font=font_sm)

    target_y = y_pos(CHART_TARGET)
    dash_len = 8
    x = plot_x0
    while x < plot_x1:
        draw.line([(x, target_y), (min(x + dash_len, plot_x1), target_y)], fill=(220, 38, 38), width=2)
        x += dash_len * 2
    draw.text((plot_x1 - 120, target_y - 18), f"Target {CHART_TARGET} ({CHART_TARGET_YEAR})", fill=(220, 38, 38), font=font_sm)

    for name, values in CHART_SERIES.items():
        points = [(x_pos(i), y_pos(v)) for i, v in enumerate(values)]
        for i in range(len(points) - 1):
            draw.line([points[i], points[i + 1]], fill=series_colors[name], width=3)
        for x, y in points:
            draw.ellipse([x - 4, y - 4, x + 4, y + 4], fill=series_colors[name], outline="white")

    legend_x = plot_x0 + 10
    legend_y = plot_y0 + 10
    for i, (name, color) in enumerate(series_colors.items()):
        y = legend_y + i * 22
        draw.line([(legend_x, y + 8), (legend_x + 24, y + 8)], fill=color, width=3)
        draw.text((legend_x + 30, y), name, fill="black", font=font_sm)

    callout_x, callout_y = x_pos(4), y_pos(34) - 55
    draw.rounded_rectangle([callout_x - 10, callout_y - 8, callout_x + 290, callout_y + 28], radius=6, outline=(37, 99, 235), width=2, fill=(239, 246, 255))
    draw.text((callout_x, callout_y), CHART_CALLOUT, fill=(37, 99, 235), font=font_sm)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class NumberedCanvas:
    """Mixin-style page callbacks for header and footer."""

    def __init__(self) -> None:
        self.page_num = 0

    def on_page(self, canvas, doc) -> None:
        self.page_num += 1
        canvas.saveState()
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(colors.grey)
        canvas.drawCentredString(A4[0] / 2, A4[1] - 1.2 * cm, PAGE_HEADER)
        canvas.setFillColor(colors.black)
        footer = PAGE_FOOTER_PREFIX.format(page=self.page_num)
        canvas.drawCentredString(A4[0] / 2, 1.0 * cm, footer)
        canvas.restoreState()


canvas_state = NumberedCanvas()


def on_page(canvas, doc) -> None:
    canvas_state.on_page(canvas, doc)


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="BodyJustify",
            parent=styles["BodyText"],
            alignment=TA_JUSTIFY,
            leading=14,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Caption",
            parent=styles["BodyText"],
            fontSize=9,
            textColor=colors.grey,
            spaceBefore=4,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TableTitle",
            parent=styles["Heading3"],
            spaceBefore=12,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TableNote",
            parent=styles["BodyText"],
            fontSize=9,
            leftIndent=12,
            spaceBefore=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ColumnText",
            parent=styles["BodyText"],
            fontSize=10,
            leading=13,
            alignment=TA_LEFT,
        )
    )
    return styles


def build_table(styles) -> list:
    table_title = Paragraph("Table 1. Synthetic municipal activity indicators (illustrative)", styles["TableTitle"])
    table_data = [
        ["Indicator", "2020", "2023", "2025", "Unit"],
        ["Population served", "1.42", "1.48", "1.53", "million"],
        ["Grid carbon intensity", "412", "368", "331", "gCO2e/kWh"],
        ["Recycling diversion rate", "58", "61", "64", "percent"],
        ["EV fleet share (municipal)", "12", "24", "37", "percent"],
    ]
    tbl = Table(table_data, colWidths=[5.5 * cm, 2.2 * cm, 2.2 * cm, 2.2 * cm, 2.5 * cm])
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EEF4")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ]
        )
    )
    caption = Paragraph(
        "Table 1 caption: Illustrative non-emissions indicators used for layout testing only; "
        "values are synthetic and must not be confused with sector inventory totals.",
        styles["Caption"],
    )
    note = Paragraph(
        "Note: This table exercises title-above, caption-below, and footnote placement. "
        "It is unrelated to the sector emissions chart on the following page.",
        styles["TableNote"],
    )
    return [table_title, tbl, caption, note, Spacer(1, 6 * mm)]


def build_two_column_section(styles) -> list:
    col_a = Paragraph(
        "<b>Column A:</b> Primary reading order begins here. This column contains the first "
        "block of side-by-side content in the synthetic fixture. Evaluators should confirm that "
        "structured OCR preserves left-to-right column order before advancing to the adjacent column.",
        styles["ColumnText"],
    )
    col_b = Paragraph(
        "<b>Column B:</b> Secondary reading order follows column A. This column contains "
        "complementary material about reporting cadence, revision tags, and placeholder annex "
        "references used solely to test multi-column layout recovery.",
        styles["ColumnText"],
    )
    two_col = Table([[col_a, col_b]], colWidths=[8.5 * cm, 8.5 * cm], hAlign="LEFT")
    two_col.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return [Spacer(1, 4 * mm), two_col]


def generate_pdf() -> Path:
    styles = build_styles()
    story: list = []

    story.append(Paragraph("Synthetic Climate Inventory Report", styles["Heading1"]))
    story.append(Paragraph("Scope and Methodology", styles["Heading2"]))
    story.append(Paragraph("Data boundaries", styles["Heading3"]))
    story.append(
        Paragraph(
            "This document is a deliberately synthetic fixture for OCR and layout benchmarking. "
            "It mimics the shape of a municipal greenhouse-gas inventory without referencing any "
            "real city, real policy outcome, or verified emissions total.",
            styles["BodyJustify"],
        )
    )
    story.append(
        Paragraph(
            "The narrative sections introduce reporting conventions, inventory cycles, and "
            "quality-control language typical of climate action planning documents. Readers should "
            "treat every numeric example outside the designated chart as illustrative scaffolding.",
            styles["BodyJustify"],
        )
    )
    story.append(Paragraph(SPLIT_SENTENCE_PART1, styles["BodyJustify"]))
    story.extend(build_table(styles))

    story.append(PageBreak())

    story.append(Paragraph(SPLIT_SENTENCE_PART2, styles["BodyJustify"]))
    story.append(Spacer(1, 4 * mm))
    story.append(
        Paragraph(
            "Sector trends are summarized visually in the figure below. The surrounding discussion "
            "focuses on interpretation habits—such as distinguishing inventory totals from activity "
            "drivers—rather than restating numeric values that appear only inside the chart image.",
            styles["BodyJustify"],
        )
    )

    chart_bytes = build_chart_image()
    chart_img = RLImage(io.BytesIO(chart_bytes), width=16 * cm, height=9.2 * cm)
    story.append(chart_img)
    story.append(Paragraph(FIGURE_CAPTION, styles["Caption"]))
    story.append(
        Paragraph(
            "Analysts reviewing this figure should note how legend placement, axis units, and "
            "callout boxes interact with nearby captions. Structured extraction should associate "
            "the caption with the image block while keeping explanatory paragraphs separate.",
            styles["BodyJustify"],
        )
    )

    story.append(PageBreak())

    story.append(Paragraph("Layout and Reading Order Checks", styles["Heading2"]))
    story.append(Paragraph("Multi-column annex", styles["Heading3"]))
    story.append(
        Paragraph(
            "The final page verifies side-by-side layout handling. No additional chart facts are "
            "introduced here; the page exists to test header/footer repetition and column ordering.",
            styles["BodyJustify"],
        )
    )
    story.extend(build_two_column_section(styles))
    story.append(
        Paragraph(
            "End of synthetic fixture. All content is labeled as non-operational test data.",
            styles["BodyJustify"],
        )
    )

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2.2 * cm,
        bottomMargin=2 * cm,
    )
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return OUTPUT_PDF


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_pdf(path: Path) -> dict:
    import pymupdf

    doc = pymupdf.open(path)
    info = {"page_count": doc.page_count, "pages": []}
    for i in range(doc.page_count):
        page = doc[i]
        text = page.get_text("text")
        info["pages"].append(
            {
                "index": i + 1,
                "text_preview": " ".join(text.split())[:200],
            }
        )
    doc.close()
    return info


def main() -> None:
    pdf_path = generate_pdf()
    digest = sha256_file(pdf_path)
    verification = verify_pdf(pdf_path)
    print(f"Generated: {pdf_path}")
    print(f"SHA-256: {digest}")
    print(f"Page count (pymupdf): {verification['page_count']}")
    for page in verification["pages"]:
        print(f"  Page {page['index']}: {page['text_preview']}...")


if __name__ == "__main__":
    main()
