import { describe, expect, it } from "@jest/globals";
import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";
import {
  buildInventorySaveReviewDecisionPayload,
  buildArtifactRows,
  buildDecisionReviewContext,
  buildInitialDecisionState,
  buildReviewDecisionPayload,
  buildSourcePreferenceOptions,
  canPersistDraftReview,
  canSaveDraft,
  canSaveToInventory,
  deriveDraftStage,
  hasDraftReviewChanges,
  hasInventorySaveReviewChanges,
  pendingDecisionReviewProposals,
  resolvedProposalIdsFromReview,
} from "@/components/StationaryEnergyDraft/flow";
import {
  buildFocusedDecisionStatePayload,
  buildStationaryEnergyChatRequest,
  resolveInventorySaveConfirmationRequest,
  resolveStationaryEnergyToolMessage,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";

function draftFixture(): DraftStatusResponse {
  return {
    draft_run_id: "draft-1",
    thread_id: "thread-1",
    status: "ready",
    workflow_step: "draft",
    source_candidates: [
      {
        candidate_id: "candidate-1",
        datasource_id: "source-1",
        name: "SEEG",
        dataset_name: "Grid dataset",
        dataset_year: 2023,
        geography_match: "city",
        applicability_status: "applicable",
        source_scope: {
          sector_reference_number: "I",
          subsector_reference_number: "I.1",
          scope_id: "1",
        },
        normalized_rows: [
          { emissions_value: "0.41", emissions_unit: "MtCO2e" },
        ],
      },
      {
        candidate_id: "candidate-2",
        datasource_id: "source-2",
        name: "ClimateTRACE",
        dataset_name: "Scope comparison dataset",
        dataset_year: 2023,
        geography_match: "city",
        applicability_status: "applicable",
        source_scope: {
          sector_reference_number: "I",
          subsector_reference_number: "I.1",
          scope_id: "1",
        },
        normalized_rows: [
          { emissions_value: "0.52", emissions_unit: "MtCO2e" },
        ],
      },
      {
        candidate_id: "candidate-3",
        datasource_id: "source-3",
        name: "Vulcan",
        dataset_name: "Building benchmark dataset",
        dataset_year: 2023,
        geography_match: "city",
        applicability_status: "applicable",
        source_scope: {
          sector_reference_number: "I",
          subsector_reference_number: "I.2",
          scope_id: "1",
        },
        normalized_rows: [
          { emissions_value: "0.31", emissions_unit: "MtCO2e" },
        ],
      },
    ],
    proposals: [
      {
        proposal_id: "proposal-ready",
        target_ref: {
          sector_reference_number: "I",
          subsector_reference_number: "I.2",
          subsector_name: "Commercial & institutional",
          scope_id: "1",
        },
        current_value: null,
        recommended_candidate_id: "candidate-3",
        recommended_datasource_id: "source-3",
        alternative_candidate_ids: [],
        proposed_value: { value: "0.31", unit: "MtCO2e" },
        rationale: "Single compatible source.",
        status: "ready",
      },
      {
        proposal_id: "proposal-conflict",
        target_ref: {
          sector_reference_number: "I",
          subsector_reference_number: "I.1",
          subsector_name: "Residential buildings",
          scope_id: "1",
        },
        current_value: null,
        recommended_candidate_id: "candidate-1",
        recommended_datasource_id: "source-1",
        alternative_candidate_ids: ["candidate-2"],
        proposed_value: { value: "0.41", unit: "MtCO2e" },
        rationale: "Two sources disagree.",
        status: "conflict",
      },
      {
        proposal_id: "proposal-gap",
        target_ref: {
          sector_reference_number: "I",
          subsector_reference_number: "I.8",
          subsector_name: "Fugitive oil and natural gas",
          scope_id: "1",
        },
        current_value: null,
        recommended_candidate_id: null,
        recommended_datasource_id: null,
        alternative_candidate_ids: [],
        proposed_value: null,
        rationale: "No matching source.",
        status: "gap",
      },
    ],
    review_decisions: [],
  };
}

describe("Stationary Energy draft flow", () => {
  it("resolves Stationary Energy tool messages from translation keys only", () => {
    const t = ((key: string, params?: Record<string, unknown>) =>
      `${key}:${JSON.stringify(params ?? {})}`) as Parameters<
      typeof resolveStationaryEnergyToolMessage
    >[0];
    const keyedTool = {
      message: "Raw CA display text",
      message_key: "tool-message-stage-success",
      message_params: { selected: 2, pending: 1 },
    };
    const fallbackTool = { message: "Raw CA display text" };

    expect(
      resolveStationaryEnergyToolMessage(
        t,
        keyedTool,
        "tool-message-generic-summary",
      ),
    ).toBe('tool-message-stage-success:{"selected":2,"pending":1}');

    expect(
      resolveStationaryEnergyToolMessage(
        t,
        fallbackTool,
        "tool-message-generic-summary",
      ),
    ).toBe("tool-message-generic-summary:{}");
  });

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

  it("maps proposals into artifact row states", () => {
    const rows = buildArtifactRows(draftFixture());

    expect(rows.find((row) => row.id === "proposal-ready")?.state).toBe("done");
    expect(rows.find((row) => row.id === "proposal-conflict")?.state).toBe(
      "warning",
    );
    expect(rows.find((row) => row.id === "proposal-gap")?.state).toBe("empty");
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

  it("derives source preference chips from real dataset names", () => {
    expect(
      buildSourcePreferenceOptions(draftFixture().source_candidates),
    ).toEqual([
      "Grid dataset",
      "Scope comparison dataset",
      "Building benchmark dataset",
    ]);
  });

  it("formats raw draft emissions from kg and hides misleading global metadata", () => {
    const draft = draftFixture();
    draft.source_candidates[0] = {
      ...draft.source_candidates[0],
      dataset_year: 2024,
      geography_match: "global",
      normalized_rows: [
        { emissions_value: "6821641830", emissions_unit: "tCO2e" },
      ],
    };
    draft.proposals[1] = {
      ...draft.proposals[1],
      recommended_candidate_id: "candidate-1",
      recommended_datasource_id: "source-1",
      proposed_value: {
        emissions_value: "6821641830",
        emissions_unit: "tCO2e",
      },
    };

    const rows = buildArtifactRows(draft);
    const context = buildDecisionReviewContext({
      draftState: draft,
      resolvedProposalIds: new Set(),
    });

    expect(rows.find((row) => row.id === "proposal-conflict")?.value).toBe(
      "6.82 Mt CO2e",
    );
    expect(rows.find((row) => row.id === "proposal-conflict")?.sourceName).toBe(
      "SEEG",
    );
    expect(rows.find((row) => row.id === "proposal-conflict")?.sourceMeta).toBe(
      "2024",
    );
    expect(context[1]).toEqual(
      expect.objectContaining({
        recommendedOption: expect.objectContaining({
          meta: "2024",
          value: "6.82 Mt CO2e",
        }),
      }),
    );
  });

  it("builds chat requests with draft review context and focused proposal", () => {
    const draft = draftFixture();
    const decisionReviewContext = buildDecisionReviewContext({
      draftState: draft,
      resolvedProposalIds: new Set(),
    });
    const decisionState = buildInitialDecisionState(draft);
    decisionState["proposal-conflict"] = {
      action: "override_source",
      selectedSourceId: "candidate-2",
      manualValue: "",
      manualUnit: "",
      note: "",
    };
    const focusedDecisionState = buildFocusedDecisionStatePayload({
      decisionReviewContext,
      decisionState,
      focusedProposalId: "proposal-conflict",
      resolvedProposalIds: new Set(["proposal-conflict"]),
    });
    const request = buildStationaryEnergyChatRequest({
      cityId: "city-1",
      content: "yes, I agree",
      confirmedBulkReviewChoices: [
        {
          proposal_id: "proposal-conflict",
          candidate_id: "candidate-2",
          action: "override_source",
        },
      ],
      confirmedRollbackReviewChoices: [
        {
          proposal_id: "proposal-ready",
        },
      ],
      decisionReviewContext,
      draftState: draft,
      focusedDecisionState,
      focusedProposalId: "proposal-conflict",
      inventoryId: "inventory-1",
      threadId: "thread-1",
    });

    expect(request).toEqual(
      expect.objectContaining({
        threadId: "thread-1",
        content: "yes, I agree",
        inventory_id: "inventory-1",
      }),
    );
    expect(request.context).toEqual(
      expect.objectContaining({
        stationary_energy_draft_run_id: "draft-1",
        stationary_energy_focused_proposal_id: "proposal-conflict",
        stationary_energy_focused_decision_state: {
          action: "override_source",
          selected_option: {
            id: "candidate-2",
            action: "override_source",
            label: "ClimateTRACE",
            short_label: "ClimateTRACE",
            selected_source_id: "source-2",
            recommended: false,
          },
        },
        stationary_energy_confirmed_bulk_review_choices: [
          {
            proposal_id: "proposal-conflict",
            candidate_id: "candidate-2",
            action: "override_source",
          },
        ],
        stationary_energy_confirmed_staged_review_rollback_choices: [
          {
            proposal_id: "proposal-ready",
          },
        ],
        stationary_energy_pending_decision_reviews: decisionReviewContext,
      }),
    );
    expect(request.options).toEqual(
      expect.objectContaining({
        stationary_energy_draft_run_id: "draft-1",
        stationary_energy_pending_decision_review_count:
          decisionReviewContext.length,
      }),
    );
  });

  it("does not send hidden default source choices as focused chat selections", () => {
    const draft = draftFixture();
    const decisionReviewContext = buildDecisionReviewContext({
      draftState: draft,
      resolvedProposalIds: new Set(),
    });
    const decisionState = buildInitialDecisionState(draft);
    const focusedDecisionState = buildFocusedDecisionStatePayload({
      decisionReviewContext,
      decisionState,
      focusedProposalId: "proposal-conflict",
      resolvedProposalIds: new Set(),
    });

    const request = buildStationaryEnergyChatRequest({
      cityId: "city-1",
      content: "save just that one",
      decisionReviewContext,
      draftState: draft,
      focusedDecisionState,
      focusedProposalId: "proposal-conflict",
      inventoryId: "inventory-1",
      threadId: "thread-1",
    });

    expect(focusedDecisionState).toBeUndefined();
    expect(
      (request.context as Record<string, unknown>)
        .stationary_energy_focused_decision_state,
    ).toBeUndefined();
  });

  it("blocks inventory confirmation cards when save is not currently allowed", () => {
    expect(
      resolveInventorySaveConfirmationRequest({
        canSaveToInventory: false,
        toolSuccess: true,
        toolMessage: "Please confirm before writing inventory data.",
        blockedMessage: "Inventory save is still blocked.",
      }),
    ).toEqual({
      message: "Inventory save is still blocked.",
      showConfirmation: false,
    });

    expect(
      resolveInventorySaveConfirmationRequest({
        canSaveToInventory: true,
        toolSuccess: false,
        toolMessage:
          "Inventory save is blocked until every source-backed proposal is staged.",
        blockedMessage: "Inventory save is still blocked.",
      }),
    ).toEqual({
      message:
        "Inventory save is blocked until every source-backed proposal is staged.",
      showConfirmation: false,
    });

    expect(
      resolveInventorySaveConfirmationRequest({
        canSaveToInventory: true,
        toolSuccess: true,
        toolMessage: "Please confirm before writing inventory data.",
        blockedMessage: "Inventory save is still blocked.",
      }),
    ).toEqual({
      message: "Please confirm before writing inventory data.",
      showConfirmation: true,
    });
  });
});
