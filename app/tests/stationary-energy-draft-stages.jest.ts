import { expect, it } from "@jest/globals";
import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";
import {
  buildDecisionReviewContext,
  buildInitialDecisionState,
  canPersistDraftReview,
  canSaveDraft,
  deriveDraftStage,
  pendingDecisionReviewProposals,
} from "@/components/StationaryEnergyDraft/flow";
import { draftFixture } from "./fixtures/stationary-energy-draft";

describe("stationary energy draft stages", () => {
  it("derives stages from draft and explicit review progress", () => {
    expect(deriveDraftStage({ draftState: null, loadingAction: null })).toBe(
      "start",
    );
    expect(deriveDraftStage({ draftState: null, loadingAction: "start" })).toBe(
      "drafting",
    );
    expect(
      deriveDraftStage({ draftState: draftFixture(), loadingAction: null }),
    ).toBe("decision");
    expect(
      deriveDraftStage({
        draftState: draftFixture(),
        resolvedProposalIds: new Set(["proposal-ready", "proposal-conflict"]),
        loadingAction: null,
      }),
    ).toBe("review");
    expect(
      deriveDraftStage({
        draftState: { ...draftFixture(), status: "reviewed" },
        loadingAction: null,
      }),
    ).toBe("review");
  });

  it("blocks save until every source-backed proposal is explicitly resolved", () => {
    const draft = draftFixture();
    const decisionState = buildInitialDecisionState(draft);

    expect(
      canSaveDraft({
        draftState: draft,
        resolvedProposalIds: new Set(),
        decisionState,
      }),
    ).toBe(false);
    expect(
      canSaveDraft({
        draftState: draft,
        resolvedProposalIds: new Set(["proposal-ready"]),
        decisionState,
      }),
    ).toBe(false);
    expect(
      canSaveDraft({
        draftState: draft,
        resolvedProposalIds: new Set(["proposal-ready", "proposal-conflict"]),
        decisionState,
      }),
    ).toBe(true);
  });

  it("blocks save actions while async generation is still running", () => {
    const draft: DraftStatusResponse = {
      ...draftFixture(),
      status: "generating",
    };
    const decisionState = buildInitialDecisionState(draft);
    const resolvedProposalIds = new Set([
      "proposal-ready",
      "proposal-conflict",
    ]);

    expect(
      canSaveDraft({
        draftState: draft,
        resolvedProposalIds,
        decisionState,
      }),
    ).toBe(false);
    expect(
      canPersistDraftReview({
        draftState: draft,
        resolvedProposalIds,
        decisionState,
      }),
    ).toBe(false);
    expect(
      pendingDecisionReviewProposals({
        draftState: draft,
        resolvedProposalIds,
      }),
    ).toEqual([]);
    expect(
      buildDecisionReviewContext({
        draftState: draft,
        resolvedProposalIds,
      }),
    ).toEqual([]);
  });

  it("hides save when nothing committable remains after review", () => {
    const draft = draftFixture();
    const decisionState = buildInitialDecisionState(draft);
    decisionState["proposal-ready"] = {
      action: "leave_draft",
      selectedSourceId: "",
      manualValue: "",
      manualUnit: "",
      note: "",
    };
    decisionState["proposal-conflict"] = {
      action: "leave_draft",
      selectedSourceId: "",
      manualValue: "",
      manualUnit: "",
      note: "",
    };

    expect(
      canSaveDraft({
        draftState: draft,
        resolvedProposalIds: new Set(["proposal-ready", "proposal-conflict"]),
        decisionState,
      }),
    ).toBe(false);
  });
});
