import type {
  DecisionOption,
  DecisionReviewContext,
} from "@/components/StationaryEnergyDraft/flow-types";
import { TERMINAL_DRAFT_STATUSES } from "@/components/StationaryEnergyDraft/flow-types";
import type {
  DraftDecisionState,
  DraftProposal,
  DraftStatusResponse,
  ReviewDecision,
  SourceCandidate,
} from "@/components/StationaryEnergyDraft/types";
import {
  compatibleSources,
  formatDraftEmissionsLabel,
  findRecommendedSource,
  initialDecisionForProposal,
  proposalLabel,
  proposedValueLabel,
  sourceGeographyLabel,
} from "@/components/StationaryEnergyDraft/utils";
import type { TFunction } from "i18next";

const REVIEW_FALLBACKS = {
  "review-option-leave-empty": "Leave empty",
  "review-option-set-notation": "Set a notation key later",
  "review-fallback-row-label": "Stationary Energy row",
  "review-option-alternative-source": "Alternative source",
} as const;

export function latestDecisionByProposal(
  decisions: ReviewDecision[],
): Map<string, ReviewDecision> {
  const byProposal = new Map<string, ReviewDecision>();
  for (const decision of decisions) {
    const current = byProposal.get(decision.proposal_id);
    if (
      !current ||
      Number(decision.decision_version ?? 0) >
        Number(current.decision_version ?? 0)
    ) {
      byProposal.set(decision.proposal_id, decision);
    }
  }
  return byProposal;
}

export function proposalNeedsUserResolution(proposal: DraftProposal): boolean {
  return ["conflict", "needs_review"].includes(proposal.status);
}

export function buildInitialDecisionState(
  draftState: DraftStatusResponse | null,
): Record<string, DraftDecisionState> {
  if (!draftState) {
    return {};
  }

  const latestDecisions = latestDecisionByProposal(draftState.review_decisions);
  return Object.fromEntries(
    draftState.proposals.map((proposal) => {
      const existing = latestDecisions.get(proposal.proposal_id);
      if (existing) {
        return [
          proposal.proposal_id,
          {
            action: existing.action as DraftDecisionState["action"],
            selectedSourceId: existing.selected_source_id ?? "",
            manualValue:
              existing.manual_value == null
                ? ""
                : String(existing.manual_value),
            manualUnit: existing.manual_unit ?? "",
            note: existing.note ?? "",
          },
        ];
      }

      return [
        proposal.proposal_id,
        initialDecisionForProposal(proposal, draftState.source_candidates),
      ];
    }),
  );
}

export function resolvedProposalIdsFromReview(
  draftState: DraftStatusResponse | null,
): Set<string> {
  return new Set(
    Array.from(
      latestDecisionByProposal(draftState?.review_decisions ?? []).keys(),
    ),
  );
}

export function unresolvedBlockingProposalIds(params: {
  draftState: DraftStatusResponse | null;
  resolvedProposalIds: Set<string>;
}): string[] {
  return pendingDecisionReviewProposals(params).map(
    (proposal) => proposal.proposal_id,
  );
}

export function pendingDecisionReviewProposals(params: {
  draftState: DraftStatusResponse | null;
  resolvedProposalIds: Set<string>;
}): DraftProposal[] {
  return reviewableDraftProposals(params.draftState).filter(
    (proposal) => !params.resolvedProposalIds.has(proposal.proposal_id),
  );
}

export function buildDecisionReviewContext(params: {
  draftState: DraftStatusResponse | null;
  resolvedProposalIds: Set<string>;
  t?: TFunction;
}): DecisionReviewContext[] {
  return pendingDecisionReviewProposals(params)
    .map((proposal) =>
      decisionReviewContextForProposal(
        proposal,
        params.draftState?.source_candidates ?? [],
        params.t,
      ),
    )
    .filter((context): context is DecisionReviewContext => context != null);
}

export function canSaveDraft(params: {
  draftState: DraftStatusResponse | null;
  resolvedProposalIds: Set<string>;
  decisionState: Record<string, DraftDecisionState>;
  isSaving?: boolean;
}): boolean {
  if (!params.draftState || params.isSaving) {
    return false;
  }
  if (TERMINAL_DRAFT_STATUSES.has(params.draftState.status)) {
    return false;
  }
  if (pendingDecisionReviewProposals(params).length > 0) {
    return false;
  }
  return params.draftState.proposals.some((proposal) => {
    const decision =
      params.decisionState[proposal.proposal_id] ??
      initialDecisionForProposal(
        proposal,
        params.draftState!.source_candidates,
      );
    return (
      decision.action === "accept" ||
      decision.action === "override_source" ||
      decision.action === "override_manual"
    );
  });
}

