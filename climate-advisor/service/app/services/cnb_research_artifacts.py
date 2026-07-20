"""Functions for writing and rendering local CNB research review artifacts."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import JsonValue

from app.models.cnb_research import FundingOpportunityResearchBundle


def write_research_artifacts(
    *,
    run_directory: Path,
    bundle: FundingOpportunityResearchBundle,
) -> None:
    """Write the canonical bundle, run metadata, trace, and Markdown review."""
    write_json(
        run_directory / "research_bundle.json",
        bundle.model_dump(mode="json"),
    )
    write_json(
        run_directory / "run_metadata.json",
        bundle.run_metadata.model_dump(mode="json"),
    )
    trace_text = "".join(
        f"{json.dumps(turn.model_dump(mode='json'), ensure_ascii=False)}\n"
        for turn in bundle.agent_trace
    )
    (run_directory / "agent_trace.jsonl").write_text(
        trace_text,
        encoding="utf-8",
    )
    (run_directory / "review.md").write_text(
        render_review(bundle),
        encoding="utf-8",
    )


def write_json(path: Path, value: JsonValue) -> None:
    """Serialize one UTF-8 review artifact with stable indentation."""
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def render_review(bundle: FundingOpportunityResearchBundle) -> str:
    """Render a concise human review view from the canonical bundle."""
    lines = [
        f"# Funding Opportunity Research: {bundle.opportunity.program_name}",
        "",
        f"- Run: `{bundle.run_id}`",
        f"- Pipeline: `{bundle.run_metadata.pipeline_version}`",
        f"- Model: `{bundle.run_metadata.model_name}` "
        f"(`{bundle.run_metadata.reasoning_effort}` reasoning)",
        f"- Prompt SHA-256: `{bundle.run_metadata.prompt_sha256}`",
        f"- Turns: {bundle.run_metadata.turns_used}/"
        f"{bundle.run_metadata.max_turns} "
        f"(`{bundle.run_metadata.termination_reason}`)",
        f"- Duration: {bundle.run_metadata.duration_seconds:.2f} seconds",
        f"- MLflow run: `{bundle.run_metadata.mlflow_run_id or 'not recorded'}`",
        f"- Review status: `{bundle.review.status}`",
        f"- Funder: {bundle.opportunity.funder_name}",
        f"- Program URL: {bundle.opportunity.program_url}",
        f"- Sources: {len(bundle.sources)}",
        f"- Evidence records: {len(bundle.evidence)}",
        f"- Gaps: {len(bundle.gaps)}",
        f"- Conflicts: {len(bundle.conflicts)}",
        "",
        "## Opportunity dossier",
        "",
        "```json",
        json.dumps(
            bundle.opportunity.model_dump(mode="json"),
            indent=2,
            ensure_ascii=False,
        ),
        "```",
        "",
        "## Sources",
        "",
    ]
    if bundle.sources:
        for source in bundle.sources:
            title = source.title or source.source_ref
            lines.append(
                f"- `{source.source_ref}` [{title}]({source.url}) "
                f"— `{source.source_type}`, snapshot "
                f"`{source.local_snapshot_path}`"
            )
    else:
        lines.append("No source snapshots were captured.")

    lines.extend(["", "## Gaps", ""])
    if bundle.gaps:
        lines.extend(
            f"- `{gap.target_path}` — {gap.reason}" for gap in bundle.gaps
        )
    else:
        lines.append("No gaps reported.")

    lines.extend(["", "## Conflicts", ""])
    if bundle.conflicts:
        for conflict in bundle.conflicts:
            values = json.dumps(conflict.candidate_values, ensure_ascii=False)
            lines.append(
                f"- `{conflict.target_path}` — {conflict.explanation} "
                f"Candidates: `{values}`"
            )
    else:
        lines.append("No conflicts reported.")

    lines.extend(["", "## Field evidence", ""])
    if bundle.evidence:
        for evidence in bundle.evidence:
            location = (
                f" ({evidence.source_location})" if evidence.source_location else ""
            )
            lines.append(
                f"- `{evidence.target_path}` ← `{evidence.source_ref}`{location}: "
                f"{evidence.quote_or_summary}"
            )
    else:
        lines.append("No field evidence reported.")
    return "\n".join(lines) + "\n"
