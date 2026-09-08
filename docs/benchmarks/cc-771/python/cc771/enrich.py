"""Markdown enrichment helpers for CC-771."""

from __future__ import annotations

import json
from typing import Any


def build_plain_markdown(pages: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for page in sorted(pages, key=lambda p: p["page_index"]):
        marker = f"<!-- page: {page['page_index'] + 1} -->"
        body = page.get("markdown") or ""
        parts.append(f"{marker}\n{body}".rstrip())
    return "\n\n".join(parts) + "\n"


def _format_annotation(annotation: dict[str, Any] | None, image_id: str) -> str:
    if not annotation:
        return (
            f"\n\n<!-- visual-annotation:{image_id} missing -->\n"
            f"_No structured visual annotation was returned for `{image_id}`._\n"
        )
    chart = annotation.get("chart")
    lines = [
        f"\n\n<!-- visual-annotation:{image_id} -->",
        f"**Visual annotation (`{image_id}`)**",
        f"- kind: {annotation.get('kind')}",
        f"- title: {annotation.get('title')}",
        f"- description: {annotation.get('short_description')}",
    ]
    text_visible = annotation.get("text_visible") or []
    if text_visible:
        lines.append("- visible text: " + "; ".join(text_visible))
    if chart:
        lines.append(f"- chart_type: {chart.get('chart_type')}")
        y_axis = chart.get("y_axis") or {}
        lines.append(
            f"- y-axis: label={y_axis.get('label')}; unit={y_axis.get('unit')}"
        )
        legend = chart.get("legend") or []
        if legend:
            lines.append("- legend: " + ", ".join(legend))
        for series in chart.get("series") or []:
            points = []
            for point in series.get("points") or []:
                kind = point.get("value_kind")
                y = point.get("y")
                if kind == "approximate_visual":
                    points.append(f"{point.get('x')}≈{y} (approx)")
                else:
                    points.append(f"{point.get('x')}={y} ({kind})")
            lines.append(
                f"- series {series.get('name')}: " + (", ".join(points) if points else "n/a")
            )
        for target in chart.get("targets") or []:
            lines.append(
                f"- target: {target.get('label')}={target.get('value')} ({target.get('value_kind')})"
            )
        for callout in chart.get("callouts") or []:
            lines.append(f"- callout: {callout}")
        for trend in chart.get("trends") or []:
            lines.append(f"- trend: {trend}")
    uncertainties = annotation.get("uncertainties") or []
    if uncertainties:
        lines.append("- uncertainties: " + "; ".join(uncertainties))
    lines.append(
        f"- structured_anchor: `image:{image_id}`"
    )
    return "\n".join(lines) + "\n"


def build_enriched_markdown(document: dict[str, Any]) -> str:
    parts: list[str] = []
    images_by_page: dict[int, dict[str, dict[str, Any]]] = {}
    for page in document["pages"]:
        images_by_page[page["page_index"]] = {
            image["image_id"]: image for image in page.get("images") or []
        }

    for page in sorted(document["pages"], key=lambda p: p["page_index"]):
        page_index = page["page_index"]
        marker = f"<!-- page: {page_index + 1} -->"
        header = page.get("header")
        footer = page.get("footer")
        body = page.get("markdown") or ""

        prefix_bits = [marker]
        if header:
            prefix_bits.append(f"<!-- header -->\n{header}")

        # Insert annotations after each image placeholder.
        enriched_body = body
        page_images = images_by_page.get(page_index, {})
        for image_id, image in page_images.items():
            needle = f"]({image_id})"
            annotation_block = _format_annotation(image.get("annotation"), image_id)
            if image.get("annotation_error"):
                annotation_block += (
                    f"\n_Annotation error: {image['annotation_error']}_\n"
                )
            # Prefer markdown image form; fall back to appending at end of page.
            token = f"![{image_id}]({image_id})"
            if token in enriched_body:
                enriched_body = enriched_body.replace(
                    token, token + annotation_block, 1
                )
            elif needle in enriched_body:
                # Insert after the closing paren of the first matching markdown image.
                idx = enriched_body.find(needle) + len(needle)
                enriched_body = (
                    enriched_body[:idx] + annotation_block + enriched_body[idx:]
                )
            else:
                enriched_body = enriched_body.rstrip() + "\n" + annotation_block

        # Stable block anchors for traceability.
        anchors = []
        for block in page.get("blocks") or []:
            anchors.append(
                f"<!-- block:{block['block_id']} type={block['cc_type']} order={block['reading_order_index']} -->"
            )
        anchor_section = "\n".join(anchors)
        # Order: page marker -> header -> body/annotations/anchors -> footer
        sections = prefix_bits + [enriched_body.rstrip()]
        if anchor_section:
            sections.append(anchor_section)
        if footer:
            sections.append(f"<!-- footer -->\n{footer}")
        parts.append("\n".join(sections).rstrip())

    return "\n\n".join(parts) + "\n"


def dump_json(path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
