import type {
  DraftDecisionState,
  DraftProposal,
  DraftStatusResponse,
  ReviewDecision,
  SourceCandidate,
} from "./types";
import {
  compatibleSources,
  currentValueLabel,
  formatDraftEmissionsLabel,
  findRecommendedSource,
  initialDecisionForProposal,
  proposalLabel,
  proposedValueLabel,
  sourceGeographyLabel,
  sourceLabel,
} from "./utils";

export type DraftStage = "start" | "drafting" | "decision" | "review";
export type ArtifactRowState =
  | "queued"
  | "active"
  | "done"
  | "manual"
  | "warning"
  | "empty";

export type ArtifactRow = {
  id: string;
  label: string;
  scope: string;
  state: ArtifactRowState;
  value: string | null;
  source: string | null;
  status: string;
};

export type DraftCounts = {
  total: number;
  ready: number;
  conflict: number;
  gap: number;
  needsReview: number;
  accepted: number;
  committed: number;
};

export type DecisionOption = {
  id: string;
  action: DraftDecisionState["action"];
  label: string;
  meta: string;
  value: string;
  recommended: boolean;
};

type BaseDecisionReviewContext = {
  proposal_id: string;
  proposal: DraftProposal;
  label: string;
  status: string;
  recommendedOption: DecisionOption | null;
  alternativeOptions: DecisionOption[];
  leaveDraftOption: DecisionOption;
};

export type SingleSourceDecisionReviewContext = BaseDecisionReviewContext & {
  kind: "single_source";
  recommendedOption: DecisionOption;
};

export type MultiSourceDecisionReviewContext = BaseDecisionReviewContext & {
  kind: "multi_source";
};

export type DecisionReviewContext =
  | SingleSourceDecisionReviewContext
  | MultiSourceDecisionReviewContext;

export const REVIEWED_STATUSES = new Set([
  "reviewed",
  "saved",
  "partially_saved",
  "no_changes",
]);
const TERMINAL_DRAFT_STATUSES = new Set([
  "saved",
  "partially_saved",
  "no_changes",
  "failed",
]);

const START_ROWS: ArtifactRow[] = [
  ["I.1 Residential buildings", "Scope 1 / 2"],
  ["I.2 Commercial & institutional", "Scope 1 / 2"],
  ["I.3 Manufacturing & construction", "Scope 1 / 2"],
  ["I.4 Energy industries", "Scope 1 / 2"],
  ["I.5 Agriculture, forestry & fishing", "Scope 1"],
  ["I.6 Non-specified sources", "Scope 1"],
  ["I.7 Fugitive - mining & coal", "Scope 1"],
  ["I.8 Fugitive - oil & natural gas", "Scope 1"],
].map(([label, scope], index) => ({
  id: `placeholder-${index}`,
  label,
  scope,
  state: "queued",
  value: null,
  source: null,
  status: "queued",
}));

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

export function deriveDraftStage(params: {
  draftState: DraftStatusResponse | null;
  resolvedProposalIds?: Set<string>;
  loadingAction?: string | null;
  preferredStage?: DraftStage;
}): DraftStage {
  if (params.loadingAction === "start") {
    return "drafting";
  }
  if (!params.draftState) {
    return "start";
  }
  if (params.draftState.status === "failed") {
    return "start";
  }
  if (
    ["resolving_scope", "loading_context", "generating"].includes(
      params.draftState.status,
    )
  ) {
    return "drafting";
  }
  if (
    params.preferredStage === "review" ||
    REVIEWED_STATUSES.has(params.draftState.status)
  ) {
    return "review";
  }
  if (
    reviewableDraftProposals(params.draftState).some(
      (proposal) => !params.resolvedProposalIds?.has(proposal.proposal_id),
    )
  ) {
    return "decision";
  }
  return "review";
}

