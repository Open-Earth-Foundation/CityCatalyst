import { expect, it } from "@jest/globals";
import { canSaveToInventory } from "@/components/StationaryEnergyDraft/flow";
import {
  resolveChatActivityLabel,
  resolveDraftStartResume,
  resolveInventorySaveConfirmationRequest,
  resolveStationaryEnergyStartDraftFailureMessage,
  resolveStationaryEnergyToolMessage,
  toolStartedEventName,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";

describe("stationary energy chat tools", () => {
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

  it("resolves chat start-draft tool failures to retryable user copy", () => {
    const t = ((key: string, params?: Record<string, unknown>) =>
      `${key}:${JSON.stringify(params ?? {})}`) as Parameters<
      typeof resolveStationaryEnergyStartDraftFailureMessage
    >[0];

    expect(
      resolveStationaryEnergyStartDraftFailureMessage(t, {
        ui_event: "stationary_energy_draft_started",
        success: false,
        message_key: "tool-error-generic",
      }),
    ).toBe("error-failed-to-start-stationary-energy-draft-retry:{}");

    expect(
      resolveStationaryEnergyStartDraftFailureMessage(t, {
        ui_event: "stationary_energy_draft_started",
        success: false,
        message_key: "tool-error-specific-start",
        message_params: { status: 401 },
      }),
    ).toBe('tool-error-specific-start:{"status":401}');

    expect(
      resolveStationaryEnergyStartDraftFailureMessage(t, {
        ui_event: "stationary_energy_draft_started",
        success: true,
      }),
    ).toBeNull();
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

  it("only treats executing tool events without a UI payload as tool starts", () => {
    expect(
      toolStartedEventName({
        name: "stationary_energy_start_draft",
        status: "executing",
        arguments: {},
      }),
    ).toBe("stationary_energy_start_draft");
    expect(
      toolStartedEventName({
        name: "stationary_energy_start_draft",
        status: "success",
      }),
    ).toBeNull();
    expect(
      toolStartedEventName({
        name: "stationary_energy_start_draft",
        status: "executing",
        ui_event: "stationary_energy_draft_started",
      }),
    ).toBeNull();
  });

  it("resumes only requests that asked for more than starting the run", () => {
    const started = {
      success: true,
      ui_event: "stationary_energy_draft_started" as const,
      draft_run_id: "draft-1",
    };

    expect(
      resolveDraftStartResume(
        { ...started, continue_request: true },
        "draft-1",
        "add all seeg data",
      ),
    ).toEqual({ draftRunId: "draft-1", content: "add all seeg data" });
    expect(
      resolveDraftStartResume(started, "draft-1", "draft the empty rows"),
    ).toBeNull();
    expect(
      resolveDraftStartResume(
        { ...started, continue_request: false },
        "draft-1",
        "go ahead",
      ),
    ).toBeNull();
    expect(
      resolveDraftStartResume(
        { ...started, continue_request: true },
        "draft-1",
        null,
      ),
    ).toBeNull();
  });

  it("shows the running tool, then thinking, then the wait for a started run", () => {
    const t = ((key: string) => key) as Parameters<
      typeof resolveChatActivityLabel
    >[0];
    const idle = {
      activeToolName: null,
      awaitingDraftStartResume: false,
      isChatStreaming: false,
      replyTextVisible: false,
    };

    expect(
      resolveChatActivityLabel(t, {
        ...idle,
        activeToolName: "stationary_energy_start_draft",
        isChatStreaming: true,
        replyTextVisible: true,
      }),
    ).toBe("chat-activity-start-run");
    expect(
      resolveChatActivityLabel(t, {
        ...idle,
        activeToolName: "some_other_tool",
        isChatStreaming: true,
      }),
    ).toBe("chat-activity-running-tool");
    expect(
      resolveChatActivityLabel(t, { ...idle, isChatStreaming: true }),
    ).toBe("chat-panel-thinking");
    expect(
      resolveChatActivityLabel(t, {
        ...idle,
        isChatStreaming: true,
        replyTextVisible: true,
      }),
    ).toBeNull();
    expect(
      resolveChatActivityLabel(t, { ...idle, awaitingDraftStartResume: true }),
    ).toBe("chat-activity-run-loading");
    expect(resolveChatActivityLabel(t, idle)).toBeNull();
  });
});
