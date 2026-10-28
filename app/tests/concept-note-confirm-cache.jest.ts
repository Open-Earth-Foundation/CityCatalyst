import { afterEach, expect, jest, test } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";

jest.unstable_mockModule("@/lib/runtime-env", () => ({ env: () => undefined }));
const { api } = await import("@/services/api");
const { editApi } = await import("@/services/concept-note-edit-api");
const NativeRequest = globalThis.Request;

afterEach(() => {
  globalThis.Request = NativeRequest;
  jest.restoreAllMocks();
});

test("chapter confirmation refreshes draft and proposed edits only for its run without polling", async () => {
  // Browsers resolve the API's relative URLs against the page's origin.
  globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(
        typeof input === "string" ? new URL(input, "http://localhost") : input,
        init,
      );
    }
  };
  const runId = "11111111-1111-4111-8111-111111111111";
  const otherRunId = "22222222-2222-4222-8222-222222222222";
  const chapterId = "33333333-3333-4333-8333-333333333333";
  let confirmed = false;
  const calls: string[] = [];
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const path = new URL(request.url).pathname;
    calls.push(`${request.method} ${path}`);
    if (request.method === "POST") {
      expect(path).toBe(
        `/api/v1/concept-notes/${runId}/chapters/${chapterId}/confirm`,
      );
      expect(await request.json()).toEqual({
        expected_revision: 1,
        idempotency_key: "44444444-4444-4444-8444-444444444444",
      });
      confirmed = true;
      return Response.json({ run_id: runId, chapters: [] });
    }
    const targetRun = path.split("/")[4];
    if (path.endsWith("/edit-proposals")) {
      return Response.json([
        {
          proposal_id: `proposal-${targetRun}`,
          run_id: targetRun,
          status: confirmed && targetRun === runId ? "stale" : "proposed",
        },
      ]);
    }
    if (path.endsWith("/draft/")) {
      return Response.json({
        run_id: targetRun,
        chapters: [
          {
            chapter_id: chapterId,
            status: confirmed && targetRun === runId ? "ready" : "draft",
          },
        ],
      });
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(api.middleware),
  });
  const subscriptions = [
    store.dispatch(api.endpoints.getConceptNoteDraft.initiate(runId)),
    store.dispatch(editApi.endpoints.listEditProposals.initiate(runId)),
    store.dispatch(api.endpoints.getConceptNoteDraft.initiate(otherRunId)),
    store.dispatch(editApi.endpoints.listEditProposals.initiate(otherRunId)),
  ];
  try {
    await Promise.all(
      subscriptions.map((subscription) => subscription.unwrap()),
    );
    expect(
      editApi.endpoints.listEditProposals.select(runId)(store.getState())
        .data?.[0].status,
    ).toBe("proposed");
    calls.length = 0;
    await store
      .dispatch(
        api.endpoints.confirmConceptNoteChapter.initiate({
          runId,
          chapterId,
          expectedRevision: 1,
          idempotencyKey: "44444444-4444-4444-8444-444444444444",
        }),
      )
      .unwrap();
    await Promise.all(store.dispatch(api.util.getRunningQueriesThunk()));
    expect(calls.sort()).toEqual(
      [
        `GET /api/v1/concept-notes/${runId}/draft/`,
        `GET /api/v1/concept-notes/${runId}/edit-proposals`,
        `POST /api/v1/concept-notes/${runId}/chapters/${chapterId}/confirm`,
      ].sort(),
    );
    expect(
      editApi.endpoints.listEditProposals.select(runId)(store.getState())
        .data?.[0].status,
    ).toBe("stale");
    expect(
      api.endpoints.getConceptNoteDraft.select(runId)(store.getState()).data
        ?.chapters[0].status,
    ).toBe("ready");
    expect(
      editApi.endpoints.listEditProposals.select(otherRunId)(store.getState())
        .data?.[0].status,
    ).toBe("proposed");
  } finally {
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    store.dispatch(api.util.resetApiState());
  }
});
