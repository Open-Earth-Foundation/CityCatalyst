"""Impact block for mitigation-focused scoring inputs."""

from __future__ import annotations

from app.modules.prioritizer.models import Action, BlockScoreResult


def _read_gpc_refs(impact_row: dict[str, object]) -> list[str]:
    refs: list[str] = []
    single_ref = impact_row.get("gpc_reference_number")
    if isinstance(single_ref, str) and single_ref.strip():
        refs.append(single_ref.strip())

    many_refs = impact_row.get("gpc_reference_numbers")
    if isinstance(many_refs, list):
        refs.extend(str(item).strip() for item in many_refs if str(item).strip())

    deduped = list(dict.fromkeys(refs))
    return deduped


def run(actions: list[Action]) -> BlockScoreResult:
    """
    Compute stub impact scores and impact evidence.

    The initial scaffold returns 0.0 for all actions while preserving explainability
    metadata required by artifacts and downstream debugging.
    """

    score_by_action_id: dict[str, float] = {}
    evidence_by_action_id: dict[str, dict[str, object]] = {}

    for action in actions:
        emissions_impact_rows = 0
        collected_refs: list[str] = []
        for raw_impact in action.impacts:
            impact_type = raw_impact.get("impact_type")
            if str(impact_type).lower() == "emissions":
                emissions_impact_rows += 1
                collected_refs.extend(_read_gpc_refs(raw_impact))

        sample_refs = list(dict.fromkeys(collected_refs))[:3]
        evidence_by_action_id[action.action_id] = {
            "emissions_impact_rows": emissions_impact_rows,
            "has_any_gpc_reference": len(sample_refs) > 0,
            "sample_gpc_reference_numbers": sample_refs,
        }
        score_by_action_id[action.action_id] = 0.0

    return BlockScoreResult(
        score_by_action_id=score_by_action_id,
        evidence_by_action_id=evidence_by_action_id,
    )


__all__ = ["run"]
