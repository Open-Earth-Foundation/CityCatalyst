import { afterEach, expect, it, jest } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";
jest.unstable_mockModule("@/lib/runtime-env", () => ({ env: () => undefined }));
const { api } = await import("@/services/api");
const { documentWorkspaceApi } =
  await import("@/services/document-workspace-api");
const NativeRequest = globalThis.Request;
afterEach(() => {
  globalThis.Request = NativeRequest;
  jest.restoreAllMocks();
});
it("refreshes current draft gap IDs after explicit point sync without refetching another run", async () => {
  globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(
        typeof input === "string" ? new URL(input, "http://localhost") : input,
        init,
      );
    }
  };
  let synced = false;
  const calls: string[] = [];
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const path = new URL(request.url).pathname;
    calls.push(`${request.method} ${path}`);
    if (request.method === "PUT") {
      synced = true;
      return Response.json({ revision: 2 });
    }
    if (path.endsWith("/draft/"))
      return Response.json({
        run_id: path.split("/")[4],
        chapters: [
          {
            chapter_id: "finance",
            open_gap_count: synced ? 1 : 0,
            gaps: synced ? [{ gap_id: "canonical-gap" }] : [],
          },
        ],
      });
    throw new Error(`Unexpected path: ${path}`);
  });
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (defaults) => defaults().concat(api.middleware),
  });
  const subscriptions = [
    store.dispatch(api.endpoints.getConceptNoteDraft.initiate("run")),
    store.dispatch(api.endpoints.getConceptNoteDraft.initiate("other")),
  ];
  try {
    await Promise.all(
      subscriptions.map((subscription) => subscription.unwrap()),
    );
    calls.length = 0;
    await store
      .dispatch(
        documentWorkspaceApi.endpoints.saveDocumentSetup.initiate({
          runId: "run",
          expected_revision: 1,
          idempotency_key: "sync",
        }),
      )
      .unwrap();
    await Promise.all(store.dispatch(api.util.getRunningQueriesThunk()));
    expect(calls).toEqual([
      "PUT /api/v1/concept-notes/run/setup",
      "GET /api/v1/concept-notes/run/draft/",
    ]);
    expect(
      api.endpoints.getConceptNoteDraft.select("run")(store.getState()).data
        ?.chapters[0].open_gap_count,
    ).toBe(1);
  } finally {
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    store.dispatch(api.util.resetApiState());
  }
});
