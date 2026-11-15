"""Guard the actual provider schema used by document candidate extraction."""

import pytest
from agents import AgentOutputSchema
from pydantic import ValidationError

from app.models.document_workspace.contracts import PointExtraction


def test_candidate_response_schema_has_explicit_scalar_types() -> None:
    """The real strict SDK schema must not send an untyped recursive JsonValue."""
    schema = AgentOutputSchema(PointExtraction).json_schema()
    candidate = schema["$defs"]["ExtractedPointCandidate"]
    value = candidate["properties"]["value"]
    assert {branch["type"] for branch in value["anyOf"]} == {
        "string",
        "integer",
        "number",
    }
    assert "JsonValue" not in schema.get("$defs", {})


@pytest.mark.parametrize("value", [None, True, False, {}, [], {"amount": 420000}])
def test_candidate_contract_rejects_values_outside_declared_scalar_points(
    value,
) -> None:
    """Unsupported or ambiguous values cannot become valid extraction output."""
    with pytest.raises(ValidationError):
        PointExtraction.model_validate(
            {"candidates": [{"value": value, "evidence_positions": [0]}]}
        )


@pytest.mark.parametrize("value", ["USD 420,000", 420000, 0, 1.5])
def test_candidate_contract_preserves_valid_scalar_values(value) -> None:
    candidate = PointExtraction.model_validate(
        {"candidates": [{"value": value, "evidence_positions": [0]}]}
    ).candidates[0]
    assert candidate.value == value
