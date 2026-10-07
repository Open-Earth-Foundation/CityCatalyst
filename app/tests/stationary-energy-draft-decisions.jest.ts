import { expect, it } from "@jest/globals";
import {
  buildDecisionReviewContext,
  buildInitialDecisionState,
  buildReviewDecisionPayload,
  pendingDecisionReviewProposals,
  resolvedProposalIdsFromReview,
} from "@/components/StationaryEnergyDraft/flow";
import { draftFixture } from "./fixtures/stationary-energy-draft";

describe("stationary energy draft decisions", () => {
  it("builds complete review decisions with gaps left draft", () => {
    const draft = draftFixture();
    const decisionState = buildInitialDecisionState(draft);
    decisionState["proposal-conflict"] = {
      action: "override_source",
      selectedSourceId: "candidate-2",
      manualValue: "",
      manualUnit: "",
      note: "",
    };

    const decisions = buildReviewDecisionPayload({
      draftState: draft,
      decisionState,
    });

    expect(decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proposal_id: "proposal-ready",
          action: "accept",
        }),
        expect.objectContaining({
          proposal_id: "proposal-conflict",
          action: "override_source",
          selected_source_id: "candidate-2",
        }),
        expect.objectContaining({
          proposal_id: "proposal-gap",
          action: "leave_draft",
        }),
      ]),
    );
  });

  it("uses persisted review decisions as resolved proposal ids", () => {
    const draft = draftFixture();
    draft.review_decisions = [
      {
        proposal_id: "proposal-conflict",
        action: "accept",
        commit_status: "pending_cc_commit",
        decision_version: 1,
      },
    ];

    expect(resolvedProposalIdsFromReview(draft)).toContain("proposal-conflict");
  });

  it("uses active agent-staged selections as resolved proposal ids", () => {
    const draft = draftFixture();
    draft.staged_review_selections = [
      {
        selection_id: "selection-1",
        draft_run_id: "draft-1",
        proposal_id: "proposal-conflict",
        user_id: "user-1",
        action: "override_source",
        selected_source_id: "source-2",
        selected_candidate_id: "candidate-2",
        rationale: "Agent selected the alternative source.",
        status: "active",
      },
    ];

    const decisionState = buildInitialDecisionState(draft);

    expect(resolvedProposalIdsFromReview(draft)).toContain("proposal-conflict");
    expect(decisionState["proposal-conflict"]).toEqual(
      expect.objectContaining({
        action: "override_source",
        selectedSourceId: "candidate-2",
        note: "Agent selected the alternative source.",
      }),
    );
  });

  it("classifies single-source and multi-source widgets and skips gaps", () => {
    const draft = draftFixture();
    draft.source_candidates[1].details_datasource_id = "source-2-real";
    const pending = pendingDecisionReviewProposals({
      draftState: draft,
      resolvedProposalIds: new Set(),
    });
    const context = buildDecisionReviewContext({
      draftState: draft,
      resolvedProposalIds: new Set(),
    });

    expect(pending.map((proposal) => proposal.proposal_id)).toEqual([
      "proposal-ready",
      "proposal-conflict",
    ]);
    expect(context).toEqual([
      expect.objectContaining({
        kind: "single_source",
        proposal_id: "proposal-ready",
        label: "Commercial & institutional / 1",
        recommendedOption: expect.objectContaining({
          action: "accept",
          label: "Vulcan",
          recommended: true,
        }),
        leaveDraftOption: expect.objectContaining({
          action: "leave_draft",
          label: "Leave empty",
        }),
      }),
      expect.objectContaining({
        kind: "multi_source",
        proposal_id: "proposal-conflict",
        label: "Residential buildings / 1",
        recommendedOption: expect.objectContaining({
          action: "accept",
          label: "SEEG",
          recommended: true,
        }),
        alternativeOptions: expect.arrayContaining([
          expect.objectContaining({
            action: "override_source",
            datasourceId: "source-2-real",
            label: "ClimateTRACE",
          }),
        ]),
      }),
    ]);
  });
});
