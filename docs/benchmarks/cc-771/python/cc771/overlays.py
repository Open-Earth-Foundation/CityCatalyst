"""Render bounding-box overlays for visual audit."""

from __future__ import annotations

from pathlib import Path
from typing import Any


TYPE_COLORS = {
    "title": (220, 50, 47),
    "heading": (203, 75, 22),
    "text": (38, 139, 210),
    "list": (42, 161, 152),
    "table": (133, 153, 0),
    "image": (211, 54, 130),
    "caption": (108, 113, 196),
    "header": (101, 123, 131),
    "footer": (88, 110, 117),
    "other": (147, 161, 161),
}


def render_overlays(
    pdf_path: Path,
    document: dict[str, Any],
    output_dir: Path,
    *,
    page_indexes: list[int] | None = None,
) -> list[Path]:
    import pymupdf

    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    with pymupdf.open(pdf_path) as doc:
        selected = page_indexes
        if selected is None:
            selected = [page["page_index"] for page in document["pages"]]

        pages_by_index = {page["page_index"]: page for page in document["pages"]}
        for page_index in selected:
            if page_index not in pages_by_index:
                continue
            if page_index < 0 or page_index >= doc.page_count:
                continue
            page = doc.load_page(page_index)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
            from PIL import Image, ImageDraw, ImageFont

            image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            draw = ImageDraw.Draw(image)
            try:
                font = ImageFont.load_default()
            except Exception:
                font = None

            structured = pages_by_index[page_index]
            src_w = structured["dimensions"].get("width") or page.rect.width
            src_h = structured["dimensions"].get("height") or page.rect.height
            scale_x = pix.width / float(src_w)
            scale_y = pix.height / float(src_h)

            for block in structured.get("blocks") or []:
                box = block["bbox_px"]
                color = TYPE_COLORS.get(block["cc_type"], TYPE_COLORS["other"])
                rect = [
                    box["top_left_x"] * scale_x,
                    box["top_left_y"] * scale_y,
                    box["bottom_right_x"] * scale_x,
                    box["bottom_right_y"] * scale_y,
                ]
                draw.rectangle(rect, outline=color, width=2)
                label = f"{block['reading_order_index']}:{block['cc_type']}"
                if block.get("related_image_id"):
                    label += f"[{block['related_image_id']}]"
                draw.text(
                    (rect[0] + 2, max(0, rect[1] - 12)),
                    label,
                    fill=color,
                    font=font,
                )

            for image_obj in structured.get("images") or []:
                box = image_obj["bbox_px"]
                rect = [
                    box["top_left_x"] * scale_x,
                    box["top_left_y"] * scale_y,
                    box["bottom_right_x"] * scale_x,
                    box["bottom_right_y"] * scale_y,
                ]
                draw.rectangle(rect, outline=(211, 54, 130), width=3)
                draw.text(
                    (rect[0] + 2, rect[1] + 2),
                    f"image:{image_obj['image_id']}",
                    fill=(211, 54, 130),
                    font=font,
                )

            out_path = output_dir / f"page-{page_index:03d}.png"
            image.save(out_path)
            written.append(out_path)
    return written
