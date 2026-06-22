/** @jest-environment jsdom */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { resolveStationaryEnergyDraftResume } from "@/components/StationaryEnergyDraft/resume";
import { writeStoredDraftContext } from "@/components/StationaryEnergyDraft/storage";
import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";

function draftFixture(
  draftRunId = "draft-1",
  status: DraftStatusResponse["status"] = "ready",
): DraftStatusResponse {
  return {
    draft_run_id: draftRunId,
    thread_id: "thread-1",
    status,
    workflow_step: "draft",
    proposals: [],
    source_candidates: [],
    review_decisions: [],
  };
}

describe("resolveStationaryEnergyDraftResume", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads the CA-backed persisted draft when no query or local cache exists", async () => {
    const persistedDraft = draftFixture("persisted-draft");
    const refreshDraftStatus = jest.fn(async (_draftRunId: string) =>
      draftFixture("cached-draft"),
    );
    const resumeDraftFromServer = jest.fn(async () => persistedDraft);

    await expect(
      resolveStationaryEnergyDraftResume({
        inventoryId: "inventory-1",
        queryDraftRunId: null,
        refreshDraftStatus,
        resumeDraftFromServer,
      }),
    ).resolves.toBe(persistedDraft);

    expect(refreshDraftStatus).not.toHaveBeenCalled();
    expect(resumeDraftFromServer).toHaveBeenCalledTimes(1);
  });

  it("uses a draftRunId deep link before trying durable resume", async () => {
    const linkedDraft = draftFixture("linked-draft");
    const refreshDraftStatus = jest.fn(
      async (_draftRunId: string) => linkedDraft,
    );
    const resumeDraftFromServer = jest.fn(async () =>
      draftFixture("server-draft"),
    );

    await expect(
      resolveStationaryEnergyDraftResume({
        inventoryId: "inventory-1",
        queryDraftRunId: "linked-draft",
        refreshDraftStatus,
        resumeDraftFromServer,
      }),
    ).resolves.toBe(linkedDraft);

    expect(refreshDraftStatus).toHaveBeenCalledWith("linked-draft");
    expect(resumeDraftFromServer).not.toHaveBeenCalled();
  });

  it("drops a terminal cached draft and falls back to durable resume", async () => {
    writeStoredDraftContext("inventory-1", {
      draftRunId: "saved-draft",
      threadId: "thread-1",
    });
    const refreshDraftStatus = jest.fn(async (_draftRunId: string) =>
      draftFixture("saved-draft", "saved"),
    );
    const resumeDraftFromServer = jest.fn(async () =>
      draftFixture("server-draft"),
    );

    await expect(
      resolveStationaryEnergyDraftResume({
        inventoryId: "inventory-1",
        queryDraftRunId: null,
        refreshDraftStatus,
        resumeDraftFromServer,
      }),
    ).resolves.toEqual(draftFixture("server-draft"));

    expect(refreshDraftStatus).toHaveBeenCalledWith("saved-draft");
    expect(resumeDraftFromServer).toHaveBeenCalledTimes(1);
    expect(
      window.localStorage.getItem("stationary-energy-draft:inventory-1"),
    ).toBe(null);
  });
});
