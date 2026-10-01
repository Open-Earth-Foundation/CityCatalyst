/** @jest-environment jsdom */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TFunction } from "i18next";
import type { SSEStreamOptions } from "@/hooks/useSSEStream";
import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";
import type { StationaryEnergyChatArtifactController } from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-types";
import {
  readStoredDraftContext,
  writeStoredDraftContext,
} from "@/components/StationaryEnergyDraft/storage";

let streamOptions: SSEStreamOptions;
const startStream = jest.fn(
  async (_url: string, _options?: RequestInit) => undefined,
);
jest.unstable_mockModule("@/hooks/useSSEStream", () => ({
  useSSEStream: (options: SSEStreamOptions) => {
    streamOptions = options;
    return { startStream, stopStream: jest.fn() };
  },
}));

let status: DraftStatusResponse["status"];
const draftFixture = (draftRunId = "draft-1"): DraftStatusResponse => ({
  draft_run_id: draftRunId,
  thread_id: "thread-1",
  status,
  workflow_step: "draft",
  proposals: [],
  source_candidates: [],
  review_decisions: [],
});
jest.unstable_mockModule(
  "@/components/StationaryEnergyDraft/stationary-energy-draft-api",
  () => ({
    createChatThread: jest.fn(async () => ({ threadId: "thread-1" })),
    fetchDraftRuns: jest.fn(async () => ({ drafts: [] })),
    fetchDraftStatus: jest.fn(async ({ draftRunId }: { draftRunId: string }) =>
      draftFixture(draftRunId),
    ),
    fetchResumedDraft: jest.fn(async () => null),
    persistReviewDecisionPayload: jest.fn(),
    saveAcceptedDraftRows: jest.fn(),
    startDraftRun: jest.fn(),
  }),
);

const { useStationaryEnergyChatArtifactController } =
  await import("@/components/StationaryEnergyDraft/use-stationary-energy-chat-artifact-controller");
const t = ((key: string) => key) as TFunction;
let controller: StationaryEnergyChatArtifactController;
let root: Root;
let container: HTMLDivElement;
const request = "add all SEEG data";

function Harness({
  queryDraftRunId = null,
}: {
  queryDraftRunId?: string | null;
}) {
  const currentController = useStationaryEnergyChatArtifactController({
    cityId: "city-1",
    inventoryId: "inventory-1",
    lng: "en",
    initialStage: "start",
    featureEnabled: true,
    queryDraftRunId,
    t,
  });
  useEffect(() => {
    controller = currentController;
  });
  return null;
}

async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

async function mount(queryDraftRunId?: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Harness queryDraftRunId={queryDraftRunId} />);
    await flush();
  });
}

async function queueRequest() {
  await act(async () => {
    controller.actions.sendChatMessage(request);
    await flush();
  });
  await act(async () => {
    streamOptions.onToolResult?.({
      ui_event: "stationary_energy_draft_started",
      success: true,
      draft_run_id: "draft-1",
      continue_request: true,
    });
    await flush();
    streamOptions.onComplete?.();
  });
}

async function poll(nextStatus: DraftStatusResponse["status"]) {
  status = nextStatus;
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2000);
    await flush();
  });
}

