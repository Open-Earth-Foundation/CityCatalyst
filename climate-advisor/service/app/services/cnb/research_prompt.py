"""Translate research facts at the model boundary; keep all join keys in code."""

import re
from collections.abc import Sequence
from typing import Any
from uuid import uuid4

from app.models.cnb.research import FundingOpportunityResearchResult
from app.models.cnb.research_prompt import ResearchPromptResult
from app.utils.concept_note_context import omit_context_identifiers

_COLLECTIONS = {
    "funding_opportunities": "funding_opportunity_ref",
    "funded_projects": "funded_project_ref",
    "funder_templates": "template_ref",
    "funder_criteria": "criterion_ref",
}


def model_field_path(text: str, state: FundingOpportunityResearchResult) -> str:
    """Replace generated record selectors in control text with array positions."""
    for collection, reference in _COLLECTIONS.items():
        for position, record in enumerate(getattr(state, collection)):
            text = text.replace(
                f"{collection}[{getattr(record, reference)}]",
                f"{collection}[{position}]",
            )
    # Generic missing-record markers carry no semantic content for the model.
    return re.sub(r"\[[^\]\d][^\]]*\]", "[]", text)


def model_research_state(
    state: FundingOpportunityResearchResult, sources: Sequence[Any]
) -> ResearchPromptResult:
    """Project the working dossier to facts, public URLs and array positions."""
    source_urls = {source.source_ref: str(source.url) for source in sources}
    project_positions = {
        item.funded_project_ref: i for i, item in enumerate(state.funded_projects)
    }
    evidence_positions = {item.evidence_ref: i for i, item in enumerate(state.evidence)}
    payload = omit_context_identifiers(state.model_dump(mode="json"))
    payload["source_assessments"] = [
        {
            "source_url": source_urls.get(item.source_ref),
            **item.model_dump(exclude={"source_ref"}),
        }
        for item in state.source_assessments
        if item.source_ref in source_urls
    ]
    payload["evidence"] = [
        {
            "project_position": project_positions.get(item.funded_project_ref),
            "field": model_field_path(item.target_path, state),
            "source_url": source_urls.get(item.source_ref),
            "source_location": item.source_location,
            "quote_or_summary": item.quote_or_summary,
        }
        for item in state.evidence
    ]
    payload["gaps"] = [
        {"field": model_field_path(item.target_path, state), "reason": item.reason}
        for item in state.gaps
    ]
    payload["conflicts"] = [
        {
            "field": model_field_path(item.target_path, state),
            "candidate_values": item.candidate_values,
            "evidence_positions": [
                evidence_positions[ref] for ref in item.evidence_refs
            ],
            "explanation": item.explanation,
        }
        for item in state.conflicts
    ]
    return ResearchPromptResult.model_validate(payload)


