import { expect, it, jest } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";

jest.unstable_mockModule("@/lib/runtime-env", () => ({ env: () => undefined }));
const { api } = await import("@/services/api");

function makeStore() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(api.middleware),
  });
}

it("entry revalidation reloads a cached terminal draft changed in another tab", async () => {
  const store = makeStore();
  const originalFetch = globalThis.fetch;
  const originalRequest = globalThis.Request;
  globalThis.Request = class extends originalRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(
        typeof input === "string" && input.startsWith("/")
          ? `http://localhost${input}`
          : input,
        init,
      );
    }
  };
  let revision = 1;
  const fetchMock = jest.fn(async () =>
    Response.json({
      run_id: "run",
      status: "complete",
      chapters: [{ revision_number: revision }],
    }),
  );
  globalThis.fetch = fetchMock as typeof fetch;
  try {
    const first = store.dispatch(
      api.endpoints.getConceptNoteDraft.initiate("run"),
    );
    await first.unwrap();
    first.unsubscribe();
    revision = 2; // Another tab changes the server while this workspace is closed.
    const second = store.dispatch(
      api.endpoints.getConceptNoteDraft.initiate("run", { forceRefetch: true }),
    );
    const result = await second.unwrap();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.chapters[0].revision_number).toBe(2);
    second.unsubscribe();
  } finally {
    store.dispatch(api.util.resetApiState());
    globalThis.fetch = originalFetch;
    globalThis.Request = originalRequest;
  }
});

it("an SSE upload upsert recovers data and clears an initial request error", async () => {
  const store = makeStore();
  const args = { runId: "run", uploadId: "upload" };
  const originalFetch = globalThis.fetch;
  const originalRequest = globalThis.Request;
  globalThis.Request = class extends originalRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(
        typeof input === "string" && input.startsWith("/")
          ? `http://localhost${input}`
          : input,
        init,
      );
    }
  };
  globalThis.fetch = (async () =>
    Response.json({}, { status: 503 })) as typeof fetch;
  try {
    const query = store.dispatch(
      api.endpoints.getConceptNoteUploadStatus.initiate(args),
    );
    await query;
    store.dispatch(
      api.util.upsertQueryEntries([
        {
          endpointName: "getConceptNoteUploadStatus",
          arg: args,
          value: {
            ...args,
            status: "ready",
            filename: "plan.pdf",
            receivedAt: "2026-09-22T12:00:00Z",
          },
        },
      ]),
    );
    const cached = api.endpoints.getConceptNoteUploadStatus.select(args)(
      store.getState(),
    );
    expect(cached.data?.status).toBe("ready");
    expect(cached.isError).toBe(false);
    query.unsubscribe();
  } finally {
    store.dispatch(api.util.resetApiState());
    globalThis.fetch = originalFetch;
    globalThis.Request = originalRequest;
  }
});
