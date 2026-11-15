"""Walk real SDK strict schemas for every workspace model-facing output."""

from typing import Any

import pytest
from agents import AgentOutputSchema

from app.models.cnb.concept_note_draft import (
    ChapterSupportReview,
    ConceptNoteChapterDraftOutput,
    ConceptNoteDraftGapOutput,
)
from app.models.document_workspace.contracts import (
    DocumentPointCitation,
    DocumentPointQuestion,
    DocumentPointSubquestion,
    ExtractedPointCandidate,
    PointExtraction,
)


def check_schema(node: dict[str, Any], path: str = "$") -> None:
    assert any(
        key in node
        for key in ("type", "$ref", "anyOf", "oneOf", "allOf", "enum", "const", "not")
    ), f"Untyped schema at {path}: {node}"
    if node.get("type") == "object":
        assert node.get("additionalProperties") is False, path
        assert set(node.get("required", [])) == set(node.get("properties", {})), path
    for key in ("properties", "$defs", "definitions"):
        for name, child in node.get(key, {}).items():
            check_schema(child, f"{path}.{key}.{name}")
    for key in ("items", "contains", "not"):
        if isinstance(node.get(key), dict):
            check_schema(node[key], f"{path}.{key}")
    for key in ("anyOf", "oneOf", "allOf"):
        for index, child in enumerate(node.get(key, [])):
            check_schema(child, f"{path}.{key}[{index}]")


@pytest.mark.parametrize(
    "model",
    [
        PointExtraction,
        ExtractedPointCandidate,
        DocumentPointQuestion,
        DocumentPointSubquestion,
        DocumentPointCitation,
        ConceptNoteDraftGapOutput,
        ConceptNoteChapterDraftOutput,
        ChapterSupportReview,
    ],
)
def test_runtime_output_models_have_fully_typed_strict_sdk_schemas(model) -> None:
    check_schema(AgentOutputSchema(model).json_schema())
