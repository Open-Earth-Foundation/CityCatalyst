import { expect, it } from "@jest/globals";
import {
  buildDecisionReviewContext,
  buildInitialDecisionState,
} from "@/components/StationaryEnergyDraft/flow";
import {
  buildFocusedDecisionStatePayload,
  buildStationaryEnergyChatRequest,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";
import { draftFixture } from "./fixtures/stationary-energy-draft";

describe("stationary energy chat requests", () => {
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

  it("builds pre-draft chat requests with Stationary Energy surface context", () => {
    const request = buildStationaryEnergyChatRequest({
      cityId: "city-1",
      content: "draft the empty rows",
      decisionReviewContext: [],
      draftState: null,
      inventoryId: "inventory-1",
      threadId: "thread-1",
    });

    expect(request).toEqual(
      expect.objectContaining({
        threadId: "thread-1",
        content: "draft the empty rows",
        inventory_id: "inventory-1",
        context: {
          city_id: "city-1",
          inventory_id: "inventory-1",
          stationary_energy_interaction_mode: "free_text",
        },
        options: {
          stationary_energy_interaction_mode: "free_text",
          stationary_energy_ui_surfaces: ["chat_text"],
        },
      }),
    );
    expect(request.context).not.toHaveProperty(
      "stationary_energy_draft_run_id",
    );
  });

  it("names the selected inventory so the pre-run agent never asks for it", () => {
    const request = buildStationaryEnergyChatRequest({
      cityId: "city-1",
      cityName: "Caxias do Sul",
      content: "add all seeg data",
      decisionReviewContext: [],
      draftState: null,
      inventoryId: "inventory-1",
      inventoryYear: 2022,
      threadId: "thread-1",
    });

    expect(request.context).toEqual(
      expect.objectContaining({
        city_name: "Caxias do Sul",
        inventory_year: 2022,
      }),
    );
  });

  it("marks a re-sent pre-run request so the agent answers it with the run", () => {
    const draft = draftFixture();
    const request = buildStationaryEnergyChatRequest({
      cityId: "city-1",
      content: "add all seeg data",
      decisionReviewContext: [],
      draftState: draft,
      inventoryId: "inventory-1",
      resumeAfterDraftStart: true,
      threadId: "thread-1",
    });
    const normalRequest = buildStationaryEnergyChatRequest({
      cityId: "city-1",
      content: "add all seeg data",
      decisionReviewContext: [],
      draftState: draft,
      inventoryId: "inventory-1",
      threadId: "thread-1",
    });

    expect(request.options).toEqual(
      expect.objectContaining({
        stationary_energy_draft_run_id: draft.draft_run_id,
        stationary_energy_resume_after_draft_start: true,
      }),
    );
    expect(normalRequest.options).not.toHaveProperty(
      "stationary_energy_resume_after_draft_start",
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
});
