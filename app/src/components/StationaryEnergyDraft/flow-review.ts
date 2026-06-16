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
  StagedReviewSelection,
  SourceCandidate,
} from "@/components/StationaryEnergyDraft/types";
import {
  compareProposalsByGpcReference,
  compatibleSources,
  draftRowEmissionsLabel,
  findRecommendedSource,
  initialDecisionForProposal,
  proposalLabel,
  proposedValueLabel,
  shortSourceName,
  sourceGeographyLabel,
} from "@/components/StationaryEnergyDraft/utils";
import type { TFunction } from "i18next";

const REVIEW_FALLBACKS = {
  "review-option-leave-empty": "Leave empty",
  "review-option-set-notation": "Set a notation key later",
  "review-fallback-row-label": "Stationary Energy row",
  "review-option-alternative-source": "Alternative source",
} as const;

const REVIEW_READY_DRAFT_STATUSES = new Set(["ready", "reviewed"]);

function canReviewDraftStatus(status: string): boolean {
  return REVIEW_READY_DRAFT_STATUSES.has(status);
}

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

export function activeStagedSelectionByProposal(
  selections: StagedReviewSelection[] | undefined,
): Map<string, StagedReviewSelection> {
  const byProposal = new Map<string, StagedReviewSelection>();
  for (const selection of selections ?? []) {
    if (selection.status !== "active") {
      continue;
    }
    byProposal.set(selection.proposal_id, selection);
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
  const stagedSelections = activeStagedSelectionByProposal(
    draftState.staged_review_selections,
  );
  return Object.fromEntries(
    draftState.proposals.map((proposal) => {
      const staged = stagedSelections.get(proposal.proposal_id);
      if (staged) {
        return [
          proposal.proposal_id,
          {
            action: staged.action as DraftDecisionState["action"],
            selectedSourceId:
              staged.action === "override_source"
                ? (staged.selected_candidate_id ??
                  staged.selected_source_id ??
                  "")
                : (staged.selected_source_id ?? ""),
            manualValue: "",
            manualUnit: "",
            note: staged.rationale ?? "",
          },
        ];
      }

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
  const resolved = new Set(
    Array.from(
      latestDecisionByProposal(draftState?.review_decisions ?? []).keys(),
    ),
  );
  for (const proposalId of activeStagedSelectionByProposal(
    draftState?.staged_review_selections,
  ).keys()) {
    resolved.add(proposalId);
  }
  return resolved;
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
  if (!canReviewDraftStatus(params.draftState.status)) {
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

export function canSaveToInventory(params: {
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
  if (!canReviewDraftStatus(params.draftState.status)) {
    return false;
  }

  return buildInventorySaveReviewDecisionPayload({
    draftState: params.draftState,
    decisionState: params.decisionState,
    resolvedProposalIds: params.resolvedProposalIds,
  }).some(
    (decision) =>
      decision.action === "accept" ||
      decision.action === "override_source" ||
      decision.action === "override_manual",
  );
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
  if (!canReviewDraftStatus(params.draftState.status)) {
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

export function hasInventorySaveReviewChanges(params: {
  draftState: DraftStatusResponse | null;
  decisionState: Record<string, DraftDecisionState>;
  resolvedProposalIds: Set<string>;
}): boolean {
  if (!params.draftState) {
    return false;
  }
  const persistedDecisions = latestDecisionByProposal(
    params.draftState.review_decisions,
  );
  return buildInventorySaveReviewDecisionPayload({
    draftState: params.draftState,
    decisionState: params.decisionState,
    resolvedProposalIds: params.resolvedProposalIds,
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

function serializeReviewDecisionInput(params: {
  proposal: DraftProposal;
  decision: DraftDecisionState;
}) {
  return {
    proposal_id: params.proposal.proposal_id,
    action: params.decision.action,
    selected_source_id:
      params.decision.action === "override_source"
        ? params.decision.selectedSourceId || undefined
        : undefined,
    manual_value:
      params.decision.action === "override_manual" &&
      params.decision.manualValue
        ? Number(params.decision.manualValue)
        : undefined,
    manual_unit:
      params.decision.action === "override_manual" &&
      params.decision.manualUnit
        ? params.decision.manualUnit
        : undefined,
    note: params.decision.note || undefined,
  };
}

function persistedDecisionState(decision: ReviewDecision): DraftDecisionState {
  return {
    action: decision.action as DraftDecisionState["action"],
    selectedSourceId:
      decision.action === "override_source"
        ? (decision.selected_candidate_id ?? decision.selected_source_id ?? "")
        : (decision.selected_source_id ?? ""),
    manualValue:
      decision.manual_value == null ? "" : String(decision.manual_value),
    manualUnit: decision.manual_unit ?? "",
    note: decision.note ?? "",
  };
}

export function buildReviewDecisionPayload(params: {
  draftState: DraftStatusResponse;
  decisionState: Record<string, DraftDecisionState>;
}) {
  return params.draftState.proposals.map((proposal) => {
    const decision =
      params.decisionState[proposal.proposal_id] ??
      initialDecisionForProposal(proposal, params.draftState.source_candidates);
    return serializeReviewDecisionInput({ proposal, decision });
  });
}

export function buildInventorySaveReviewDecisionPayload(params: {
  draftState: DraftStatusResponse;
  decisionState: Record<string, DraftDecisionState>;
  resolvedProposalIds: Set<string>;
}) {
  const persistedDecisions = latestDecisionByProposal(
    params.draftState.review_decisions,
  );
  const reviewableProposalIds = new Set(
    reviewableDraftProposals(params.draftState).map(
      (proposal) => proposal.proposal_id,
    ),
  );

  return params.draftState.proposals.map((proposal) => {
    if (params.resolvedProposalIds.has(proposal.proposal_id)) {
      const decision =
        params.decisionState[proposal.proposal_id] ??
        initialDecisionForProposal(
          proposal,
          params.draftState.source_candidates,
        );
      return serializeReviewDecisionInput({ proposal, decision });
    }

    const persisted = persistedDecisions.get(proposal.proposal_id);
    if (persisted) {
      return serializeReviewDecisionInput({
        proposal,
        decision: persistedDecisionState(persisted),
      });
    }

    if (reviewableProposalIds.has(proposal.proposal_id)) {
      return {
        proposal_id: proposal.proposal_id,
        action: "leave_draft" as const,
        selected_source_id: undefined,
        manual_value: undefined,
        manual_unit: undefined,
        note: undefined,
      };
    }

    const decision =
      params.decisionState[proposal.proposal_id] ??
      initialDecisionForProposal(proposal, params.draftState.source_candidates);
    return serializeReviewDecisionInput({ proposal, decision });
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
  if (!draftState || !canReviewDraftStatus(draftState.status)) {
    return [];
  }
  return draftState.proposals
    .filter((proposal) =>
      decisionOptionsForProposal({
        proposal,
        candidates: draftState.source_candidates,
      }).some((option) => option.action !== "leave_draft"),
    )
    .sort(compareProposalsByGpcReference);
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
      shortLabel:
        shortSourceName(recommended) ?? sourceDisplayName(recommended),
      meta: sourceMetaLabel(recommended),
      value: proposedValueLabel(proposal, t),
      recommended: true,
      datasourceId:
        recommended.details_datasource_id ?? recommended.datasource_id,
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
      shortLabel: shortSourceName(candidate) ?? sourceDisplayName(candidate),
      meta: sourceMetaLabel(candidate),
      value: sourceCandidateValueLabel(candidate, t),
      recommended: false,
      datasourceId: candidate.details_datasource_id ?? candidate.datasource_id,
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
      shortLabel: translateReviewText(t, "review-option-leave-empty"),
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
  const firstRow = rows[0];
  const emissionsLabel = draftRowEmissionsLabel(firstRow);
  return (
    emissionsLabel ?? translateReviewText(t, "review-option-alternative-source")
  );
}

function translateReviewText(
  t: TFunction | undefined,
  key: keyof typeof REVIEW_FALLBACKS,
): string {
  return t?.(key) ?? REVIEW_FALLBACKS[key];
}