describe("chat-started draft continuation", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    window.localStorage.clear();
    startStream.mockClear();
    status = "generating";
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it("keeps the earlier request during a follow-up question, then resumes it once", async () => {
    await mount();
    await queueRequest();
    await act(async () => {
      controller.actions.sendChatMessage("Which sources are available?");
      await flush();
    });
    expect(controller.state.pendingDraftStartRequest).toBe(request);
    expect(readStoredDraftContext("inventory-1")?.pendingRequest).toBe(request);
    await poll("ready");
    expect(startStream).toHaveBeenCalledTimes(2);
    await act(async () => streamOptions.onComplete?.());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
      await flush();
    });
    expect(startStream).toHaveBeenCalledTimes(3);
    const body = JSON.parse(startStream.mock.calls[2][1]?.body as string);
    expect(body.content).toBe(request);
    expect(body.options.stationary_energy_resume_after_draft_start).toBe(true);
    expect(controller.state.pendingDraftStartRequest).toBe(null);
    expect(
      readStoredDraftContext("inventory-1")?.pendingRequest,
    ).toBeUndefined();
    await act(async () => {
      streamOptions.onComplete?.();
      await jest.advanceTimersByTimeAsync(10);
    });
    expect(startStream).toHaveBeenCalledTimes(3);
  });

  it("restores the queued request and thread after reload", async () => {
    await mount();
    await queueRequest();
    await act(async () => root.unmount());
    container.remove();
    await mount();
    expect(controller.state.pendingDraftStartRequest).toBe(request);
    await poll("ready");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
      await flush();
    });
    const body = JSON.parse(startStream.mock.calls[1][1]?.body as string);
    expect(body.content).toBe(request);
    expect(body.threadId).toBe("thread-1");
  });

  it.each(["failed", "saved", "partially_saved", "no_changes"] as const)(
    "clears the queue and explains why when the run becomes %s",
    async (terminalStatus) => {
      await mount();
      await queueRequest();
      await poll(terminalStatus);
      expect(controller.state.pendingDraftStartRequest).toBe(null);
      expect(controller.state.draftStartResumeNotice).toBe(
        terminalStatus === "failed"
          ? "chat-pending-request-failed"
          : "chat-pending-request-ended",
      );
      expect(readStoredDraftContext("inventory-1")).toBe(null);
      expect(startStream).toHaveBeenCalledTimes(1);
    },
  );

  it("lets the user explicitly cancel without stopping the draft or restoring the request on reload", async () => {
    await mount();
    await queueRequest();
    await act(async () => controller.actions.cancelDraftStartResume());
    expect(controller.state.pendingDraftStartRequest).toBe(null);
    expect(controller.state.draftStartResumeNotice).toBe(
      "chat-pending-request-canceled",
    );
    expect(readStoredDraftContext("inventory-1")?.draftRunId).toBe("draft-1");
    expect(
      readStoredDraftContext("inventory-1")?.pendingRequest,
    ).toBeUndefined();
    await act(async () => root.unmount());
    container.remove();
    await mount();
    await poll("ready");
    expect(startStream).toHaveBeenCalledTimes(1);
  });

  it("does not replay a cached request against a different deep-linked run", async () => {
    writeStoredDraftContext("inventory-1", {
      draftRunId: "old-draft",
      threadId: "old-thread",
      pendingRequest: request,
    });
    status = "ready";
    await mount("other-draft");
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(controller.state.activeDraftRunId).toBe("other-draft");
    expect(controller.state.pendingDraftStartRequest).toBe(null);
    expect(startStream).not.toHaveBeenCalled();
  });

  it("clears a request whose run failed while the page was closed", async () => {
    writeStoredDraftContext("inventory-1", {
      draftRunId: "draft-1",
      threadId: "thread-1",
      pendingRequest: request,
    });
    status = "failed";
    await mount();
    expect(controller.state.pendingDraftStartRequest).toBe(null);
    expect(controller.state.draftStartResumeNotice).toBe(
      "chat-pending-request-failed",
    );
    expect(readStoredDraftContext("inventory-1")).toBe(null);
    expect(startStream).not.toHaveBeenCalled();
  });

  it("cancels a ready continuation before its scheduled send", async () => {
    await mount();
    await queueRequest();
    status = "ready";
    await act(async () => {
      controller.actions.refreshActiveDraft();
      await flush();
    });
    await act(async () => controller.actions.cancelDraftStartResume());
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(startStream).toHaveBeenCalledTimes(1);
    expect(controller.state.pendingDraftStartRequest).toBe(null);
  });

  it("clears the queued request when starting over", async () => {
    await mount();
    await queueRequest();
    await act(async () => controller.actions.startOver());
    expect(controller.state.pendingDraftStartRequest).toBe(null);
    expect(readStoredDraftContext("inventory-1")).toBe(null);
    await act(async () => jest.advanceTimersByTimeAsync(2000));
    expect(startStream).toHaveBeenCalledTimes(1);
  });
});
