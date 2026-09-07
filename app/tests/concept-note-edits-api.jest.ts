import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { forwardConceptNoteEdit } from "@/backend/concept-note-edits";
import type { callConceptNoteApi } from "@/backend/concept-notes";
import type {
  EditApplyRequest,
  EditProposalRequest,
  EditScope,
} from "@/util/concept-note-edit-types";
import { Roles } from "@/util/types";

type EditProxyContext = Parameters<typeof forwardConceptNoteEdit>[1];
type UnwrappedEditHandler = (
  request: Request,
  context: EditProxyContext,
) => ReturnType<typeof forwardConceptNoteEdit>;

function unwrappedHandler(handler: unknown): UnwrappedEditHandler {
  if (typeof handler !== "function")
    throw new TypeError("Expected an edit route handler");
  // The apiHandler mock exposes the authorized inner callback, not Next's wrapper.
  return handler as UnwrappedEditHandler;
}

const runId = "11111111-1111-4111-8111-111111111111";
const proposalId = "22222222-2222-4222-8222-222222222222";
const chapterId = "33333333-3333-4333-8333-333333333333";
const key = "44444444-4444-4444-8444-444444444444";
const loadRunCity = jest.fn<() => Promise<string>>();
const canAccessCity = jest.fn<() => Promise<void>>();
const upstream = jest.fn<typeof callConceptNoteApi>();
jest.unstable_mockModule("@/backend/ConceptNoteUploadService", () => ({
  loadConceptNoteRunCity: loadRunCity,
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi: upstream,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let list: UnwrappedEditHandler,
  propose: UnwrappedEditHandler,
  read: UnwrappedEditHandler,
  apply: UnwrappedEditHandler,
  reject: UnwrappedEditHandler;
let refine: UnwrappedEditHandler,
  history: UnwrappedEditHandler,
  revision: UnwrappedEditHandler,
  undo: UnwrappedEditHandler,
  restore: UnwrappedEditHandler;
beforeAll(async () => {
  const collection =
    await import("@/app/api/v1/concept-notes/[runId]/edit-proposals/route");
  list = unwrappedHandler(collection.GET);
  propose = unwrappedHandler(collection.POST);
  read = unwrappedHandler(
    (
      await import("@/app/api/v1/concept-notes/[runId]/edit-proposals/[proposalId]/route")
    ).GET,
  );
  apply = unwrappedHandler(
    (
      await import("@/app/api/v1/concept-notes/[runId]/edit-proposals/[proposalId]/apply/route")
    ).POST,
  );
  reject = unwrappedHandler(
    (
      await import("@/app/api/v1/concept-notes/[runId]/edit-proposals/[proposalId]/reject/route")
    ).POST,
  );
  refine = unwrappedHandler(
    (
      await import("@/app/api/v1/concept-notes/[runId]/edit-proposals/[proposalId]/refine/route")
    ).POST,
  );
  history = unwrappedHandler(
    (await import("@/app/api/v1/concept-notes/[runId]/revisions/route")).GET,
  );
  revision = unwrappedHandler(
    (
      await import("@/app/api/v1/concept-notes/[runId]/revisions/[revisionId]/route")
    ).GET,
  );
  undo = unwrappedHandler(
    (
      await import("@/app/api/v1/concept-notes/[runId]/revisions/[revisionId]/undo/route")
    ).POST,
  );
  restore = unwrappedHandler(
    (
      await import("@/app/api/v1/concept-notes/[runId]/revisions/[revisionId]/restore/route")
    ).POST,
  );
});
const context: EditProxyContext = {
  session: {
    user: { id: "owner", role: Roles.User },
    expires: "2026-08-31T00:00:00Z",
  },
  params: { runId, proposalId },
};
const scope: EditScope = {
  kind: "auto",
  focused_chapter_id: chapterId,
};
const proposalBody: EditProposalRequest = {
  instruction: "Make wording clearer",
  idempotency_key: key,
  scope,
};
const applyBody: EditApplyRequest = {
  idempotency_key: key,
  expected_revisions: { [chapterId]: 1 },
};
function request(body?: object): Request {
  return new Request("http://test", {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-request-id": "req-edit" },
    body: body ? JSON.stringify(body) : undefined,
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  loadRunCity.mockResolvedValue("city");
  canAccessCity.mockResolvedValue(undefined);
  upstream.mockImplementation(
    async () =>
      new Response(JSON.stringify({ proposal_id: proposalId }), {
        status: 200,
      }),
  );
});
afterEach(() => jest.restoreAllMocks());

describe("authorized CC-732 proxy contracts", () => {
  it("forwards the exact proposal after current city authorization", async () => {
    await propose(request(proposalBody), context);
    expect(loadRunCity).toHaveBeenCalledWith({
      runId,
      userId: "owner",
      requestId: "req-edit",
    });
    expect(canAccessCity).toHaveBeenCalledWith(context.session, "city", {
      includeResource: false,
    });
    expect(upstream).toHaveBeenCalledWith({
      path: `/v1/concept-notes/${runId}/edit-proposals`,
      method: "POST",
      body: proposalBody,
      userId: "owner",
      requestId: "req-edit",
      searchParams: { user_id: "owner" },
    });
  });
  it("forwards list/read/apply/reject through the same ownership boundary", async () => {
    await list(request(), context);
    await read(request(), context);
    await apply(request(applyBody), context);
    await reject(request(), context);
    expect(canAccessCity).toHaveBeenCalledTimes(4);
    expect(upstream.mock.calls.map(([arg]) => arg.path)).toEqual([
      `/v1/concept-notes/${runId}/edit-proposals`,
      `/v1/concept-notes/${runId}/edit-proposals/${proposalId}`,
      `/v1/concept-notes/${runId}/edit-proposals/${proposalId}/apply`,
      `/v1/concept-notes/${runId}/edit-proposals/${proposalId}/reject`,
    ]);
  });
  it("rejects missing session, malformed identifiers and forbidden cities", async () => {
    await expect(
      list(request(), { ...context, session: null }),
    ).rejects.toBeDefined();
    await expect(
      read(request(), { ...context, params: { runId: "bad", proposalId } }),
    ).rejects.toBeDefined();
    expect(upstream).not.toHaveBeenCalled();
    canAccessCity.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(list(request(), context)).rejects.toThrow("Forbidden");
    expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects manual scope, extra authority fields and invalid vectors", async () => {
    for (const body of [
      {
        ...proposalBody,
        scope: { kind: "chapters", chapter_ids: [chapterId] },
      },
      { ...proposalBody, user_id: "other" },
      { ...proposalBody, instruction: "   " },
    ]) {
      await expect(propose(request(body), context)).rejects.toBeDefined();
    }
    await expect(
      apply(request({ ...applyBody, expected_revisions: {} }), context),
    ).rejects.toBeDefined();
    expect(upstream).not.toHaveBeenCalled();
  });
  it("preserves conflict status and safe machine-readable failure", async () => {
    upstream.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: "stale_base", detail: "Reload the draft" }),
        { status: 409 },
      ),
    );
    const response = await apply(request(applyBody), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "stale_base",
      detail: "Reload the draft",
    });
  });
  it("never falls back to success when the upstream transport fails", async () => {
    upstream.mockRejectedValueOnce(new Error("Service unavailable"));
    await expect(list(request(), context)).rejects.toThrow(
      "Service unavailable",
    );
  });
  it("forwards refinement and revision operations with the same authorization", async () => {
    const historyContext = {
      ...context,
      params: { runId, revisionId: proposalId },
    };
    await refine(request(proposalBody), context);
    await history(new Request("http://test?before_sequence=3"), historyContext);
    await revision(request(), historyContext);
    await undo(request(applyBody), historyContext);
    await restore(request(applyBody), historyContext);
    expect(canAccessCity).toHaveBeenCalledTimes(5);
    expect(upstream.mock.calls.map(([value]) => value.path)).toEqual([
      `/v1/concept-notes/${runId}/edit-proposals/${proposalId}/refine`,
      `/v1/concept-notes/${runId}/revisions`,
      `/v1/concept-notes/${runId}/revisions/${proposalId}`,
      `/v1/concept-notes/${runId}/revisions/${proposalId}/undo`,
      `/v1/concept-notes/${runId}/revisions/${proposalId}/restore`,
    ]);
    expect(upstream.mock.calls[1][0].searchParams).toEqual({
      user_id: "owner",
      before_sequence: "3",
    });
  });
  it("rejects forged history targets, invalid cursors and unversioned restoration", async () => {
    const historyContext = {
      ...context,
      params: { runId, revisionId: proposalId },
    };
    await expect(
      revision(request(), {
        ...historyContext,
        params: { runId, revisionId: "bad" },
      }),
    ).rejects.toBeDefined();
    await expect(
      history(new Request("http://test?before_sequence=-1"), historyContext),
    ).rejects.toBeDefined();
    await expect(
      restore(request({ idempotency_key: key }), historyContext),
    ).rejects.toBeDefined();
    expect(upstream).not.toHaveBeenCalled();
  });
});