def restore_research_state(
    result: ResearchPromptResult,
    previous: FundingOpportunityResearchResult,
    sources: Sequence[Any],
) -> FundingOpportunityResearchResult:
    """Restore internal identities and reject invented source/evidence selectors."""
    payload = result.model_dump(mode="json")
    if len(result.funding_opportunities) != 1:
        raise ValueError("Research must retain exactly one funding opportunity")
    if (
        result.funder.name != previous.funder.name
        or result.funding_opportunities[0].name
        != previous.funding_opportunities[0].name
    ):
        raise ValueError("Research must preserve the seeded funder and programme names")
    funder_ref = previous.funder.funder_ref
    payload["funder"]["funder_ref"] = funder_ref
    # Preserve existing row positions and assign new references only in backend state.
    for collection, reference in _COLLECTIONS.items():
        old_rows = getattr(previous, collection)
        name_field = {
            "funding_opportunities": "name",
            "funded_projects": "name",
            "funder_templates": "template_name",
            "funder_criteria": "label",
        }[collection]
        if len(payload[collection]) < len(old_rows):
            raise ValueError("Research must preserve existing rows and append new rows")
        for position, old_row in enumerate(old_rows):
            if payload[collection][position][name_field] != getattr(
                old_row, name_field
            ):
                raise ValueError("Research must preserve existing row names and order")
        for position, row in enumerate(payload[collection]):
            row[reference] = (
                getattr(old_rows[position], reference)
                if position < len(old_rows)
                else f"{collection}-{uuid4().hex}"
            )
            if collection in {"funding_opportunities", "funded_projects"}:
                row["funder_ref"] = funder_ref
            else:
                row["funding_opportunity_ref"] = payload["funding_opportunities"][0][
                    "funding_opportunity_ref"
                ]
            if collection == "funder_templates":
                old_chapters = (
                    old_rows[position].chapter_schema
                    if position < len(old_rows)
                    else []
                )
                for chapter_position, chapter in enumerate(row["chapter_schema"]):
                    chapter["chapter_ref"] = (
                        old_chapters[chapter_position].chapter_ref
                        if chapter_position < len(old_chapters)
                        else f"chapter-{uuid4().hex}"
                    )

    def restore_path(field: str) -> str:
        """Resolve only in-range positions; no model-provided internal keys are accepted."""
        for collection, reference in _COLLECTIONS.items():
            if re.search(rf"{collection}\[[^\d\]][^\]]*\]", field):
                raise ValueError(
                    "Research field paths must use array positions, not identifiers"
                )
            field = field.replace(f"{collection}[]", collection)

            def resolve(match: re.Match[str]) -> str:
                position = int(match.group(1))
                if position >= len(payload[collection]):
                    raise ValueError(
                        "Research field refers to an unavailable array position"
                    )
                return f"{collection}[{payload[collection][position][reference]}]"

            field = re.sub(rf"{collection}\[(\d+)\]", resolve, field)
        return field

    sources_by_url = {str(source.url): source.source_ref for source in sources}

    def source_reference(url: str | None) -> str:
        """Unknown old evidence stays unverified; invented public sources are rejected."""
        if url is None:
            return "unverified-source"
        if url not in sources_by_url:
            raise ValueError("Research cited a source URL that was not captured")
        return sources_by_url[url]

    payload["source_assessments"] = [
        {
            "source_ref": source_reference(item.source_url),
            **item.model_dump(exclude={"source_url"}),
        }
        for item in result.source_assessments
    ]
    evidence = []
    for position, item in enumerate(result.evidence):
        project_ref = None
        if item.project_position is not None:
            if item.project_position >= len(payload["funded_projects"]):
                raise ValueError("Research evidence refers to an unavailable project")
            project_ref = payload["funded_projects"][item.project_position][
                "funded_project_ref"
            ]
        evidence.append(
            {
                "evidence_ref": f"evidence-{position + 1:03d}",
                "funding_opportunity_ref": None
                if project_ref
                else payload["funding_opportunities"][0]["funding_opportunity_ref"],
                "funded_project_ref": project_ref,
                "target_path": restore_path(item.field),
                "source_ref": source_reference(item.source_url),
                "source_location": item.source_location,
                "quote_or_summary": item.quote_or_summary,
            }
        )
    payload["evidence"] = evidence
    payload["gaps"] = [
        {"target_path": restore_path(item.field), "reason": item.reason}
        for item in result.gaps
    ]
    conflicts = []
    for item in result.conflicts:
        if any(
            position < 0 or position >= len(evidence)
            for position in item.evidence_positions
        ):
            raise ValueError("Research conflict refers to unavailable evidence")
        conflicts.append(
            {
                "target_path": restore_path(item.field),
                "candidate_values": item.candidate_values,
                "evidence_refs": [
                    evidence[position]["evidence_ref"]
                    for position in item.evidence_positions
                ],
                "explanation": item.explanation,
            }
        )
    payload["conflicts"] = conflicts
    return FundingOpportunityResearchResult.model_validate(payload)
