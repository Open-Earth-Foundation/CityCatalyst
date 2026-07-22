"""LLM-backed canonical-funder candidate generation for funded-project review."""

from __future__ import annotations

import json
import logging
from uuid import UUID

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from app.models.cnb_research import (
    CanonicalFunder,
    FunderIdentityCandidate,
    FundingRecordDraft,
)

logger = logging.getLogger(__name__)


class FunderIdentityLlmMatch(BaseModel):
    """One canonical funder proposed by the identity model."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    funder_id: UUID
    match_reason: str = Field(min_length=1)


class FunderIdentityLlmDecision(BaseModel):
    """Candidate funders proposed for one researched funding record."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    funding_record_ref: str = Field(min_length=1)
    matches: list[FunderIdentityLlmMatch]


class FunderIdentityLlmDecisionSet(BaseModel):
    """Structured output returned by the funder-identity model call."""

    model_config = ConfigDict(extra="forbid")

    decisions: list[FunderIdentityLlmDecision]


def propose_funder_identity_candidates(
    *,
    funding_records: list[FundingRecordDraft],
    canonical_funders: list[CanonicalFunder],
    openai_client: OpenAI,
    model_name: str,
    reasoning_effort: str,
    prompt: str,
    dossier_funder_name: str | None = None,
    store_responses: bool = False,
) -> list[FundingRecordDraft]:
    """Use one structured LLM call to propose review-only canonical funders.

    Source-reported funder names remain unchanged, model-returned IDs are
    checked against the supplied canonical list, and no candidate is selected
    automatically.
    """
    # Build one compact request for funded records that have an identity name.
    dossier_name = (dossier_funder_name or "").strip()
    matchable_records: list[FundingRecordDraft] = []
    record_payloads: list[dict[str, object]] = []
    for record in funding_records:
        if record.is_opportunity:
            continue
        reported_name = (record.reported_funder_name or "").strip()
        identity_name = reported_name or dossier_name
        if not identity_name:
            continue
        matchable_records.append(record)
        record_payloads.append(
            {
                "funding_record_ref": record.funding_record_ref,
                "identity_name": identity_name,
                "identity_name_source": (
                    "reported_funder_name"
                    if reported_name
                    else "dossier_funder_name"
                ),
                "project_context": record.model_dump(
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

    decisions_by_record: dict[str, FunderIdentityLlmDecision] = {}
    if matchable_records and canonical_funders:
        payload = {
            "funding_records": record_payloads,
            "canonical_funders": [
                funder.model_dump(mode="json") for funder in canonical_funders
            ],
        }
        logger.info(
            "Running CNB funder-identity matching for %s records against %s funders.",
            len(matchable_records),
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
        decisions_by_record = _validate_decisions(
            matchable_records=matchable_records,
            canonical_funders=canonical_funders,
            decision_set=response.output_parsed,
        )

    # Rebuild candidates from code-owned names and always require human selection.
    funders_by_id = {funder.funder_id: funder for funder in canonical_funders}
    updated_records: list[FundingRecordDraft] = []
    for record in funding_records:
        if record.is_opportunity:
            updated_records.append(record)
            continue
        decision = decisions_by_record.get(record.funding_record_ref)
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
        updated_records.append(
            record.model_copy(
                update={
                    "candidate_funders": candidates,
                    "selected_funder_id": None,
                }
            )
        )
    return updated_records


def _validate_decisions(
    *,
    matchable_records: list[FundingRecordDraft],
    canonical_funders: list[CanonicalFunder],
    decision_set: FunderIdentityLlmDecisionSet,
) -> dict[str, FunderIdentityLlmDecision]:
    """Reject omitted records, duplicate matches, and model-invented identifiers."""
    expected_record_refs = {
        record.funding_record_ref for record in matchable_records
    }
    canonical_funder_ids = {funder.funder_id for funder in canonical_funders}
    decisions_by_record: dict[str, FunderIdentityLlmDecision] = {}

    for decision in decision_set.decisions:
        record_ref = decision.funding_record_ref
        if record_ref not in expected_record_refs:
            raise ValueError(
                f"Funder-identity matcher returned unknown record {record_ref}"
            )
        if record_ref in decisions_by_record:
            raise ValueError(
                f"Funder-identity matcher returned duplicate record {record_ref}"
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
                    f"{match.funder_id} for record {record_ref}"
                )
            matched_funder_ids.add(match.funder_id)
        decisions_by_record[record_ref] = decision

    missing_record_refs = expected_record_refs - set(decisions_by_record)
    if missing_record_refs:
        raise ValueError(
            "Funder-identity matcher omitted records: "
            f"{', '.join(sorted(missing_record_refs))}"
        )
    return decisions_by_record
