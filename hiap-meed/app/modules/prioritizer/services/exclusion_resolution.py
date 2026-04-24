"""Resolve exclusion preferences into proposed action exclusions."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import BaseModel, Field

from app.modules.prioritizer.config import (
    get_free_text_exclusion_model,
    is_free_text_exclusion_resolution_enabled,
)
from app.modules.prioritizer.internal_models import Action
from app.modules.prioritizer.models import (
    ExclusionPreviewCityInput,
    ExclusionPreviewCityResult,
    ExclusionSummary,
    ExclusionSummaryReasonGroup,
    ProposedExcludedAction,
)
from app.modules.prioritizer.utils.sector_mapping import (
    normalize_sector_tags,
    resolve_action_sector_tags,
)
from app.services.openai_client import create_openai_client

logger = logging.getLogger(__name__)

PROMPT_FILE_PATH = (
    Path(__file__).resolve().parents[1]
    / "prompts"
    / "free_text_exclusion_resolution.md"
)
SYSTEM_PROMPT_FILE_PATH = (
    Path(__file__).resolve().parents[1]
    / "prompts"
    / "free_text_exclusion_resolution_system.md"
)
FREE_TEXT_EXCLUSION_MAX_CHARS = 400
FREE_TEXT_EXCLUSION_PROMPT_WARNING_CHARS = 30_000


class FreeTextExclusionMatch(BaseModel):
    """Structured LLM row for one proposed free-text exclusion."""

    action_id: str
    reason: str
    match_is_clear: bool = False


class FreeTextExclusionBatch(BaseModel):
    """Structured LLM response for free-text exclusion resolution."""

    matches: list[FreeTextExclusionMatch] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


def resolve_exclusion_preview_with_diagnostics(
    *, city_input: ExclusionPreviewCityInput, actions: list[Action]
) -> tuple[ExclusionPreviewCityResult, dict[str, object]]:
    """
    Resolve one city's exclusion preview and return API result plus diagnostics.

    Diagnostics are intended for logs and artifact files, not for direct
    frontend rendering.
    """
    reasons_by_action_id: dict[str, list[str]] = {}
    matched_by_action_id: dict[str, set[str]] = {}
    warnings: list[str] = []

    # Step 1: deterministic sector exclusions.
    _add_sector_exclusions(
        actions=actions,
        excluded_sector_tags=city_input.excludedSectorTags,
        reasons_by_action_id=reasons_by_action_id,
        matched_by_action_id=matched_by_action_id,
    )

    # Step 2: deterministic negative co-benefit exclusions.
    _add_co_benefit_exclusions(
        actions=actions,
        excluded_co_benefit_keys=city_input.excludedCoBenefitKeys,
        reasons_by_action_id=reasons_by_action_id,
        matched_by_action_id=matched_by_action_id,
    )

    # Step 3: guarded LLM free-text exclusions.
    (
        free_text_reasons,
        free_text_warnings,
        free_text_diagnostics,
    ) = resolve_free_text_exclusions(
        actions=actions,
        excluded_actions_free_text=city_input.excludedActionsFreeText,
    )
    warnings.extend(free_text_warnings)
    for action_id, reason in free_text_reasons.items():
        reasons_by_action_id.setdefault(action_id, []).append(reason)
        matched_by_action_id.setdefault(action_id, set()).add("free_text_llm")

    proposed_actions = _build_proposed_actions(
        actions=actions,
        reasons_by_action_id=reasons_by_action_id,
        matched_by_action_id=matched_by_action_id,
    )
    result = ExclusionPreviewCityResult(
        locode=city_input.locode,
        proposedExcludedActions=proposed_actions,
        exclusionSummary=_build_exclusion_summary(proposed_actions),
        warnings=warnings,
    )
    diagnostics = {
        "locode": city_input.locode,
        "input": {
            "excludedSectorTags": list(city_input.excludedSectorTags),
            "excludedCoBenefitKeys": list(city_input.excludedCoBenefitKeys),
            "excludedActionsFreeText": city_input.excludedActionsFreeText,
        },
        "counts": {
            "actions_considered": len(actions),
            "proposed_exclusions": len(proposed_actions),
        },
        "free_text_resolution": free_text_diagnostics,
        "warnings": warnings,
        "proposed_excluded_action_ids": [
            action.actionId for action in proposed_actions
        ],
    }
    return result, diagnostics


def resolve_free_text_exclusions(
    *, actions: list[Action], excluded_actions_free_text: str | None
) -> tuple[dict[str, str], list[str], dict[str, object]]:
    """Resolve free-text exclusions via guarded structured LLM output."""
    if not excluded_actions_free_text or not excluded_actions_free_text.strip():
        return {}, [], {"status": "skipped", "reason": "blank_input"}
    if not is_free_text_exclusion_resolution_enabled():
        return (
            {},
            ["Free-text exclusion resolution is disabled."],
            {"status": "skipped", "reason": "feature_disabled"},
        )

    model_name = get_free_text_exclusion_model()
    if model_name is None:
        return (
            {},
            ["Free-text exclusion model is not configured."],
            {"status": "skipped", "reason": "missing_model"},
        )

    truncated_text = _truncate_free_text(excluded_actions_free_text)
    prompt = _build_prompt(
        excluded_actions_free_text=truncated_text,
        actions=actions,
    )
    _warn_if_prompt_is_large(prompt=prompt, action_count=len(actions))
    system_prompt = _read_system_prompt_template()

    try:
        client = create_openai_client()
        completion = client.chat.completions.parse(
            model=model_name,
            temperature=0,
            response_format=FreeTextExclusionBatch,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        )
    except Exception as error:
        logger.warning("Free-text exclusion resolution failed error=%s", error)
        return (
            {},
            [
                "Free-text exclusion resolution failed; no free-text exclusions proposed."
            ],
            {
                "status": "failed",
                "provider": "openai",
                "model": model_name,
                "input_text": truncated_text,
                "error": str(error),
            },
        )

    parsed = completion.choices[0].message.parsed
    if parsed is None:
        return (
            {},
            ["Free-text exclusion resolver returned no structured output."],
            {
                "status": "failed",
                "provider": "openai",
                "model": model_name,
                "input_text": truncated_text,
                "error": "no_structured_output",
            },
        )

    expected_action_ids = {action.action_id for action in actions}
    resolved, dropped_rows, drop_counts = _validated_llm_matches(
        rows=parsed.matches,
        expected_action_ids=expected_action_ids,
    )
    warnings = list(parsed.warnings)
    warnings.extend(_drop_count_warnings(drop_counts))
    if sum(drop_counts.values()) > 0:
        logger.warning(
            "Dropped free-text exclusion LLM rows unknown_ids=%s ambiguous=%s empty_reason=%s accepted=%s returned=%s",
            drop_counts["unknown_action_id"],
            drop_counts["ambiguous_match"],
            drop_counts["empty_reason"],
            len(resolved),
            len(parsed.matches),
        )
    diagnostics = {
        "status": "completed",
        "provider": "openai",
        "model": model_name,
        "input_text": truncated_text,
        "llm_output": parsed.model_dump(mode="json"),
        "validation": {
            "returned_matches_count": len(parsed.matches),
            "accepted_matches_count": len(resolved),
            "dropped_rows": dropped_rows,
            "drop_counts": drop_counts,
        },
        "warnings": warnings,
    }
    return resolved, warnings, diagnostics


def _add_sector_exclusions(
    *,
    actions: list[Action],
    excluded_sector_tags: list[str],
    reasons_by_action_id: dict[str, list[str]],
    matched_by_action_id: dict[str, set[str]],
) -> None:
    """Add deterministic sector exclusion reasons to mutable result maps."""
    selected_sector_tags = normalize_sector_tags(excluded_sector_tags)
    if not selected_sector_tags:
        return

    for action in actions:
        action_sector_tags = resolve_action_sector_tags(action)
        matched_sectors = sorted(selected_sector_tags.intersection(action_sector_tags))
        if not matched_sectors:
            continue
        reasons_by_action_id.setdefault(action.action_id, []).append(
            "Action belongs to excluded sector(s): " + ", ".join(matched_sectors)
        )
        matched_by_action_id.setdefault(action.action_id, set()).add("sector")


def _add_co_benefit_exclusions(
    *,
    actions: list[Action],
    excluded_co_benefit_keys: list[str],
    reasons_by_action_id: dict[str, list[str]],
    matched_by_action_id: dict[str, set[str]],
) -> None:
    """Add exclusions for selected co-benefits with negative action impact."""
    selected_keys = {
        key.strip().lower() for key in excluded_co_benefit_keys if key.strip()
    }
    if not selected_keys:
        return

    for action in actions:
        negative_keys: list[str] = []
        for key in sorted(selected_keys):
            co_benefit = action.co_benefits.get(key)
            if co_benefit is None:
                continue
            impact_numeric = co_benefit.get("impact_numeric")
            if isinstance(impact_numeric, int | float) and impact_numeric < 0:
                negative_keys.append(key)
        if not negative_keys:
            continue
        reasons_by_action_id.setdefault(action.action_id, []).append(
            "Action has negative impact on selected co-benefit(s): "
            + ", ".join(negative_keys)
        )
        matched_by_action_id.setdefault(action.action_id, set()).add("co_benefit")


def _validated_llm_matches(
    *, rows: list[FreeTextExclusionMatch], expected_action_ids: set[str]
) -> tuple[dict[str, str], list[dict[str, object]], dict[str, int]]:
    """
    Validate preview-time LLM exclusion matches before they reach the API response.

    This function is the server-side guardrail for free-text exclusion preview.
    It converts structured LLM rows into a simple `action_id -> reason` mapping,
    records dropped rows for diagnostics, and only keeps rows that are safe to
    trust:

    - `action_id` must exactly match an action in the request's action catalog
    - `match_is_clear` must be `True`
    - `reason` must contain non-whitespace text after normalization

    Returns:
    - accepted rows as `action_id -> reason`
    - dropped-row diagnostics with a `drop_reason` per row
    - aggregate drop counts keyed by reason type

    If the same `action_id` appears multiple times, the last valid row wins.
    """
    resolved: dict[str, str] = {}
    dropped_rows: list[dict[str, object]] = []
    drop_counts = {
        "unknown_action_id": 0,
        "ambiguous_match": 0,
        "empty_reason": 0,
    }
    for row in rows:
        action_id = row.action_id.strip()
        reason = " ".join(row.reason.strip().split())
        if action_id not in expected_action_ids:
            drop_counts["unknown_action_id"] += 1
            dropped_rows.append(
                _build_dropped_row(
                    row=row,
                    normalized_action_id=action_id,
                    reason=reason,
                    drop_reason="unknown_action_id",
                )
            )
            continue
        if not row.match_is_clear or not reason:
            drop_reason = (
                "ambiguous_match" if not row.match_is_clear else "empty_reason"
            )
            drop_counts[drop_reason] += 1
            dropped_rows.append(
                _build_dropped_row(
                    row=row,
                    normalized_action_id=action_id,
                    reason=reason,
                    drop_reason=drop_reason,
                )
            )
            continue
        resolved[action_id] = reason
    return resolved, dropped_rows, drop_counts


def _build_dropped_row(
    *,
    row: FreeTextExclusionMatch,
    normalized_action_id: str,
    reason: str,
    drop_reason: str,
) -> dict[str, object]:
    """Build one dropped-row diagnostic payload for logging and artifacts."""
    return {
        "action_id": row.action_id,
        "normalized_action_id": normalized_action_id,
        "reason": row.reason,
        "normalized_reason": reason,
        "match_is_clear": row.match_is_clear,
        "drop_reason": drop_reason,
    }


def _drop_count_warnings(drop_counts: dict[str, int]) -> list[str]:
    """Convert LLM validation drop counts into compact frontend-safe warnings."""
    warnings: list[str] = []
    if drop_counts["unknown_action_id"] > 0:
        warnings.append(
            "Some free-text matches were ignored because they did not match known actions."
        )
    if drop_counts["ambiguous_match"] > 0:
        warnings.append(
            "Some free-text matches were ignored because they were ambiguous."
        )
    if drop_counts["empty_reason"] > 0:
        warnings.append(
            "Some free-text matches were ignored because the resolver did not provide a usable reason."
        )
    return warnings


def _build_proposed_actions(
    *,
    actions: list[Action],
    reasons_by_action_id: dict[str, list[str]],
    matched_by_action_id: dict[str, set[str]],
) -> list[ProposedExcludedAction]:
    """Build sorted public proposed-exclusion rows."""
    action_by_id = {action.action_id: action for action in actions}
    proposed_actions: list[ProposedExcludedAction] = []
    for action_id in sorted(reasons_by_action_id):
        action = action_by_id.get(action_id)
        if action is None:
            continue
        proposed_actions.append(
            ProposedExcludedAction(
                actionId=action.action_id,
                actionName=action.action_name,
                reasons=list(dict.fromkeys(reasons_by_action_id[action_id])),
                matchedBy=sorted(matched_by_action_id.get(action_id, set())),
            )
        )
    return proposed_actions


def _build_exclusion_summary(
    proposed_actions: list[ProposedExcludedAction],
) -> ExclusionSummary:
    """Build grouped counts for proposed exclusions."""
    by_reason_type: dict[str, ExclusionSummaryReasonGroup] = {}
    for proposed_action in proposed_actions:
        for reason_type in proposed_action.matchedBy:
            group = by_reason_type.setdefault(
                reason_type, ExclusionSummaryReasonGroup()
            )
            group.actionIds.append(proposed_action.actionId)
            group.count = len(group.actionIds)

    return ExclusionSummary(
        totalProposed=len(proposed_actions),
        byReasonType=by_reason_type,
    )


def _truncate_free_text(value: str) -> str:
    """Clamp free-text exclusion input before prompt rendering."""
    if len(value) <= FREE_TEXT_EXCLUSION_MAX_CHARS:
        return value
    logger.warning(
        "Truncating free-text exclusion input from %s to %s characters",
        len(value),
        FREE_TEXT_EXCLUSION_MAX_CHARS,
    )
    return value[:FREE_TEXT_EXCLUSION_MAX_CHARS]


def _build_prompt(*, excluded_actions_free_text: str, actions: list[Action]) -> str:
    """Build the free-text exclusion prompt from catalog rows."""
    template = _read_prompt_template()
    payload = {
        "excluded_actions_free_text": excluded_actions_free_text,
        "actions": [_build_catalog_row(action) for action in actions],
    }
    return template.format(
        payload_json=json.dumps(payload, ensure_ascii=True, indent=2)
    )


def _build_catalog_row(action: Action) -> dict[str, object]:
    """Build compact action catalog row for LLM matching."""
    return {
        "action_id": action.action_id,
        "action_name": action.action_name,
        "description": action.description,
        "action_category": action.action_category,
        "action_subcategory": action.action_subcategory,
        "co_benefit_keys": sorted(action.co_benefits.keys()),
    }


def _warn_if_prompt_is_large(*, prompt: str, action_count: int) -> None:
    """Warn when the final free-text exclusion prompt is unusually large."""
    prompt_characters = len(prompt)
    if prompt_characters <= FREE_TEXT_EXCLUSION_PROMPT_WARNING_CHARS:
        return
    logger.warning(
        "Large free-text exclusion prompt detected actions=%s prompt_characters=%s threshold=%s",
        action_count,
        prompt_characters,
        FREE_TEXT_EXCLUSION_PROMPT_WARNING_CHARS,
    )


def _read_prompt_template() -> str:
    """Read the free-text exclusion prompt template."""
    return PROMPT_FILE_PATH.read_text(encoding="utf-8")


def _read_system_prompt_template() -> str:
    """Read the free-text exclusion system prompt template."""
    return SYSTEM_PROMPT_FILE_PATH.read_text(encoding="utf-8").strip()