export function canPersistDraftReview(params: {
  draftState: DraftStatusResponse | null;
  resolvedProposalIds: Set<string>;
  decisionState: Record<string, DraftDecisionState>;
  isSaving?: boolean;
}): boolean {
  if (!params.draftState || params.isSaving) {
    return false;
  }
  if (TERMINAL_DRAFT_STATUSES.has(params.draftState.status)) {
    return false;
  }
  const reviewableProposals = reviewableDraftProposals(params.draftState);
  if (
    reviewableProposals.length === 0 ||
    pendingDecisionReviewProposals(params).length > 0
  ) {
    return false;
  }
  return hasDraftReviewChanges({
    draftState: params.draftState,
    decisionState: params.decisionState,
  });
}

export function hasDraftReviewChanges(params: {
  draftState: DraftStatusResponse | null;
  decisionState: Record<string, DraftDecisionState>;
}): boolean {
  if (!params.draftState) {
    return false;
  }
  const reviewableProposals = reviewableDraftProposals(params.draftState);
  if (reviewableProposals.length === 0) {
    return false;
  }
  const persistedDecisions = latestDecisionByProposal(
    params.draftState.review_decisions,
  );
  return buildReviewDecisionPayload({
    draftState: params.draftState,
    decisionState: params.decisionState,
  }).some((decision) => {
    const persisted = persistedDecisions.get(decision.proposal_id);
    if (!persisted) {
      return true;
    }
    const sourceSelectionChanged =
      decision.action === "override_source"
        ? (persisted.selected_source_id ?? "") !==
          (decision.selected_source_id ?? "")
        : false;
    const manualOverrideChanged =
      decision.action === "override_manual"
        ? String(persisted.manual_value ?? "") !==
            String(decision.manual_value ?? "") ||
          (persisted.manual_unit ?? "") !== (decision.manual_unit ?? "")
        : false;
    return (
      persisted.action !== decision.action ||
      sourceSelectionChanged ||
      manualOverrideChanged ||
      (persisted.note ?? "") !== (decision.note ?? "")
    );
  });
}

export function buildReviewDecisionPayload(params: {
  draftState: DraftStatusResponse;
  decisionState: Record<string, DraftDecisionState>;
}) {
  return params.draftState.proposals.map((proposal) => {
    const decision =
      params.decisionState[proposal.proposal_id] ??
      initialDecisionForProposal(proposal, params.draftState.source_candidates);
    return {
      proposal_id: proposal.proposal_id,
      action: decision.action,
      selected_source_id:
        decision.action === "override_source"
          ? decision.selectedSourceId || undefined
          : undefined,
      manual_value:
        decision.action === "override_manual" && decision.manualValue
          ? Number(decision.manualValue)
          : undefined,
      manual_unit:
        decision.action === "override_manual" && decision.manualUnit
          ? decision.manualUnit
          : undefined,
      note: decision.note || undefined,
    };
  });
}

export function decisionOptionsForProposal(params: {
  proposal: DraftProposal;
  candidates: SourceCandidate[];
}): DecisionOption[] {
  const { realOptions, leaveDraftOption } = buildDecisionOptionGroups(
    params.proposal,
    params.candidates,
  );
  if (realOptions.length === 0) {
    return [];
  }
  return [...realOptions, leaveDraftOption];
}

export function buildSourcePreferenceOptions(
  candidates: SourceCandidate[],
): string[] {
  return Array.from(
    new Set(
      candidates
        .filter((candidate) => candidate.applicability_status === "applicable")
        .map(
          (candidate) =>
            candidate.dataset_name?.trim() ||
            candidate.name?.trim() ||
            candidate.publisher_name?.trim() ||
            candidate.datasource_id,
        )
        .filter((candidateName): candidateName is string =>
          Boolean(candidateName),
        ),
    ),
  );
}

export function reviewableDraftProposals(
  draftState: DraftStatusResponse | null,
): DraftProposal[] {
  if (!draftState) {
    return [];
  }
  return draftState.proposals.filter((proposal) =>
    decisionOptionsForProposal({
      proposal,
      candidates: draftState.source_candidates,
    }).some((option) => option.action !== "leave_draft"),
  );
}

