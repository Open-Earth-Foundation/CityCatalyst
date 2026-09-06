import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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
let clientApi: typeof import("@/services/concept-note-edit-api");
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
  clientApi = await import("@/services/concept-note-edit-api");
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

describe("CC-732 client request contract", () => {
  it("sends explicit apply/reject bodies and keeps proposal reads read-only", async () => {
    const fetch = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify({ proposal_id: proposalId })),
      );
    await clientApi.listEditProposals(runId);
    await clientApi.getEditProposal(runId, proposalId);
    await clientApi.createEditProposal(runId, proposalBody);
    await clientApi.applyEditProposal(runId, proposalId, applyBody);
    await clientApi.rejectEditProposal(runId, proposalId);
    expect(fetch.mock.calls.map(([, options]) => options?.method)).toEqual([
      "GET",
      "GET",
      "POST",
      "POST",
      "POST",
    ]);
    expect(fetch.mock.calls[3][1]?.body).toBe(JSON.stringify(applyBody));
  });
  it("returns a typed safe conflict instead of treating HTTP acceptance as apply success", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ code: "stale_base" }), { status: 409 }),
      );
    await expect(
      clientApi.applyEditProposal(runId, proposalId, applyBody),
    ).rejects.toMatchObject({ status: 409, code: "stale_base" });
  });
  it("uses authorized revision URLs and explicit compensating operation bodies", async () => {
    const fetch = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ application_id: proposalId })),
      );
    await clientApi.refineEditProposal(runId, proposalId, proposalBody);
    await clientApi.listEditHistory(runId, 3);
    await clientApi.getEditHistory(runId, proposalId);
    await clientApi.restoreEditHistory(runId, proposalId, "undo", applyBody);
    await clientApi.restoreEditHistory(runId, proposalId, "restore", applyBody);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `/api/v1/concept-notes/${runId}/edit-proposals/${proposalId}/refine`,
      `/api/v1/concept-notes/${runId}/revisions?before_sequence=3`,
      `/api/v1/concept-notes/${runId}/revisions/${proposalId}`,
      `/api/v1/concept-notes/${runId}/revisions/${proposalId}/undo`,
      `/api/v1/concept-notes/${runId}/revisions/${proposalId}/restore`,
    ]);
  });
});

describe("complete-file coverage verification", () => {
  let verifyCoverage: typeof import("../scripts/verify-cnb-edit-coverage.mjs").verifyCoverage;
  let root: string;
  let source: string;
  const entry = (file: string, hits = 1) => ({
    path: file,
    statementMap: {
      "0": { start: { line: 1, column: 0 }, end: { line: 1, column: 8 } },
    },
    s: { "0": hits },
    fnMap: {},
    f: {},
    branchMap: {},
    b: {},
  });
  beforeAll(async () => {
    ({ verifyCoverage } =
      await import("../scripts/verify-cnb-edit-coverage.mjs"));
  });
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "cc732-coverage-"));
    source = path.join(root, "Source.ts");
    writeFileSync(source, "export const value = 1;\n");
    writeFileSync(path.join(root, "Other.ts"), "export const other = 2;\n");
  });
  afterEach(() => {
    unlinkSync(source);
    unlinkSync(path.join(root, "Other.ts"));
    rmdirSync(root);
  });
  it("counts every current source file once and ignores unrelated package coverage", () => {
    const report = {
      [source]: entry(source),
      [path.join(root, "Other.ts")]: entry(path.join(root, "Other.ts"), 0),
    };
    expect(verifyCoverage({ files: ["Source.ts"] }, report, root)).toEqual({
      files: 1,
      covered_lines: 1,
      executable_lines: 1,
      percentage: 100,
    });
  });
  it("rejects a missing current source even when a stale report contains it", () => {
    const missing = path.join(root, "Missing.ts");
    expect(() =>
      verifyCoverage(
        { files: ["Missing.ts"] },
        { [missing]: entry(missing) },
        root,
      ),
    ).toThrow("Source file is missing");
  });
  it("rejects an unexecuted manifest file omitted from the report", () => {
    expect(() =>
      verifyCoverage(
        { files: ["Source.ts", "Other.ts"] },
        { [source]: entry(source) },
        root,
      ),
    ).toThrow("Full-file coverage is missing: Other.ts");
  });
  it("rejects exact or normalized duplicate paths and an empty manifest", () => {
    const report = { [source]: entry(source) };
    expect(() =>
      verifyCoverage({ files: ["Source.ts", "Source.ts"] }, report, root),
    ).toThrow("Duplicate");
    expect(() =>
      verifyCoverage({ files: ["Source.ts", "./Source.ts"] }, report, root),
    ).toThrow("Duplicate");
    expect(() => verifyCoverage({ files: [] }, report, root)).toThrow(
      "must contain files",
    );
  });
  it("rejects directory escapes and sub-80 coverage without averaging another package", () => {
    expect(() =>
      verifyCoverage({ files: ["../outside.ts"] }, {}, root),
    ).toThrow("outside app");
    expect(() =>
      verifyCoverage(
        { files: ["Source.ts"] },
        { [source]: entry(source, 0) },
        root,
      ),
    ).toThrow("below 80%");
  });
  it("only folds coverage path case on Windows", () => {
    const differentCase = path.join(root, "source.ts");
    const run = () =>
      verifyCoverage(
        { files: ["Source.ts"] },
        { [differentCase]: entry(differentCase) },
        root,
      );
    if (process.platform === "win32")
      expect(run()).toMatchObject({ percentage: 100 });
    else expect(run).toThrow("Full-file coverage is missing");
  });
});
