"use client";
import { useState } from "react";
import type { EditProposal } from "@/util/concept-note-edit-types";
import type { InlineReviewDecision } from "./inline-review";
import type { EditController } from "./document-review";
const empty: Record<string, InlineReviewDecision> = {};

/** Keep per-change choices separate from workspace fetching and navigation. */
export function useInlineReviewDecisions(
  proposal: EditProposal | undefined,
  edits: EditController,
  navigateEdit: (chapterId: string, changeId?: string) => void,
) {
  const [reviewDecisionProposalId, setReviewDecisionProposalId] = useState<
    string | null
  >(null);
  const [reviewDecisions, setReviewDecisions] = useState<
    Record<string, InlineReviewDecision>
  >({});
  async function decideInlineChange(
    proposal: EditProposal,
    changeIds: string[],
    decision: InlineReviewDecision,
  ): Promise<void> {
    if (edits.busy || proposal.status !== "proposed") return;
    const proposalIds = new Set(
      proposal.changes.map((change) => change.change_id),
    );
    const decidedIds = changeIds.filter((id) => proposalIds.has(id));
    if (!decidedIds.length) return;

    const current =
      reviewDecisionProposalId === proposal.proposal_id ? reviewDecisions : {};
    const next = { ...current };
    for (const id of decidedIds) next[id] = decision;
    setReviewDecisionProposalId(proposal.proposal_id);
    setReviewDecisions(next);

    const lastDecidedIndex = Math.max(
      ...decidedIds.map((id) =>
        proposal.changes.findIndex((change) => change.change_id === id),
      ),
    );
    const followingChanges = [
      ...proposal.changes.slice(lastDecidedIndex + 1),
      ...proposal.changes.slice(0, lastDecidedIndex + 1),
    ];
    const unresolved = followingChanges.find(
      (change) => next[change.change_id] === undefined,
    );
    if (unresolved) {
      navigateEdit(unresolved.chapter_id, unresolved.change_id);
      return;
    }

    const acceptedIds = proposal.changes
      .filter((change) => next[change.change_id] === "accepted")
      .map((change) => change.change_id);
    if (acceptedIds.length === 0) await edits.reject(proposal);
    else
      await edits.apply(
        proposal,
        acceptedIds.length === proposal.changes.length
          ? undefined
          : acceptedIds,
      );
    setReviewDecisionProposalId(null);
    setReviewDecisions({});
  }
  return {
    decisions:
      proposal?.proposal_id === reviewDecisionProposalId
        ? reviewDecisions
        : empty,
    decide: decideInlineChange,
  };
}
