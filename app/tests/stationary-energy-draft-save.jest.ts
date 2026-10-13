import { expect, it } from "@jest/globals";
import {
  buildInventorySaveReviewDecisionPayload,
  buildInitialDecisionState,
  canPersistDraftReview,
  canSaveDraft,
  canSaveToInventory,
  hasDraftReviewChanges,
  hasInventorySaveReviewChanges,
} from "@/components/StationaryEnergyDraft/flow";
import { draftFixture } from "./fixtures/stationary-energy-draft";

describe("stationary energy draft save", () => {
  it("allows partial inventory save before every source-backed row is resolved", () => {
    const draft = draftFixture();
    const decisionState = buildInitialDecisionState(draft);

    expect(
      canSaveToInventory({
        draftState: draft,
        resolvedProposalIds: new Set(["proposal-ready"]),
        decisionState,
      }),
    ).toBe(true);

    expect(
      buildInventorySaveReviewDecisionPayload({
        draftState: draft,
        decisionState,
        resolvedProposalIds: new Set(["proposal-ready"]),
      }),
    ).toEqual([
      {
        proposal_id: "proposal-ready",
        action: "accept",
        selected_source_id: undefined,
        manual_value: undefined,
        manual_unit: undefined,
        note: undefined,
      },
      {
        proposal_id: "proposal-conflict",
        action: "leave_draft",
      },
      {
        proposal_id: "proposal-gap",
        action: "leave_draft",
        selected_source_id: undefined,
        manual_value: undefined,
        manual_unit: undefined,
        note: undefined,
      },
    ]);
  });

  it("allows inventory save when a staged notation key is the only committable decision", () => {
    const draft = draftFixture();
    draft.staged_review_selections = [
      {
        selection_id: "selection-notation",
        draft_run_id: "draft-1",
        proposal_id: "proposal-gap",
        user_id: "user-1",
        action: "set_notation_key",
        notation_key: "NO",
        unavailable_reason: "no-occurrance",
        unavailable_explanation: "No activity occurs in scope.",
        status: "active",
      },
    ];
    const decisionState = buildInitialDecisionState(draft);

    expect(
      canSaveToInventory({
        draftState: draft,
        resolvedProposalIds: new Set(["proposal-gap"]),
        decisionState,
      }),
    ).toBe(true);

    expect(
      buildInventorySaveReviewDecisionPayload({
        draftState: draft,
        decisionState,
        resolvedProposalIds: new Set(["proposal-gap"]),
      }).find((decision) => decision.proposal_id === "proposal-gap"),
    ).toEqual({
      proposal_id: "proposal-gap",
      action: "set_notation_key",
      selected_source_id: undefined,
      manual_value: undefined,
      manual_unit: undefined,
      notation_key: "NO",
      unavailable_reason: "no-occurrance",
      unavailable_explanation: "No activity occurs in scope.",
      note: undefined,
    });
  });

  it("preserves persisted review decisions for unresolved rows during partial inventory save", () => {
    const draft = draftFixture();
    draft.status = "reviewed";
    draft.review_decisions = [
      {
        proposal_id: "proposal-ready",
        action: "accept",
        selected_source_id: "source-3",
        commit_status: "pending_cc_commit",
        decision_version: 1,
      },
      {
        proposal_id: "proposal-conflict",
        action: "accept",
        selected_source_id: "source-1",
        commit_status: "pending_cc_commit",
        decision_version: 1,
      },
      {
        proposal_id: "proposal-gap",
        action: "leave_draft",
        commit_status: "not_applicable",
        decision_version: 1,
      },
    ];

    const decisionState = buildInitialDecisionState(draft);

    expect(
      hasInventorySaveReviewChanges({
        draftState: draft,
        decisionState,
        resolvedProposalIds: new Set(["proposal-ready"]),
      }),
    ).toBe(false);

    expect(
      buildInventorySaveReviewDecisionPayload({
        draftState: draft,
        decisionState,
        resolvedProposalIds: new Set(["proposal-ready"]),
      }).find((decision) => decision.proposal_id === "proposal-conflict"),
    ).toEqual({
      proposal_id: "proposal-conflict",
      action: "accept",
      selected_source_id: undefined,
      manual_value: undefined,
      manual_unit: undefined,
      note: undefined,
    });
  });

  it("allows save when a manual override is the only committable decision", () => {
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
    decisionState["proposal-gap"] = {
      action: "override_manual",
      selectedSourceId: "",
      manualValue: "12.5",
      manualUnit: "tCO2e",
      note: "Manual reviewer correction",
    };

    expect(
      canSaveDraft({
        draftState: draft,
        resolvedProposalIds: new Set(["proposal-ready", "proposal-conflict"]),
        decisionState,
      }),
    ).toBe(true);
  });

  it("allows saving a reviewed draft after the user changes a persisted choice", () => {
    const draft = draftFixture();
    draft.status = "reviewed";
    draft.review_decisions = [
      {
        proposal_id: "proposal-ready",
        action: "accept",
        selected_source_id: "source-3",
        commit_status: "pending_cc_commit",
        decision_version: 1,
      },
      {
        proposal_id: "proposal-conflict",
        action: "accept",
        selected_source_id: "source-1",
        commit_status: "pending_cc_commit",
        decision_version: 1,
      },
      {
        proposal_id: "proposal-gap",
        action: "leave_draft",
        commit_status: "not_applicable",
        decision_version: 1,
      },
    ];

    const decisionState = buildInitialDecisionState(draft);
    decisionState["proposal-conflict"] = {
      action: "override_source",
      selectedSourceId: "candidate-2",
      manualValue: "",
      manualUnit: "",
      note: "Use the alternative dataset",
    };

    expect(
      hasDraftReviewChanges({
        draftState: draft,
        decisionState,
      }),
    ).toBe(true);
    expect(
      canPersistDraftReview({
        draftState: draft,
        resolvedProposalIds: new Set(["proposal-ready", "proposal-conflict"]),
        decisionState,
      }),
    ).toBe(true);
    expect(
      canSaveDraft({
        draftState: draft,
        resolvedProposalIds: new Set(["proposal-ready", "proposal-conflict"]),
        decisionState,
      }),
    ).toBe(true);
  });

  it("hides draft save when the persisted review already matches the staged choices", () => {
    const draft = draftFixture();
    draft.status = "reviewed";
    draft.review_decisions = [
      {
        proposal_id: "proposal-ready",
        action: "accept",
        selected_source_id: "source-3",
        commit_status: "pending_cc_commit",
        decision_version: 1,
      },
      {
        proposal_id: "proposal-conflict",
        action: "accept",
        selected_source_id: "source-1",
        commit_status: "pending_cc_commit",
        decision_version: 1,
      },
      {
        proposal_id: "proposal-gap",
        action: "leave_draft",
        commit_status: "not_applicable",
        decision_version: 1,
      },
    ];

    const decisionState = buildInitialDecisionState(draft);

    expect(
      hasDraftReviewChanges({
        draftState: draft,
        decisionState,
      }),
    ).toBe(false);
    expect(
      canPersistDraftReview({
        draftState: draft,
        resolvedProposalIds: new Set(["proposal-ready", "proposal-conflict"]),
        decisionState,
      }),
    ).toBe(false);
  });

  it("uses the current staged decisions for inventory save even after a draft was reviewed", () => {
    const draft = draftFixture();
    draft.status = "reviewed";
    draft.review_decisions = [
      {
        proposal_id: "proposal-ready",
        action: "accept",
        selected_source_id: "source-3",
        commit_status: "pending_cc_commit",
        decision_version: 1,
      },
      {
        proposal_id: "proposal-conflict",
        action: "accept",
        selected_source_id: "source-1",
        commit_status: "pending_cc_commit",
        decision_version: 1,
      },
      {
        proposal_id: "proposal-gap",
        action: "leave_draft",
        commit_status: "not_applicable",
        decision_version: 1,
      },
    ];

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
