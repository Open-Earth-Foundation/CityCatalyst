"""LLM-backed canonical-funder candidate generation for funded-project review."""

from __future__ import annotations

import json
import logging

from app.models.cnb.research import (
    CanonicalFunder,
    FundedProjectDraft,
    FunderIdentityCandidate,
)
from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


class FunderIdentityLlmMatch(BaseModel):
    """One canonical funder proposed by the identity model."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    funder_name: str = Field(min_length=1)
    match_reason: str = Field(min_length=1)


class FunderIdentityLlmDecision(BaseModel):
    """Candidate funders proposed for one researched funded project."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    project_name: str = Field(min_length=1)
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

    Source-reported funder names remain unchanged, model-returned names are
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
                "identity_name": identity_name,
                "identity_name_source": (
                    "reported_funder_name" if reported_name else "dossier_funder_name"
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
                {"name": funder.name} for funder in canonical_funders
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
    funders_by_name = {funder.name.strip(): funder for funder in canonical_funders}
    updated_projects: list[FundedProjectDraft] = []
    for project in funded_projects:
        decision = decisions_by_project.get(project.funded_project_ref)
        candidates = []
        if decision is not None:
            candidates = [
                FunderIdentityCandidate(
                    funder_id=funders_by_name[match.funder_name].funder_id,
                    name=funders_by_name[match.funder_name].name,
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
    """Validate ordered projects and uniquely resolvable funder names."""
    if len(decision_set.decisions) != len(matchable_projects):
        raise ValueError(
            "Funder-identity matcher must return every project in input order"
        )
    canonical_names = [funder.name.strip() for funder in canonical_funders]
    decisions_by_project: dict[str, FunderIdentityLlmDecision] = {}

    for project, decision in zip(
        matchable_projects, decision_set.decisions, strict=True
    ):
        if decision.project_name != project.name.strip():
            raise ValueError("Funder-identity matcher changed project order or name")
        matched_names: set[str] = set()
        for match in decision.matches:
            if canonical_names.count(match.funder_name) != 1:
                raise ValueError(
                    "Funder-identity matcher returned unknown or ambiguous canonical funder "
                    f"{match.funder_name}"
                )
            if match.funder_name in matched_names:
                raise ValueError(
                    "Funder-identity matcher returned duplicate canonical funder "
                    f"{match.funder_name} for project {project.name}"
                )
            matched_names.add(match.funder_name)
        decisions_by_project[project.funded_project_ref] = decision
    return decisions_by_project
