import type { ArtifactRow, ArtifactRowState } from "@/components/StationaryEnergyDraft/flow-types";
import { START_ROWS } from "@/components/StationaryEnergyDraft/flow-types";
import type { DraftProposal, DraftStatusResponse, SourceCandidate } from "@/components/StationaryEnergyDraft/types";
import {
  currentValueLabel,
  findRecommendedSource,
  proposalLabel,
  proposedValueLabel,
  sourceLabel,
} from "@/components/StationaryEnergyDraft/utils";

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