export function countDraftProposals(
  draftState: DraftStatusResponse | null,
): DraftCounts {
  const proposals = draftState?.proposals ?? [];
  const decisions = latestDecisionByProposal(
    draftState?.review_decisions ?? [],
  );
  return {
    total: proposals.length,
    ready: proposals.filter((proposal) => proposal.status === "ready").length,
    conflict: proposals.filter((proposal) => proposal.status === "conflict")
      .length,
    gap: proposals.filter((proposal) => proposal.status === "gap").length,
    needsReview: proposals.filter(
      (proposal) => proposal.status === "needs_review",
    ).length,
    accepted: proposals.filter((proposal) =>
      ["accepted", "overridden"].includes(proposal.status),
    ).length,
    committed: Array.from(decisions.values()).filter(
      (decision) => decision.commit_status === "committed",
    ).length,
  };
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
}): DecisionReviewContext[] {
  return pendingDecisionReviewProposals(params)
    .map((proposal) =>
      decisionReviewContextForProposal(
        proposal,
        params.draftState?.source_candidates ?? [],
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
  const reviewableProposals = reviewableDraftProposals(params.draftState);
  if (
    reviewableProposals.length === 0 ||
    pendingDecisionReviewProposals(params).length > 0
  ) {
    return false;
  }
  return reviewableProposals.some((proposal) => {
    const decision =
      params.decisionState[proposal.proposal_id] ??
      initialDecisionForProposal(
        proposal,
        params.draftState!.source_candidates,
      );
    return (
      decision.action === "accept" || decision.action === "override_source"
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

export function buildArtifactRows(
  draftState: DraftStatusResponse | null,
): ArtifactRow[] {
  if (!draftState) {
    return START_ROWS;
  }
  if (draftState.status === "failed" && draftState.proposals.length === 0) {
    return START_ROWS;
  }

  return draftState.proposals.map((proposal) => {
    const recommendedSource = findRecommendedSource(
      proposal,
      draftState.source_candidates,
    );
    return {
      id: proposal.proposal_id,
      label: proposalLabel(proposal) || "Stationary Energy row",
      scope: rowScopeLabel(proposal),
      state: artifactStateForProposal(proposal),
      value: proposedValueLabel(proposal),
      source: sourceLabel(recommendedSource),
      status: artifactStatusLabel(proposal),
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

function buildDecisionOptionGroups(
  proposal: DraftProposal,
  candidates: SourceCandidate[],
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
      action: "accept" as const,
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
      value: sourceCandidateValueLabel(candidate),
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
      action: "leave_draft" as const,
      label: "Leave empty",
      meta: "Set a notation key later",
      value: "Set a notation key later",
      recommended: false,
    },
  };
}

function decisionReviewContextForProposal(
  proposal: DraftProposal,
  candidates: SourceCandidate[],
): DecisionReviewContext | null {
  const {
    realOptions,
    recommendedOption,
    alternativeOptions,
    leaveDraftOption,
  } = buildDecisionOptionGroups(proposal, candidates);
  if (realOptions.length === 0) {
    return null;
  }

  const baseContext = {
    proposal_id: proposal.proposal_id,
    proposal,
    label: proposalLabel(proposal) || "Stationary Energy row",
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

function reviewableDraftProposals(
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

function artifactStateForProposal(proposal: DraftProposal): ArtifactRowState {
  if (proposal.status === "conflict" || proposal.status === "needs_review") {
    return "warning";
  }
  if (proposal.status === "gap" || proposal.status === "left_draft") {
    return "empty";
  }
  if (proposal.status === "draft") {
    return "queued";
  }
  if (proposal.proposed_value || proposal.recommended_candidate_id) {
    return "done";
  }
  if (proposal.current_value) {
    return "manual";
  }
  return "empty";
}

function artifactStatusLabel(proposal: DraftProposal): string {
  if (proposal.status === "conflict" || proposal.status === "needs_review") {
    return "needs your choice";
  }
  if (proposal.status === "gap") {
    return "no source";
  }
  if (proposal.status === "left_draft") {
    return "left as draft";
  }
  if (proposal.status === "draft") {
    return "queued";
  }
  if (proposal.proposed_value || proposal.recommended_candidate_id) {
    return "drafted";
  }
  return currentValueLabel(proposal);
}

function rowScopeLabel(proposal: DraftProposal): string {
  return [
    proposal.target_ref.scope_name ?? proposal.target_ref.scope_id,
    proposal.target_ref.subcategory_reference_number,
  ]
    .filter(Boolean)
    .join(" / ");
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

function sourceCandidateValueLabel(candidate: SourceCandidate): string {
  const rows = candidate.normalized_rows ?? [];
  const firstRow = rows[0] as Record<string, unknown> | undefined;
  if (!firstRow) {
    return "Alternative source";
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
    ([value, unit].filter(Boolean).join(" ") || "Alternative source")
  );
}
