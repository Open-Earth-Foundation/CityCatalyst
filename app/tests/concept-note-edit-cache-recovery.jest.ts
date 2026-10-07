import { expect, it, jest } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";

jest.unstable_mockModule("@/lib/runtime-env", () => ({ env: () => undefined }));
const { api } = await import("@/services/api");
const { editApi } = await import("@/services/concept-note-edit-api");

it("recovers the collection before merging a chat proposal after the initial GET failed", async () => {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (defaults) => defaults().concat(api.middleware),
  });
  const originalRequest = globalThis.Request;
  const originalFetch = globalThis.fetch;
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
  const proposal = {
    run_id: "run",
    proposal_id: "proposal",
    status: "proposed",
  };
  let failCollection = true;
  globalThis.fetch = (async (request: Request) =>
    request.url.endsWith("/proposal")
      ? Response.json(proposal)
      : failCollection
        ? Response.json({}, { status: 503 })
        : Response.json([])) as typeof fetch;
  try {
    await store.dispatch(editApi.endpoints.listEditProposals.initiate("run"));
    const result = await store
      .dispatch(
        editApi.endpoints.getEditProposal.initiate({
          runId: "run",
          proposalId: "proposal",
        }),
      )
      .unwrap();
    failCollection = false;
    await store
      .dispatch(
        editApi.endpoints.listEditProposals.initiate("run", {
          subscribe: false,
          forceRefetch: true,
        }),
      )
      .unwrap();
    const patch = store.dispatch(
      editApi.util.updateQueryData("listEditProposals", "run", (items) => [
        result,
        ...items,
      ]),
    );
    expect(result.status).toBe("proposed");
    expect(patch.patches.length).toBeGreaterThan(0);
    const cached = editApi.endpoints.listEditProposals.select("run")(
      store.getState(),
    );
    expect(cached.data).toEqual([proposal]);
    expect(cached.isError).toBe(false);
  } finally {
    store.dispatch(api.util.resetApiState());
    globalThis.fetch = originalFetch;
    globalThis.Request = originalRequest;
  }
});
