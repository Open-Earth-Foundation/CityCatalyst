"""Choice-resolution helpers for Stationary Energy review staging."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.models.db.stationary_energy_draft import (
    StationaryEnergyDraftProposal,
    StationaryEnergyDraftRun,
    StationaryEnergyDraftSourceCandidate,
    StationaryEnergyReviewDecision,
    StationaryEnergyStagedReviewSelection,
)
from app.models.stationary_energy_drafts import ReviewDecisionInput
from app.services.stationary_energy.stationary_energy_draft_review import (
    ALLOWED_NOTATION_KEY_REASONS,
    latest_review_decisions,
    notation_target_id,
)
from app.services.stationary_energy.stationary_energy_review_models import (
    StationaryEnergyAgentReviewBlockedChoice,
    StationaryEnergyAgentReviewChoice,
    StationaryEnergyAgentReviewChoiceInput,
    StationaryEnergyNotationKeyChoiceInput,
    StationaryEnergyNotationKeyTarget,
)

SOURCE_BACKED_STATUSES = {
    "ready",
    "needs_review",
    "conflict",
    "gap",
    "accepted",
    "overridden",
}

ALLOWED_NOTATION_OPTIONS = [
    {
        "notation_key": notation_key,
        "unavailable_reason": unavailable_reason,
    }
    for notation_key, unavailable_reason in ALLOWED_NOTATION_KEY_REASONS.items()
]


def source_label(candidate: StationaryEnergyDraftSourceCandidate) -> str:
    """Return a concise display label for a source candidate."""
    return candidate.name or candidate.publisher_name or candidate.datasource_id


def target_label(proposal: StationaryEnergyDraftProposal) -> str:
    """Return a readable GPC target label for a draft proposal."""
    target = proposal.target_ref or {}
    parts = [
        target.get("subsector_name"),
        target.get("subcategory_name"),
        target.get("scope_name") or target.get("scope_id"),
    ]
    label = " / ".join(str(part) for part in parts if part)
    return label or "Stationary Energy row"


def details_datasource_id(
    candidate: StationaryEnergyDraftSourceCandidate,
) -> str:
    """Return the source id expected by existing review-save contracts."""
    source_data = candidate.source_data or {}
    value = source_data.get("details_datasource_id")
    if isinstance(value, str) and value.strip():
        return value
    return candidate.datasource_id


def is_source_backed(proposal: StationaryEnergyDraftProposal) -> bool:
    """Return whether a proposal requires an explicit source review choice."""
    return bool(proposal.recommended_candidate_id or proposal.alternative_candidate_ids)


def first_normalized_row(
    candidate: StationaryEnergyDraftSourceCandidate,
) -> dict[str, Any] | None:
    """Return the first normalized source row available for chat evidence."""
    for row in candidate.normalized_rows or []:
        if isinstance(row, dict):
            return row
    return None


def row_emissions_evidence(row: dict[str, Any]) -> dict[str, Any]:
    """Extract compact emissions evidence from one normalized source row."""
    # Prefer the precomputed total emissions value when the source row has one.
    value = row.get("emissions_value_100yr")
    unit = row.get("emissions_unit_100yr") or row.get("emissions_unit")
    if value is None or value == "":
        value = row.get("emissions_value")
        unit = row.get("emissions_unit")
    if value is not None and value != "":
        return {"emissions_value": value, "emissions_unit": unit}

    # Fall back to the first gas-level emissions value for sparse source rows.
    gases = row.get("gases")
    if not isinstance(gases, list):
        return {}
    for gas in gases:
        if not isinstance(gas, dict):
            continue
        gas_value = gas.get("emissions_value_100yr")
        gas_unit = gas.get("emissions_unit_100yr") or gas.get("emissions_unit")
        if gas_value is None or gas_value == "":
            gas_value = gas.get("emissions_value")
            gas_unit = gas.get("emissions_unit")
        if gas_value is not None and gas_value != "":
            return {
                "gas": gas.get("gas"),
                "emissions_value": gas_value,
                "emissions_unit": gas_unit,
            }
    return {}


def candidate_option_evidence(
    candidate: StationaryEnergyDraftSourceCandidate,
) -> dict[str, Any]:
    """Build compact read-only evidence for source comparison in chat."""
    evidence: dict[str, Any] = {
        "dataset_year": candidate.dataset_year,
        "geography_match": candidate.geography_match,
        "confidence_notes": candidate.confidence_notes,
    }

    # Add the first normalized row so chat can compare high-signal values.
    row = first_normalized_row(candidate)
    if row is not None:
        if "value" in row:
            evidence["activity_value"] = row.get("value")
        if "unit" in row:
            evidence["activity_unit"] = row.get("unit")
        evidence.update(row_emissions_evidence(row))

    # Preserve notation metadata because some gap rows depend on it.
    source_data = candidate.source_data or {}
    notation_key = source_data.get("notation_key")
    if notation_key:
        evidence["notation_key"] = notation_key
        evidence["notation_key_name"] = source_data.get("notation_key_name")

    return {key: value for key, value in evidence.items() if value is not None}


class StationaryEnergyReviewChoiceResolver:
    """Resolve, serialize, and validate review choices for one draft snapshot."""

    def __init__(self, draft_run: StationaryEnergyDraftRun) -> None:
        """Bind the resolver to one persisted draft snapshot."""
        self.draft_run = draft_run

    def available_options(
        self,
        proposal: StationaryEnergyDraftProposal,
    ) -> list[dict[str, Any]]:
        """Build UI/model options for one proposal."""
        # Offer every applicable candidate in a stable recommended-first list.
        options = []
        for candidate in self._available_candidates(proposal):
            is_recommended = candidate.candidate_id == proposal.recommended_candidate_id
            options.append(
                {
                    "candidate_id": str(candidate.candidate_id),
                    "datasource_id": candidate.datasource_id,
                    "selected_source_id": details_datasource_id(candidate),
                    "source_label": source_label(candidate),
                    "recommended": is_recommended,
                    "action": "accept" if is_recommended else "override_source",
                    "evidence": candidate_option_evidence(candidate),
                }
            )

        # Preserve the explicit leave-empty option for unresolved rows.
        options.append(
            {
                "candidate_id": None,
                "datasource_id": None,
                "selected_source_id": None,
                "source_label": "Leave empty",
                "recommended": False,
                "action": "leave_draft",
            }
        )
        return options

    def resolve_choice(
        self,
        *,
        proposal: StationaryEnergyDraftProposal,
        choice: StationaryEnergyAgentReviewChoiceInput,
    ) -> StationaryEnergyAgentReviewChoice | StationaryEnergyAgentReviewBlockedChoice:
        """Resolve a requested choice to a valid candidate or blocker."""
        if choice.action == "leave_draft":
            return StationaryEnergyAgentReviewChoice(
                proposal_id=proposal.proposal_id,
                action="leave_draft",
                selected_source_id=None,
                selected_candidate_id=None,
                source_label="Leave empty",
                target_label=target_label(proposal),
                rationale=choice.rationale,
            )

        # Resolve the requested source using the same ids the tools can emit.
        candidate = None
        if choice.candidate_id:
            candidate = self._candidate_by_id().get(str(choice.candidate_id))
        elif choice.selected_source_id:
            candidate = self._candidate_by_source_id().get(choice.selected_source_id)
        elif proposal.recommended_candidate_id:
            candidate = self._candidate_by_id().get(str(proposal.recommended_candidate_id))

        # Reject sources that are not applicable for this exact proposal.
        available = self._available_candidates(proposal)
        available_ids = {candidate.candidate_id for candidate in available}
        if candidate is None or candidate.candidate_id not in available_ids:
            return StationaryEnergyAgentReviewBlockedChoice(
                proposal_id=proposal.proposal_id,
                reason="Selected source is not an available option for this proposal",
                available_options=self.available_options(proposal),
            )

        action = (
            "accept"
            if candidate.candidate_id == proposal.recommended_candidate_id
            else "override_source"
        )
        if choice.action in {"accept", "override_source"} and choice.action != action:
            return StationaryEnergyAgentReviewBlockedChoice(
                proposal_id=proposal.proposal_id,
                reason=f"Action {choice.action} is not valid for the selected source",
                available_options=self.available_options(proposal),
            )

        return StationaryEnergyAgentReviewChoice(
            proposal_id=proposal.proposal_id,
            action=action,
            selected_source_id=details_datasource_id(candidate),
            selected_candidate_id=candidate.candidate_id,
            source_label=source_label(candidate),
            target_label=target_label(proposal),
            rationale=choice.rationale,
        )

    def resolve_choice_inputs(
        self,
        choices: list[StationaryEnergyAgentReviewChoiceInput],
    ) -> tuple[
        list[StationaryEnergyAgentReviewChoice],
        list[StationaryEnergyAgentReviewBlockedChoice],
    ]:
        """Validate a batch of requested choices against the draft snapshot."""
        selected_choices: list[StationaryEnergyAgentReviewChoice] = []
        blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice] = []
        proposal_by_id = {
            proposal.proposal_id: proposal for proposal in self.draft_run.proposals
        }

        # Resolve each requested choice independently so partial success is possible.
        for choice in choices:
            proposal = proposal_by_id.get(choice.proposal_id)
            if proposal is None:
                blocked_choices.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        proposal_id=choice.proposal_id,
                        reason="proposal_id does not belong to this draft",
                    )
                )
                continue

            resolved = self.resolve_choice(proposal=proposal, choice=choice)
            if isinstance(resolved, StationaryEnergyAgentReviewBlockedChoice):
                blocked_choices.append(resolved)
                continue

            selected_choices.append(
                resolved.model_copy(
                    update={"rationale": choice.rationale or resolved.rationale}
                )
            )

        return selected_choices, blocked_choices

    def notation_targets(
        self,
        targets_payload: dict[str, Any],
        *,
        staged: list[StationaryEnergyStagedReviewSelection],
    ) -> list[StationaryEnergyNotationKeyTarget]:
        """Merge CC notation-key targets with CA staged/saved review state."""
        raw_targets = targets_payload.get("targets")
        if not isinstance(raw_targets, list):
            raw_targets = []

        proposal_by_target_id = self._proposal_by_notation_target_id()
        staged_by_proposal = {
            selection.proposal_id: selection
            for selection in staged
            if selection.status == "active" and selection.action == "set_notation_key"
        }
        latest_decisions = latest_review_decisions(self.draft_run.review_decisions)
        targets: list[StationaryEnergyNotationKeyTarget] = []
        for raw_target in raw_targets:
            if not isinstance(raw_target, dict):
                continue
            raw_target_id = raw_target.get("target_id")
            if not isinstance(raw_target_id, str) or not raw_target_id:
                continue
            proposal = proposal_by_target_id.get(raw_target_id)
            raw_target_ref = raw_target.get("target_ref")
            target_ref = (
                raw_target_ref
                if isinstance(raw_target_ref, dict)
                else (proposal.target_ref if proposal else {})
            )
            raw_target_label = raw_target.get("target_label")
            label = (
                raw_target_label
                if isinstance(raw_target_label, str) and raw_target_label
                else (target_label(proposal) if proposal else raw_target_id)
            )
            current_notation_key = raw_target.get("current_notation_key")
            staged_choice = (
                self.choice_from_staged(staged_by_proposal[proposal.proposal_id])
                if proposal and proposal.proposal_id in staged_by_proposal
                else None
            )
            latest = latest_decisions.get(proposal.proposal_id) if proposal else None
            saved_choice = (
                self.choice_from_saved_decision(latest)
                if latest and latest.action == "set_notation_key"
                else None
            )
            targets.append(
                StationaryEnergyNotationKeyTarget(
                    proposal_id=proposal.proposal_id if proposal else None,
                    target_id=raw_target_id,
                    target_label=label,
                    target_ref=target_ref,
                    current_notation_key=(
                        current_notation_key
                        if isinstance(current_notation_key, dict)
                        else None
                    ),
                    staged_choice=staged_choice,
                    saved_choice=saved_choice,
                )
            )
        return targets

    def resolve_notation_choice_inputs(
        self,
        choices: list[StationaryEnergyNotationKeyChoiceInput],
        targets_payload: dict[str, Any],
    ) -> tuple[
        list[StationaryEnergyAgentReviewChoice],
        list[StationaryEnergyAgentReviewBlockedChoice],
    ]:
        """Validate notation-key choices against CC-eligible targets."""
        selected_choices: list[StationaryEnergyAgentReviewChoice] = []
        blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice] = []
        targets = self.notation_targets(targets_payload, staged=[])
        target_by_id = {target.target_id: target for target in targets}
        target_by_proposal = {
            target.proposal_id: target for target in targets if target.proposal_id
        }

        for choice in choices:
            target = None
            if choice.target_id:
                target = target_by_id.get(choice.target_id)
            if target is None and choice.proposal_id:
                target = target_by_proposal.get(choice.proposal_id)

            if target is None:
                blocked_choices.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        proposal_id=choice.proposal_id,
                        target_id=choice.target_id,
                        reason=(
                            "Target is not eligible for Stationary Energy notation keys"
                        ),
                        available_options=ALLOWED_NOTATION_OPTIONS,
                    )
                )
                continue
            if target.proposal_id is None:
                blocked_choices.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        target_id=target.target_id,
                        reason="Notation target does not exist in this draft snapshot",
                        available_options=ALLOWED_NOTATION_OPTIONS,
                    )
                )
                continue

            notation_key = choice.notation_key.upper()
            unavailable_reason = ALLOWED_NOTATION_KEY_REASONS.get(notation_key)
            if unavailable_reason is None:
                blocked_choices.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        proposal_id=target.proposal_id,
                        target_id=target.target_id,
                        reason="notation_key must be one of NO, NE, IE, or C",
                        available_options=ALLOWED_NOTATION_OPTIONS,
                    )
                )
                continue
            if not choice.unavailable_explanation.strip():
                blocked_choices.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        proposal_id=target.proposal_id,
                        target_id=target.target_id,
                        reason=(
                            "unavailable_explanation is required for notation keys"
                        ),
                        available_options=ALLOWED_NOTATION_OPTIONS,
                    )
                )
                continue

            selected_choices.append(
                StationaryEnergyAgentReviewChoice(
                    proposal_id=target.proposal_id,
                    target_id=target.target_id,
                    action="set_notation_key",
                    selected_source_id=None,
                    selected_candidate_id=None,
                    source_label=f"Notation key {notation_key}",
                    source_short_label=notation_key,
                    source_meta=unavailable_reason,
                    value=choice.unavailable_explanation,
                    target_label=target.target_label,
                    notation_key=notation_key,
                    unavailable_reason=unavailable_reason,
                    unavailable_explanation=choice.unavailable_explanation.strip(),
                    rationale=choice.rationale,
                )
            )

        return selected_choices, blocked_choices

    def target_active_staged_notation_selections(
        self,
        *,
        staged: list[StationaryEnergyStagedReviewSelection],
        proposal_ids: list[UUID] | None,
    ) -> tuple[
        list[StationaryEnergyStagedReviewSelection],
        list[StationaryEnergyAgentReviewBlockedChoice],
    ]:
        """Return requested active staged notation selections plus blockers."""
        notation_staged = [
            selection
            for selection in staged
            if selection.status == "active" and selection.action == "set_notation_key"
        ]
        if proposal_ids is None:
            return notation_staged, []

        proposal_by_id = self._proposal_by_id()
        staged_by_proposal = {
            selection.proposal_id: selection for selection in notation_staged
        }
        targeted: list[StationaryEnergyStagedReviewSelection] = []
        blocked: list[StationaryEnergyAgentReviewBlockedChoice] = []
        seen: set[UUID] = set()
        for proposal_id in proposal_ids:
            if proposal_id in seen:
                continue
            seen.add(proposal_id)
            if proposal_id not in proposal_by_id:
                blocked.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        proposal_id=proposal_id,
                        reason="proposal_id does not belong to this draft",
                    )
                )
                continue
            selection = staged_by_proposal.get(proposal_id)
            if selection is None:
                blocked.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        proposal_id=proposal_id,
                        reason=(
                            "No active staged notation-key choice exists for "
                            "this proposal"
                        ),
                    )
                )
                continue
            targeted.append(selection)
        return targeted, blocked

    def target_active_staged_selections(
        self,
        *,
        staged: list[StationaryEnergyStagedReviewSelection],
        proposal_ids: list[UUID] | None,
    ) -> tuple[
        list[StationaryEnergyStagedReviewSelection],
        list[StationaryEnergyAgentReviewBlockedChoice],
    ]:
        """Return requested active staged selections plus row-level blockers."""
        proposal_by_id = {
            proposal.proposal_id: proposal for proposal in self.draft_run.proposals
        }
        staged_by_proposal = {
            selection.proposal_id: selection
            for selection in staged
            if selection.status == "active" and selection.action != "set_notation_key"
        }
        blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice] = []

        # Default to every active staged selection when the caller did not scope rows.
        if proposal_ids is None:
            return list(staged_by_proposal.values()), blocked_choices

        # Validate the requested proposal ids and keep only active staged rows.
        targeted: list[StationaryEnergyStagedReviewSelection] = []
        seen: set[UUID] = set()
        for proposal_id in proposal_ids:
            if proposal_id in seen:
                continue
            seen.add(proposal_id)

            proposal = proposal_by_id.get(proposal_id)
            if proposal is None:
                blocked_choices.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        proposal_id=proposal_id,
                        reason="proposal_id does not belong to this draft",
                    )
                )
                continue

            selection = staged_by_proposal.get(proposal_id)
            if selection is None:
                blocked_choices.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        proposal_id=proposal_id,
                        reason="No active staged source selection exists for this proposal",
                        available_options=self.available_options(proposal),
                    )
                )
                continue
            targeted.append(selection)

        return targeted, blocked_choices

    def change_choice_for_staged_selection(
        self,
        selection: StationaryEnergyStagedReviewSelection,
    ) -> StationaryEnergyAgentReviewChoice | StationaryEnergyAgentReviewBlockedChoice:
        """Choose a different available source, or empty if none exists."""
        proposal = self._proposal_for_selection(selection)
        current_source_ids = {
            source_id
            for source_id in [
                selection.selected_source_id,
                (
                    str(selection.selected_candidate_id)
                    if selection.selected_candidate_id
                    else None
                ),
            ]
            if source_id
        }

        # Prefer a different applicable source before falling back to leave_draft.
        for candidate in self._available_candidates(proposal):
            candidate_ids = {
                str(candidate.candidate_id),
                candidate.datasource_id,
                details_datasource_id(candidate),
            }
            if candidate_ids.isdisjoint(current_source_ids):
                return self.resolve_choice(
                    proposal=proposal,
                    choice=StationaryEnergyAgentReviewChoiceInput(
                        proposal_id=proposal.proposal_id,
                        candidate_id=candidate.candidate_id,
                        rationale="User asked to change the staged source.",
                    ),
                )

        # If there is no alternative source, offer an explicit empty-state change.
        if selection.action != "leave_draft":
            return self.resolve_choice(
                proposal=proposal,
                choice=StationaryEnergyAgentReviewChoiceInput(
                    proposal_id=proposal.proposal_id,
                    action="leave_draft",
                    rationale=(
                        "User asked to change the staged source; no different "
                        "source is available for this row."
                    ),
                ),
            )

        return StationaryEnergyAgentReviewBlockedChoice(
            proposal_id=proposal.proposal_id,
            reason="No different source or empty-state change is available for this staged selection",
            available_options=self.available_options(proposal),
        )

    def rollback_choice_from_staged(
        self,
        selection: StationaryEnergyStagedReviewSelection,
    ) -> StationaryEnergyAgentReviewChoice:
        """Serialize an active staged selection as a rollback choice."""
        staged_choice = self.choice_from_staged(selection)
        choice_kind = (
            "notation-key" if selection.action == "set_notation_key" else "source"
        )
        return staged_choice.model_copy(
            update={
                "action": "rollback_staged",
                "rationale": f"This staged {choice_kind} choice will be removed.",
            }
        )

    def pending_required_proposals(
        self,
        *,
        staged: list[StationaryEnergyStagedReviewSelection],
        extra_resolved_ids: set[UUID] | None = None,
    ) -> list[StationaryEnergyDraftProposal]:
        """Return source-backed proposals still requiring user review."""
        staged_ids = {
            selection.proposal_id
            for selection in staged
            if selection.status == "active"
        }
        extra_resolved_ids = extra_resolved_ids or set()
        final_decision_ids = set(latest_review_decisions(self.draft_run.review_decisions))
        pending: list[StationaryEnergyDraftProposal] = []

        # Keep only unresolved source-backed rows that still need explicit review.
        for proposal in self.draft_run.proposals:
            if not is_source_backed(proposal):
                continue
            if (
                proposal.proposal_id in staged_ids
                or proposal.proposal_id in final_decision_ids
                or proposal.proposal_id in extra_resolved_ids
            ):
                continue
            if proposal.status not in SOURCE_BACKED_STATUSES:
                continue
            pending.append(proposal)
        return pending

    def build_complete_decision_inputs(
        self,
        *,
        staged: list[StationaryEnergyStagedReviewSelection],
    ) -> tuple[
        list[ReviewDecisionInput],
        list[StationaryEnergyAgentReviewBlockedChoice],
    ]:
        """Convert staged selections into complete draft review decisions."""
        staged_by_proposal = {
            selection.proposal_id: selection
            for selection in staged
            if selection.status == "active"
        }
        latest_decisions = latest_review_decisions(self.draft_run.review_decisions)
        decisions: list[ReviewDecisionInput] = []
        blockers: list[StationaryEnergyAgentReviewBlockedChoice] = []

        # Walk every proposal so the saved draft remains complete and explicit.
        for proposal in self.draft_run.proposals:
            staged_selection = staged_by_proposal.get(proposal.proposal_id)
            if staged_selection is not None:
                decisions.append(self.review_input_from_staged(staged_selection))
                continue

            latest = latest_decisions.get(proposal.proposal_id)
            if latest is not None:
                decisions.append(
                    ReviewDecisionInput(
                        proposal_id=proposal.proposal_id,
                        action=latest.action,  # type: ignore[arg-type]
                        selected_source_id=(
                            str(latest.selected_candidate_id)
                            if latest.action == "override_source"
                            and latest.selected_candidate_id
                            else latest.selected_source_id
                        ),
                        manual_value=latest.manual_value,
                        manual_unit=latest.manual_unit,
                        notation_key=latest.notation_key,
                        unavailable_reason=latest.unavailable_reason,
                        unavailable_explanation=latest.unavailable_explanation,
                        note=latest.note,
                    )
                )
                continue

            if is_source_backed(proposal):
                blockers.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        proposal_id=proposal.proposal_id,
                        reason="Source-backed proposal has no staged review selection",
                        available_options=self.available_options(proposal),
                    )
                )
                continue

            decisions.append(
                ReviewDecisionInput(
                    proposal_id=proposal.proposal_id,
                    action="leave_draft",
                )
            )

        return decisions, blockers

    @staticmethod
    def review_input_from_staged(
        selection: StationaryEnergyStagedReviewSelection,
    ) -> ReviewDecisionInput:
        """Convert one staged selection into the review API input shape."""
        return ReviewDecisionInput(
            proposal_id=selection.proposal_id,
            action=selection.action,  # type: ignore[arg-type]
            selected_source_id=(
                str(selection.selected_candidate_id)
                if selection.action == "override_source"
                and selection.selected_candidate_id
                else selection.selected_source_id
            ),
            notation_key=selection.notation_key,
            unavailable_reason=selection.unavailable_reason,
            unavailable_explanation=selection.unavailable_explanation,
            note=selection.rationale,
        )

    def choice_from_staged(
        self,
        selection: StationaryEnergyStagedReviewSelection,
    ) -> StationaryEnergyAgentReviewChoice:
        """Serialize a staged selection into a tool choice summary."""
        # Join the staged row back to its proposal for user-facing row labels.
        proposal = self._proposal_for_selection(selection)
        if selection.action == "set_notation_key":
            target_id = notation_target_id(proposal.target_ref or {})
            notation_key = selection.notation_key
            return StationaryEnergyAgentReviewChoice(
                proposal_id=selection.proposal_id,
                target_id=target_id,
                action="set_notation_key",
                selected_source_id=None,
                selected_candidate_id=None,
                source_label=(
                    f"Notation key {notation_key}" if notation_key else None
                ),
                source_short_label=notation_key,
                source_meta=selection.unavailable_reason,
                value=selection.unavailable_explanation,
                target_label=target_label(proposal),
                notation_key=notation_key,
                unavailable_reason=selection.unavailable_reason,
                unavailable_explanation=selection.unavailable_explanation,
                rationale=selection.rationale,
            )

        # Resolve the source label only when the staged row points at a candidate.
        candidate = (
            self._candidate_by_id().get(str(selection.selected_candidate_id))
            if selection.selected_candidate_id
            else None
        )
        return StationaryEnergyAgentReviewChoice(
            proposal_id=selection.proposal_id,
            action=selection.action,  # type: ignore[arg-type]
            selected_source_id=selection.selected_source_id,
            selected_candidate_id=selection.selected_candidate_id,
            source_label=source_label(candidate) if candidate else "Leave empty",
            target_label=target_label(proposal),
            rationale=selection.rationale,
        )

    def choice_from_review_input(
        self,
        decision: ReviewDecisionInput,
    ) -> StationaryEnergyAgentReviewChoice:
        """Serialize a review input into a tool choice summary."""
        proposal = self._proposal_by_id()[decision.proposal_id]

        # Resolve the candidate through the same accept/override rules used for saves.
        if decision.action == "set_notation_key":
            target_id = notation_target_id(proposal.target_ref or {})
            notation_key = decision.notation_key
            return StationaryEnergyAgentReviewChoice(
                proposal_id=decision.proposal_id,
                target_id=target_id,
                action="set_notation_key",
                selected_source_id=None,
                selected_candidate_id=None,
                source_label=(
                    f"Notation key {notation_key}" if notation_key else None
                ),
                source_short_label=notation_key,
                source_meta=decision.unavailable_reason,
                value=decision.unavailable_explanation,
                target_label=target_label(proposal),
                notation_key=notation_key,
                unavailable_reason=decision.unavailable_reason,
                unavailable_explanation=decision.unavailable_explanation,
                rationale=decision.note,
            )
        if decision.action == "accept":
            candidate = self._candidate_by_id().get(str(proposal.recommended_candidate_id))
        elif decision.action == "override_source" and decision.selected_source_id:
            candidate = self._candidate_by_id().get(
                decision.selected_source_id
            ) or self._candidate_by_source_id().get(decision.selected_source_id)
        else:
            candidate = None

        return StationaryEnergyAgentReviewChoice(
            proposal_id=decision.proposal_id,
            action=decision.action,  # type: ignore[arg-type]
            selected_source_id=(
                details_datasource_id(candidate)
                if candidate is not None
                else decision.selected_source_id
            ),
            selected_candidate_id=candidate.candidate_id if candidate else None,
            source_label=source_label(candidate) if candidate else None,
            target_label=target_label(proposal),
            rationale=decision.note,
        )

    def choice_from_saved_decision(
        self,
        decision: StationaryEnergyReviewDecision,
    ) -> StationaryEnergyAgentReviewChoice:
        """Serialize a saved review decision into a tool choice summary."""
        return self.choice_from_review_input(
            ReviewDecisionInput(
                proposal_id=decision.proposal_id,
                action=decision.action,  # type: ignore[arg-type]
                selected_source_id=decision.selected_source_id,
                manual_value=decision.manual_value,
                manual_unit=decision.manual_unit,
                notation_key=decision.notation_key,
                unavailable_reason=decision.unavailable_reason,
                unavailable_explanation=decision.unavailable_explanation,
                note=decision.note,
            )
        )

    def _candidate_by_id(
        self,
    ) -> dict[str, StationaryEnergyDraftSourceCandidate]:
        """Index source candidates by candidate id."""
        return {
            str(candidate.candidate_id): candidate
            for candidate in self.draft_run.source_candidates
        }

    def _candidate_by_source_id(
        self,
    ) -> dict[str, StationaryEnergyDraftSourceCandidate]:
        """Index source candidates by public datasource identifiers."""
        by_source: dict[str, StationaryEnergyDraftSourceCandidate] = {}
        for candidate in self.draft_run.source_candidates:
            by_source[candidate.datasource_id] = candidate
            by_source[details_datasource_id(candidate)] = candidate
        return by_source

    def _proposal_by_id(self) -> dict[UUID, StationaryEnergyDraftProposal]:
        """Index proposals by proposal id."""
        return {
            proposal.proposal_id: proposal for proposal in self.draft_run.proposals
        }

    def _proposal_by_notation_target_id(
        self,
    ) -> dict[str, StationaryEnergyDraftProposal]:
        """Index proposals by the CC notation-key target id in their target_ref."""
        by_target: dict[str, StationaryEnergyDraftProposal] = {}
        for proposal in self.draft_run.proposals:
            target_id = notation_target_id(proposal.target_ref or {})
            if target_id:
                by_target[target_id] = proposal
        return by_target

    def _available_candidates(
        self,
        proposal: StationaryEnergyDraftProposal,
    ) -> list[StationaryEnergyDraftSourceCandidate]:
        """Return applicable candidates the user can choose for a proposal."""
        candidate_by_id = self._candidate_by_id()
        ids = [
            (
                str(proposal.recommended_candidate_id)
                if proposal.recommended_candidate_id
                else None
            ),
            *[
                str(candidate_id)
                for candidate_id in proposal.alternative_candidate_ids or []
            ],
        ]
        candidates: list[StationaryEnergyDraftSourceCandidate] = []
        seen: set[str] = set()
        for candidate_id in ids:
            if not candidate_id or candidate_id in seen:
                continue
            candidate = candidate_by_id.get(candidate_id)
            if candidate is None or candidate.applicability_status != "applicable":
                continue
            seen.add(candidate_id)
            candidates.append(candidate)
        return candidates

    def _proposal_for_selection(
        self,
        selection: StationaryEnergyStagedReviewSelection,
    ) -> StationaryEnergyDraftProposal:
        """Load the draft proposal referenced by a staged selection."""
        return self._proposal_by_id()[selection.proposal_id]
