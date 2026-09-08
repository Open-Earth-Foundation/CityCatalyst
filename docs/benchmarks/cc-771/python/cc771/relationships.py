"""Derived relationship rules for CC-771."""

from __future__ import annotations

from typing import Any


CAPTION_TYPES = {"caption"}
IMAGE_TYPES = {"image"}
TABLE_TYPES = {"table"}


def _vertical_gap(a: dict[str, Any], b: dict[str, Any]) -> float:
    """Gap between two boxes along Y using pixel coordinates."""
    a_box = a["bbox_px"]
    b_box = b["bbox_px"]
    if a_box["bottom_right_y"] <= b_box["top_left_y"]:
        return float(b_box["top_left_y"] - a_box["bottom_right_y"])
    if b_box["bottom_right_y"] <= a_box["top_left_y"]:
        return float(a_box["top_left_y"] - b_box["bottom_right_y"])
    return 0.0


def nearest_caption_same_page(
    blocks: list[dict[str, Any]],
    page_height: float | None,
    page_index: int,
) -> list[dict[str, Any]]:
    """Apply the only permitted derived relationship rule.

    Rules:
    - same page
    - candidate is a caption block
    - immediately adjacent in reading order
    - nearest by vertical distance
    - vertical gap <= 10% of page height
    - ties or larger gaps => no relationship
    """
    if not page_height or page_height <= 0:
        return []

    max_gap = 0.10 * float(page_height)
    by_order = sorted(blocks, key=lambda b: b["reading_order_index"])
    relationships: list[dict[str, Any]] = []

    for index, block in enumerate(by_order):
        if block["cc_type"] not in IMAGE_TYPES | TABLE_TYPES:
            continue

        candidates: list[tuple[float, dict[str, Any]]] = []
        for neighbor_offset in (-1, 1):
            neighbor_index = index + neighbor_offset
            if neighbor_index < 0 or neighbor_index >= len(by_order):
                continue
            neighbor = by_order[neighbor_index]
            if neighbor["cc_type"] not in CAPTION_TYPES:
                continue
            if abs(neighbor["reading_order_index"] - block["reading_order_index"]) != 1:
                continue
            gap = _vertical_gap(block, neighbor)
            if gap <= max_gap:
                candidates.append((gap, neighbor))

        if not candidates:
            continue

        candidates.sort(key=lambda item: item[0])
        best_gap, best = candidates[0]
        # Ambiguous tie: two captions equally near.
        if len(candidates) > 1 and abs(candidates[1][0] - best_gap) < 1e-9:
            continue

        rel_type = (
            "caption_of_image"
            if block["cc_type"] in IMAGE_TYPES
            else "caption_of_table"
        )
        relationships.append(
            {
                "id": f"rel-p{page_index}-{block['block_id']}-{best['block_id']}",
                "type": rel_type,
                "from_block_id": best["block_id"],
                "to_block_id": block["block_id"],
                "page_index": page_index,
                "provenance": "derived",
                "rule": "nearest_caption_same_page",
                "notes": f"vertical_gap_px={best_gap:.2f}; max_gap_px={max_gap:.2f}",
            }
        )

        # Label derived provenance on both ends without inventing provider links.
        block["relationship_provenance"] = "derived"
        best["relationship_provenance"] = "derived"
        if block["cc_type"] in IMAGE_TYPES:
            # related_image_id stays on the image block; caption points via relationship.
            pass

    return relationships
