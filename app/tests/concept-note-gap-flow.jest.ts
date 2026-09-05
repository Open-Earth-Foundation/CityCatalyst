import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const runId = "11111111-1111-4111-8111-111111111111";
const gapId = "22222222-2222-4222-8222-222222222222";
const chapterId = "33333333-3333-4333-8333-333333333333";
const cityId = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";

const loadRunCity = jest.fn<() => Promise<string>>();
const canAccessCity = jest.fn<() => Promise<void>>();
const callConceptNoteApi = jest.fn<() => Promise<Response>>();
const readConceptNoteApiPayload = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule("@/backend/ConceptNoteUploadService", () => ({
  loadConceptNoteRunCity: loadRunCity,
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi,
  readConceptNoteApiPayload,
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let resolveHandler: typeof import("@/app/api/v1/concept-notes/[runId]/gaps/[gapId]/resolve/route").POST;
let confirmHandler: typeof import("@/app/api/v1/concept-notes/[runId]/chapters/[chapterId]/confirm/route").POST;

beforeAll(async () => {
  ({ POST: resolveHandler } =
    await import("@/app/api/v1/concept-notes/[runId]/gaps/[gapId]/resolve/route"));
  ({ POST: confirmHandler } =
    await import("@/app/api/v1/concept-notes/[runId]/chapters/[chapterId]/confirm/route"));
});

describe("Concept Note missing-information proxies", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadRunCity.mockResolvedValue(cityId);
    canAccessCity.mockResolvedValue(undefined);
    callConceptNoteApi.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 202 }),
    );
    readConceptNoteApiPayload.mockResolvedValue({ run_id: runId });
  });

  it("forwards a versioned answer after city authorization", async () => {
    const body = {
      action: "answer",
      answer: "Lincoln Park Neighborhood Council",
      expected_version: 3,
      idempotency_key: idempotencyKey,
    };
    const response = await resolveHandler(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      {
        session: { user: { id: "owner-user" } },
        params: { runId, gapId },
      },
    );

    expect(response.status).toBe(202);
    expect(callConceptNoteApi).toHaveBeenCalledWith({
      path: `/v1/concept-notes/${runId}/gaps/${gapId}/resolve`,
      method: "POST",
      body,
      userId: "owner-user",
      requestId: undefined,
      searchParams: { user_id: "owner-user" },
    });
  });

  it("rejects an answer action without answer text", async () => {
    await expect(
      resolveHandler(
        new Request("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "answer",
            expected_version: 1,
            idempotency_key: idempotencyKey,
          }),
        }),
        {
          session: { user: { id: "owner-user" } },
          params: { runId, gapId },
        },
      ),
    ).rejects.toBeDefined();
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });

  it("forwards confirmation of one exact revision", async () => {
    callConceptNoteApi.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const body = {
      expected_revision: 4,
      idempotency_key: idempotencyKey,
    };
    const response = await confirmHandler(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      {
        session: { user: { id: "owner-user" } },
        params: { runId, chapterId },
      },
    );

    expect(response.status).toBe(200);
    expect(callConceptNoteApi).toHaveBeenCalledWith({
      path: `/v1/concept-notes/${runId}/chapters/${chapterId}/confirm`,
      method: "POST",
      body,
      userId: "owner-user",
      requestId: undefined,
      searchParams: { user_id: "owner-user" },
    });
  });
});
