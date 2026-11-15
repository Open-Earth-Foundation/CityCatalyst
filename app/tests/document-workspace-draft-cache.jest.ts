import { afterEach, expect, it, jest } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";

jest.unstable_mockModule("@/lib/runtime-env", () => ({ env: () => undefined }));
const { api } = await import("@/services/api");
const { documentWorkspaceApi } =
  await import("@/services/document-workspace-api");
const { editApi } = await import("@/services/concept-note-edit-api");
const NativeRequest = globalThis.Request;
afterEach(() => {
  globalThis.Request = NativeRequest;
  jest.restoreAllMocks();
});

it.each([
  "apply",
  "reject",
  "confirm",
  "start",
  "validate",
  "draft-complete",
  "unchanged-draft",
  "stale-setup",
])("reconciles only the current workspace after %s", async (operation) => {
  globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(
        typeof input === "string" ? new URL(input, "http://localhost") : input,
        init,
      );
    }
  };
  let revision = 10;
  let changed = false;
  let releaseWorkspace: (() => void) | undefined;
  let observedRefresh: () => void = () => {};
  const refreshStarted = new Promise<void>((resolve) => {
    observedRefresh = resolve;
  });
  const calls: string[] = [];
  const draft = (runId: string) => ({
    run_id: runId,
    status: changed ? "complete" : "running",
    chapters: [
      {
        chapter_id: "finance",
        revision_number: changed ? 2 : 1,
        status: changed ? "ready" : "draft",
        confirmed_revision_number: null,
        open_gap_count: 0,
        caveat_count: 0,
      },
    ],
  });
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const path = new URL(request.url).pathname;
    const runId = path.split("/")[4];
    calls.push(`${request.method} ${path}`);
    if (request.method !== "GET") {
      revision = 11;
      changed = true;
      if (operation === "stale-setup")
        return Response.json(
          { title: "Workspace changed. Reload before changing setup." },
          { status: 409 },
        );
      return Response.json(
        path.includes("edit-proposals")
          ? { run_id: runId, status: "applied" }
          : draft(runId),
      );
    }
    if (path.endsWith("/workspace")) {
      if (changed && runId === "run" && !releaseWorkspace) {
        await new Promise<void>((resolve) => {
          releaseWorkspace = resolve;
          observedRefresh();
        });
      }
      return Response.json({ revision: runId === "run" ? revision : 10 });
    }
    if (path.endsWith("/draft/")) return Response.json(draft(runId));
    throw new Error(`Unexpected path: ${path}`);
  });
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (defaults) => defaults().concat(api.middleware),
  });
  async function settle() {
    for (let pass = 0; pass < 6; pass++) {
      const running = store.dispatch(api.util.getRunningQueriesThunk());
      if (!running.length) return;
      await Promise.all(running);
    }
    throw new Error("Workspace queries did not settle");
  }
  const subscriptions = [
    store.dispatch(
      documentWorkspaceApi.endpoints.getDocumentWorkspace.initiate("run"),
    ),
    store.dispatch(
      documentWorkspaceApi.endpoints.getDocumentWorkspace.initiate("other"),
    ),
    store.dispatch(api.endpoints.getConceptNoteDraft.initiate("run")),
  ];
  try {
    await Promise.all(
      subscriptions.map((subscription) => subscription.unwrap()),
    );
    await settle();
    calls.length = 0;
    if (operation === "apply" || operation === "reject") {
      const target = {
        runId: "run",
        proposalId: "proposal",
        body: { expected_revisions: { finance: 1 }, idempotency_key: "apply" },
      };
      await store
        .dispatch(
          operation === "apply"
            ? editApi.endpoints.applyEditProposal.initiate(target)
            : editApi.endpoints.rejectEditProposal.initiate(target),
        )
        .unwrap();
    } else if (operation === "stale-setup") {
      await expect(
        store
          .dispatch(
            documentWorkspaceApi.endpoints.saveDocumentSetup.initiate({
              runId: "run",
              expected_revision: 10,
              idempotency_key: "stale",
            }),
          )
          .unwrap(),
      ).rejects.toMatchObject({ status: 409 });
    } else if (operation === "confirm") {
      await store
        .dispatch(
          api.endpoints.confirmConceptNoteChapter.initiate({
            runId: "run",
            chapterId: "finance",
            expectedRevision: 1,
            idempotencyKey: "confirm",
          }),
        )
        .unwrap();
    } else if (operation === "start") {
      await store
        .dispatch(api.endpoints.startConceptNoteDraft.initiate("run"))
        .unwrap();
    } else if (operation === "validate") {
      await store
        .dispatch(
          api.endpoints.validateConceptNoteChapter.initiate({
            runId: "run",
            chapterId: "finance",
          }),
        )
        .unwrap();
    } else {
      if (operation === "draft-complete") {
        changed = true;
        revision = 11;
      }
      await store
        .dispatch(
          api.endpoints.getConceptNoteDraft.initiate("run", {
            subscribe: false,
            forceRefetch: true,
          }),
        )
        .unwrap();
    }
    if (operation !== "unchanged-draft") {
      await refreshStarted;
      const refreshing =
        documentWorkspaceApi.endpoints.getDocumentWorkspace.select("run")(
          store.getState(),
        );
      expect(refreshing.status).toBe("pending");
      expect(refreshing.data?.revision).toBe(10);
      releaseWorkspace!();
    }
    await settle();
    expect(
      documentWorkspaceApi.endpoints.getDocumentWorkspace.select("run")(
        store.getState(),
      ).data?.revision,
    ).toBe(operation === "unchanged-draft" ? 10 : 11);
    expect(calls.some((call) => call.includes("/other/"))).toBe(false);
    if (operation === "stale-setup")
      expect(calls.filter((call) => call.startsWith("PUT "))).toHaveLength(1);
    expect(calls.filter((call) => call.endsWith("/workspace")).length > 0).toBe(
      operation !== "unchanged-draft",
    );
  } finally {
    releaseWorkspace?.();
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    store.dispatch(api.util.resetApiState());
  }
});
