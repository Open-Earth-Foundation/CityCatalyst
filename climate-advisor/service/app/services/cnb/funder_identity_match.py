"""LLM-backed canonical-funder candidate generation for funded-project review."""

from __future__ import annotations

import json
import logging
from uuid import UUID

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from app.models.cnb.research import (
    CanonicalFunder,
    FundedProjectDraft,
    FunderIdentityCandidate,
)

logger = logging.getLogger(__name__)


class FunderIdentityLlmMatch(BaseModel):
    """One canonical funder proposed by the identity model."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    funder_id: UUID
    match_reason: str = Field(min_length=1)


class FunderIdentityLlmDecision(BaseModel):
    """Candidate funders proposed for one researched funded project."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    funded_project_ref: str = Field(min_length=1)
    matches: list[FunderIdentityLlmMatch]


class FunderIdentityLlmDecisionSet(BaseModel):
    """Structured output returned by the funder-identity model call."""

    model_config = ConfigDict(extra="forbid")

    decisions: list[FunderIdentityLlmDecision]


def propose_funder_identity_candidates(
    *,
    funded_projects: list[FundedProjectDraft],
    canonical_funders: list[CanonicalFunder],
    openai_client: OpenAI,
    model_name: str,
    reasoning_effort: str,
    prompt: str,
    dossier_funder_name: str | None = None,
    store_responses: bool = False,
) -> list[FundedProjectDraft]:
    """Use one structured LLM call to propose review-only canonical funders.

    Source-reported funder names remain unchanged, model-returned IDs are
    checked against the supplied canonical list, and no candidate is selected
    automatically.
    """
    # Build one compact request for funded records that have an identity name.
    dossier_name = (dossier_funder_name or "").strip()
    matchable_projects: list[FundedProjectDraft] = []
    project_payloads: list[dict[str, object]] = []
    for project in funded_projects:
        reported_name = (project.reported_funder_name or "").strip()
        identity_name = reported_name or dossier_name
        if not identity_name:
            continue
        matchable_projects.append(project)
        project_payloads.append(
            {
                "funded_project_ref": project.funded_project_ref,
                "identity_name": identity_name,
                "identity_name_source": (
                    "reported_funder_name"
                    if reported_name
                    else "dossier_funder_name"
                ),
                "project_context": project.model_dump(
                    mode="json",
                    include={
                        "name",
                        "applicant_name",
                        "city",
                        "state_region",
                        "country",
                        "summary",
                    },
                ),
            }
        )

    decisions_by_project: dict[str, FunderIdentityLlmDecision] = {}
    if matchable_projects and canonical_funders:
        payload = {
            "funded_projects": project_payloads,
            "canonical_funders": [
                funder.model_dump(mode="json") for funder in canonical_funders
            ],
        }
        logger.info(
            "Running CNB funder-identity matching for %s records against %s funders.",
            len(matchable_projects),
            len(canonical_funders),
        )
        response = openai_client.responses.parse(
            model=model_name,
            reasoning={"effort": reasoning_effort},
            instructions=prompt,
            input=json.dumps(payload, ensure_ascii=False),
            text_format=FunderIdentityLlmDecisionSet,
            store=store_responses,
        )
        if response.output_parsed is None:
            raise RuntimeError("Funder-identity matcher returned no structured output")
        decisions_by_project = _validate_decisions(
            matchable_projects=matchable_projects,
            canonical_funders=canonical_funders,
            decision_set=response.output_parsed,
        )

    # Rebuild candidates from code-owned names and always require human selection.
    funders_by_id = {funder.funder_id: funder for funder in canonical_funders}
    updated_projects: list[FundedProjectDraft] = []
    for project in funded_projects:
        decision = decisions_by_project.get(project.funded_project_ref)
        candidates = []
        if decision is not None:
            candidates = [
                FunderIdentityCandidate(
                    funder_id=match.funder_id,
                    name=funders_by_id[match.funder_id].name,
                    match_reason=match.match_reason,
                )
                for match in decision.matches
            ]
        updated_projects.append(
            project.model_copy(
                update={
                    "candidate_funders": candidates,
                    "selected_funder_id": None,
                }
            )
        )
    return updated_projects


def _validate_decisions(
    *,
    matchable_projects: list[FundedProjectDraft],
    canonical_funders: list[CanonicalFunder],
    decision_set: FunderIdentityLlmDecisionSet,
) -> dict[str, FunderIdentityLlmDecision]:
    """Reject omitted records, duplicate matches, and model-invented identifiers."""
    expected_project_refs = {
        project.funded_project_ref for project in matchable_projects
    }
    canonical_funder_ids = {funder.funder_id for funder in canonical_funders}
    decisions_by_project: dict[str, FunderIdentityLlmDecision] = {}

    for decision in decision_set.decisions:
        project_ref = decision.funded_project_ref
        if project_ref not in expected_project_refs:
            raise ValueError(
                f"Funder-identity matcher returned unknown project {project_ref}"
            )
        if project_ref in decisions_by_project:
            raise ValueError(
                f"Funder-identity matcher returned duplicate project {project_ref}"
            )
        matched_funder_ids: set[UUID] = set()
        for match in decision.matches:
            if match.funder_id not in canonical_funder_ids:
                raise ValueError(
                    "Funder-identity matcher returned unknown canonical funder "
                    f"{match.funder_id}"
                )
            if match.funder_id in matched_funder_ids:
                raise ValueError(
                    "Funder-identity matcher returned duplicate canonical funder "
                    f"{match.funder_id} for project {project_ref}"
                )
            matched_funder_ids.add(match.funder_id)
        decisions_by_project[project_ref] = decision

    missing_project_refs = expected_project_refs - set(decisions_by_project)
    if missing_project_refs:
        raise ValueError(
            "Funder-identity matcher omitted projects: "
            f"{', '.join(sorted(missing_project_refs))}"
        )
    return decisions_by_project
