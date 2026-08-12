import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const runId = "11111111-1111-4111-8111-111111111111";
const cityId = "22222222-2222-4222-8222-222222222222";

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

let retryHandler: typeof import("@/app/api/v1/concept-notes/[runId]/context-bundle/retry/route").POST;

beforeAll(async () => {
  ({ POST: retryHandler } =
    await import("@/app/api/v1/concept-notes/[runId]/context-bundle/retry/route"));
});

describe("Concept Note context-bundle retry proxy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadRunCity.mockResolvedValue(cityId);
    canAccessCity.mockResolvedValue(undefined);
    callConceptNoteApi.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 202 }),
    );
    readConceptNoteApiPayload.mockResolvedValue({
      run_id: runId,
      status: "queued",
    });
  });

  it("authorizes the city and forwards the scoped retry to Climate Advisor", async () => {
    const requestId = "cc-request-123";
    const response = await retryHandler(
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-request-id": requestId },
      }),
      {
        session: { user: { id: "owner-user" } },
        params: { runId },
      },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ run_id: runId, status: "queued" });
    expect(loadRunCity).toHaveBeenCalledWith({
      runId,
      userId: "owner-user",
      requestId,
    });
    expect(canAccessCity).toHaveBeenCalledWith(expect.anything(), cityId, {
      includeResource: false,
    });
    expect(callConceptNoteApi).toHaveBeenCalledWith({
      path: `/v1/concept-notes/${runId}/context-bundle/retry`,
      userId: "owner-user",
      method: "POST",
      requestId,
    });
  });

  it("requires an authenticated session", async () => {
    await expect(
      retryHandler(new Request("http://localhost"), {
        session: null,
        params: { runId },
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });
});
