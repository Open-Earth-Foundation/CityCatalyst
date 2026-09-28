"""Release-time authority-scope contract helpers shared by report and S3 paths.

Report serving never calls Jev. It only consumes a validated sidecar label plus
deterministic verdict/ownership guards.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Literal

AUTHORITY_SCOPE_CONTRACT_VERSION = "authority-scope-v1"
AUTHORITY_SCOPE_RUBRIC_VERSION = "authority-scope-rubric-v1"
AUTHORITY_SCOPE_FULL_DIRECT = "full_direct"
AUTHORITY_SCOPE_MUNICIPAL_ASSETS_ONLY = "municipal_assets_only"
AUTHORITY_SCOPE_QUALIFIED = "qualified"
AUTHORITY_SCOPE_UNCLASSIFIED = "unclassified"
AUTHORITY_SCOPE_BLOCKED = "blocked"
AUTHORITY_SCOPE_UNSPECIFIED = "unspecified"

AuthorityScopeSemanticLabel = Literal[
    "full_direct",
    "municipal_assets_only",
    "qualified",
    "unclassified",
]
AuthorityScopeReportLabel = Literal[
    "full_direct",
    "municipal_assets_only",
    "qualified",
    "unclassified",
    "blocked",
    "unspecified",
]
AuthorityScopeStatus = Literal[
    "release_validated",
    "missing_sidecar",
    "stale_sidecar",
    "invalid_sidecar",
    "missing_etag",
    "pending_human_review",
    "human_rejected",
    "low_confidence",
    "structural_conflict",
    "unclassified_label",
]

SEMANTIC_AUTHORITY_SCOPE_LABELS: frozenset[str] = frozenset(
    {
        AUTHORITY_SCOPE_FULL_DIRECT,
        AUTHORITY_SCOPE_MUNICIPAL_ASSETS_ONLY,
        AUTHORITY_SCOPE_QUALIFIED,
        AUTHORITY_SCOPE_UNCLASSIFIED,
    }
)
DIRECT_AUTHORITY_SCOPE_LABELS: frozenset[str] = frozenset(
    {
        AUTHORITY_SCOPE_FULL_DIRECT,
        AUTHORITY_SCOPE_MUNICIPAL_ASSETS_ONLY,
    }
)

AUTHORITY_SCOPE_CHOICE_CRITERIA: dict[str, str] = {
    AUTHORITY_SCOPE_FULL_DIRECT: (
        "The municipality has explicit direct authority across the relevant "
        "action scope, without a material municipal/private or approval "
        "limitation."
    ),
    AUTHORITY_SCOPE_MUNICIPAL_ASSETS_ONLY: (
        "Direct authority is expressly limited to municipally owned or operated "
        "assets; private or third-party assets require a separate facilitator, "
        "consent, subsidy, or owner decision."
    ),
    AUTHORITY_SCOPE_QUALIFIED: (
        "Authority is conditional, incomplete, ambiguous, requires further "
        "approval, or cannot safely be placed in either direct category."
    ),
    AUTHORITY_SCOPE_UNCLASSIFIED: (
        "The row is contradictory, insufficient, or too uncertain to classify "
        "into the other labels."
    ),
}

CLASSIFIER_INPUT_FIELD_ORDER: tuple[str, ...] = (
    "country_code",
    "action_id",
    "verdict_category",
    "ownership_category",
    "restrictions_category",
    "ownership_description_en",
    "ownership_description_es",
    "restrictions_description_en",
    "restrictions_description_es",
    "legal_justification_en",
    "legal_justification_es",
    "legal_references",
)


def canonicalize_classifier_input(payload: dict[str, Any]) -> dict[str, Any]:
    """Return a stable, hashable classifier input object for one legal row."""
    references = payload.get("legal_references") or []
    if not isinstance(references, list):
        raise ValueError("legal_references must be a list")
    cleaned_references = [
        str(item).strip() for item in references if str(item).strip()
    ]
    canonical: dict[str, Any] = {}
    for field in CLASSIFIER_INPUT_FIELD_ORDER:
        if field == "legal_references":
            canonical[field] = cleaned_references
            continue
        value = payload.get(field)
        if value is None:
            canonical[field] = None
            continue
        cleaned = str(value).strip()
        canonical[field] = cleaned or None
    return canonical


def canonical_row_sha256(payload: dict[str, Any]) -> str:
    """Return the SHA-256 of the canonical classifier input JSON."""
    canonical = canonicalize_classifier_input(payload)
    encoded = json.dumps(
        canonical,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def is_semantic_authority_scope_label(value: object) -> bool:
    """Return whether value is one of the closed semantic classifier labels."""
    return isinstance(value, str) and value in SEMANTIC_AUTHORITY_SCOPE_LABELS


def structural_conflict_for_label(
    *,
    verdict_category: str | None,
    ownership_category: str | None,
    selected_label: str,
) -> bool:
    """Return whether a selected direct label conflicts with upstream categories."""
    if selected_label not in DIRECT_AUTHORITY_SCOPE_LABELS:
        return False
    return not (
        verdict_category == "enabled" and ownership_category == "enabled"
    )


def resolve_report_authority_scope(
    *,
    verdict_category: str | None,
    ownership_category: str | None,
    selected_label: str | None,
    label_accepted: bool,
    confidence_passed: bool,
) -> tuple[str, AuthorityScopeStatus]:
    """Map sidecar label + structural guards into the report-facing scope."""
    if verdict_category == "blocked":
        return AUTHORITY_SCOPE_BLOCKED, "release_validated"

    if selected_label is None or not label_accepted:
        if verdict_category in {"enabled", "conditional"}:
            return AUTHORITY_SCOPE_QUALIFIED, "missing_sidecar"
        return AUTHORITY_SCOPE_UNSPECIFIED, "missing_sidecar"

    if not is_semantic_authority_scope_label(selected_label):
        return AUTHORITY_SCOPE_QUALIFIED, "invalid_sidecar"

    if not confidence_passed or selected_label == AUTHORITY_SCOPE_UNCLASSIFIED:
        status: AuthorityScopeStatus = (
            "unclassified_label"
            if selected_label == AUTHORITY_SCOPE_UNCLASSIFIED
            else "low_confidence"
        )
        if verdict_category in {"enabled", "conditional"}:
            return AUTHORITY_SCOPE_QUALIFIED, status
        return AUTHORITY_SCOPE_UNSPECIFIED, status

    if structural_conflict_for_label(
        verdict_category=verdict_category,
        ownership_category=ownership_category,
        selected_label=selected_label,
    ):
        return AUTHORITY_SCOPE_QUALIFIED, "structural_conflict"

    return selected_label, "release_validated"


def authority_scope_summary(
    scope: str,
    ownership_description: str | None,
    *,
    status: str | None = None,
) -> str | None:
    """Return a conservative reader-facing authority-scope sentence."""
    if scope == AUTHORITY_SCOPE_MUNICIPAL_ASSETS_ONLY:
        return (
            "The legal review supports direct municipal authority over municipal "
            "assets. Private or external assets require facilitation rather than "
            "direct authority."
        )
    if status in {
        "low_confidence",
        "missing_sidecar",
        "stale_sidecar",
        "invalid_sidecar",
        "missing_etag",
        "pending_human_review",
        "human_rejected",
        "unclassified_label",
    } and scope in {AUTHORITY_SCOPE_QUALIFIED, AUTHORITY_SCOPE_UNCLASSIFIED}:
        return (
            "The legal review finds that the city can pursue this action, but "
            "authority scope is not yet release-validated for this legal data "
            "version, so wording stays conservative."
        )
    if scope in {
        AUTHORITY_SCOPE_QUALIFIED,
        AUTHORITY_SCOPE_UNCLASSIFIED,
    }:
        return (
            "The legal review finds that the city can pursue this action, but "
            "the assessed asset scope is limited or conditional."
        )
    return ownership_description


def classifier_input_from_legal_row(
    *,
    country_code: str,
    action_id: str,
    verdict_category: str | None,
    ownership_category: str | None,
    restrictions_category: str | None,
    ownership_description_en: str | None,
    ownership_description_es: str | None,
    restrictions_description_en: str | None,
    restrictions_description_es: str | None,
    legal_justification_en: str | None,
    legal_justification_es: str | None,
    legal_references: list[str],
) -> dict[str, Any]:
    """Build the closed classifier input for one legal CSV/API row."""
    return canonicalize_classifier_input(
        {
            "country_code": country_code.strip().upper(),
            "action_id": action_id,
            "verdict_category": verdict_category,
            "ownership_category": ownership_category,
            "restrictions_category": restrictions_category,
            "ownership_description_en": ownership_description_en,
            "ownership_description_es": ownership_description_es,
            "restrictions_description_en": restrictions_description_en,
            "restrictions_description_es": restrictions_description_es,
            "legal_justification_en": legal_justification_en,
            "legal_justification_es": legal_justification_es,
            "legal_references": legal_references,
        }
    )
