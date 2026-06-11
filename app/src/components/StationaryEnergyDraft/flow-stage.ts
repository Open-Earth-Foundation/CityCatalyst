import type { DraftCounts, DraftStage } from "@/components/StationaryEnergyDraft/flow-types";
import { REVIEWED_STATUSES } from "@/components/StationaryEnergyDraft/flow-types";
import { latestDecisionByProposal, reviewableDraftProposals } from "@/components/StationaryEnergyDraft/flow-review";
import type { DraftProposal, DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";

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

export function proposalNeedsUserResolution(proposal: DraftProposal): boolean {
  return ["conflict", "needs_review"].includes(proposal.status);
}