function buildDecisionOptionGroups(
  proposal: DraftProposal,
  candidates: SourceCandidate[],
  t?: TFunction,
): {
  realOptions: DecisionOption[];
  recommendedOption: DecisionOption | null;
  alternativeOptions: DecisionOption[];
  leaveDraftOption: DecisionOption;
} {
  const matchingCandidates = compatibleSources(proposal, candidates);
  const recommended = findRecommendedSource(proposal, candidates);
  const realOptions: DecisionOption[] = [];
  let recommendedOption: DecisionOption | null = null;

  if (recommended) {
    recommendedOption = {
      id: recommended.candidate_id ?? recommended.datasource_id,
      action: "accept",
      label: sourceDisplayName(recommended),
      meta: sourceMetaLabel(recommended),
      value: proposedValueLabel(proposal),
      recommended: true,
    };
    realOptions.push(recommendedOption);
  }

  const alternativeOptions: DecisionOption[] = [];
  for (const candidate of matchingCandidates) {
    const id = candidate.candidate_id ?? candidate.datasource_id;
    if (
      !id ||
      id === (recommended?.candidate_id ?? recommended?.datasource_id)
    ) {
      continue;
    }
    const option = {
      id,
      action: "override_source" as const,
      label: sourceDisplayName(candidate),
      meta: sourceMetaLabel(candidate),
      value: sourceCandidateValueLabel(candidate, t),
      recommended: false,
    };
    alternativeOptions.push(option);
    realOptions.push(option);
  }

  return {
    realOptions,
    recommendedOption,
    alternativeOptions,
    leaveDraftOption: {
      id: "leave_draft",
      action: "leave_draft",
      label: translateReviewText(t, "review-option-leave-empty"),
      meta: translateReviewText(t, "review-option-set-notation"),
      value: translateReviewText(t, "review-option-set-notation"),
      recommended: false,
    },
  };
}

function decisionReviewContextForProposal(
  proposal: DraftProposal,
  candidates: SourceCandidate[],
  t?: TFunction,
): DecisionReviewContext | null {
  const {
    realOptions,
    recommendedOption,
    alternativeOptions,
    leaveDraftOption,
  } = buildDecisionOptionGroups(proposal, candidates, t);
  if (realOptions.length === 0) {
    return null;
  }

  const baseContext = {
    proposal_id: proposal.proposal_id,
    proposal,
    label:
      proposalLabel(proposal) ||
      translateReviewText(t, "review-fallback-row-label"),
    status: proposal.status,
    recommendedOption,
    alternativeOptions,
    leaveDraftOption,
  };

  if (realOptions.length === 1) {
    return {
      ...baseContext,
      kind: "single_source",
      recommendedOption: realOptions[0],
      alternativeOptions: [],
    };
  }

  return {
    ...baseContext,
    kind: "multi_source",
  };
}

function sourceDisplayName(candidate: SourceCandidate): string {
  return candidate.name ?? candidate.publisher_name ?? candidate.datasource_id;
}

function sourceMetaLabel(candidate: SourceCandidate): string {
  return [
    candidate.dataset_year ? String(candidate.dataset_year) : null,
    sourceGeographyLabel(candidate.geography_match),
  ]
    .filter(Boolean)
    .join(" / ");
}

function sourceCandidateValueLabel(
  candidate: SourceCandidate,
  t?: TFunction,
): string {
  const rows = candidate.normalized_rows ?? [];
  const firstRow = rows[0] as Record<string, unknown> | undefined;
  if (!firstRow) {
    return translateReviewText(t, "review-option-alternative-source");
  }
  const value =
    firstRow.emissions_value ??
    firstRow.co2eq ??
    firstRow.value ??
    firstRow.activity_value ??
    firstRow["activity-value"];
  const unit =
    firstRow.emissions_unit ??
    firstRow.unit ??
    firstRow.activity_unit ??
    firstRow["activity-unit"];
  return (
    formatDraftEmissionsLabel(value, unit) ??
    ([value, unit].filter(Boolean).join(" ") ||
      translateReviewText(t, "review-option-alternative-source"))
  );
}

function translateReviewText(
  t: TFunction | undefined,
  key: keyof typeof REVIEW_FALLBACKS,
): string {
  return t?.(key) ?? REVIEW_FALLBACKS[key];
}
