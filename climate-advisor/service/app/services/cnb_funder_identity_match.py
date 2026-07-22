"""Deterministic canonical-funder candidate generation for funded-project review."""

from __future__ import annotations

import re
from typing import NamedTuple

from app.models.cnb_research import (
    CanonicalFunder,
    FunderIdentityCandidate,
    FundingRecordDraft,
)

_TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
_COMMON_NAME_TOKENS = {
    "and",
    "authority",
    "board",
    "city",
    "commission",
    "corporation",
    "council",
    "county",
    "department",
    "district",
    "fund",
    "foundation",
    "government",
    "grant",
    "grants",
    "inc",
    "llc",
    "of",
    "office",
    "program",
    "state",
    "the",
}


class _ScoredCandidate(NamedTuple):
    """Internal sort key for deterministic candidate ordering."""

    score: int
    candidate: FunderIdentityCandidate


def propose_funder_identity_candidates(
    *,
    funding_records: list[FundingRecordDraft],
    canonical_funders: list[CanonicalFunder],
    dossier_funder_name: str | None = None,
) -> list[FundingRecordDraft]:
    """Attach reviewer-facing funder candidates to funded projects only.

    The dossier funder is used only when a funded project has no source-reported
    funder name. It proposes candidates without changing the reported-name field.
    """
    updated_records: list[FundingRecordDraft] = []
    for record in funding_records:
        if record.is_opportunity:
            updated_records.append(record)
            continue

        # Preserve the source-reported name, but require a reviewer to select the ID.
        candidates = match_canonical_funders(
            reported_name=record.reported_funder_name,
            dossier_funder_name=dossier_funder_name,
            canonical_funders=canonical_funders,
        )
        updated_records.append(
            record.model_copy(
                update={
                    "candidate_funders": candidates,
                    "selected_funder_id": None,
                }
            )
        )
    return updated_records


def match_canonical_funders(
    *,
    reported_name: str | None,
    dossier_funder_name: str | None = None,
    canonical_funders: list[CanonicalFunder],
) -> list[FunderIdentityCandidate]:
    """Return candidates from a reported name or the known dossier funder."""
    cleaned_reported_name = (reported_name or "").strip()
    cleaned_dossier_name = (dossier_funder_name or "").strip()
    using_dossier_name = not cleaned_reported_name
    matched_name = cleaned_reported_name or cleaned_dossier_name
    if not matched_name:
        return []

    # Order exact matches before normalized/substring matches and token overlap.
    scored_candidates: list[_ScoredCandidate] = []
    raw_name = matched_name.casefold()
    normalized_name = normalize_funder_name(matched_name)
    if not normalized_name:
        return []
    name_tokens = distinctive_tokens(matched_name)
    for funder in canonical_funders:
        reason: str | None = None
        score = 0
        candidate_raw_name = funder.name.strip().casefold()
        candidate_normalized_name = normalize_funder_name(funder.name)
        if raw_name == candidate_raw_name:
            reason = (
                "Exact dossier-funder name match"
                if using_dossier_name
                else "Exact reported name match"
            )
            score = 300
        elif (
            normalized_name == candidate_normalized_name
            or normalized_name in candidate_normalized_name
            or candidate_normalized_name in normalized_name
        ):
            reason = (
                "Normalized dossier-funder name match"
                if using_dossier_name
                else "Normalized name match"
            )
            score = 200
        else:
            overlap = name_tokens & distinctive_tokens(funder.name)
            if len(overlap) >= 2:
                reason = (
                    "Shared dossier-funder name tokens"
                    if using_dossier_name
                    else "Shared name tokens"
                )
                score = 100 + len(overlap)

        if reason is None:
            continue
        scored_candidates.append(
            _ScoredCandidate(
                score=score,
                candidate=FunderIdentityCandidate(
                    funder_id=funder.funder_id,
                    name=funder.name,
                    match_reason=reason,
                ),
            )
        )

    return [
        item.candidate
        for item in sorted(
            scored_candidates,
            key=lambda item: (
                -item.score,
                normalize_funder_name(item.candidate.name),
                str(item.candidate.funder_id),
            ),
        )
    ]


def normalize_funder_name(name: str) -> str:
    """Lowercase and collapse punctuation so equivalent names compare reliably."""
    tokens = _TOKEN_PATTERN.findall(name.casefold().replace("&", " and "))
    return " ".join(tokens)


def distinctive_tokens(name: str) -> set[str]:
    """Keep non-trivial normalized tokens for deterministic overlap matching."""
    return {
        token
        for token in normalize_funder_name(name).split()
        if len(token) > 2 and token not in _COMMON_NAME_TOKENS
    }
