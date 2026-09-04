import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const runId = "11111111-1111-4111-8111-111111111111";
const chapterId = "22222222-2222-4222-8222-222222222222";
const cityId = "33333333-3333-4333-8333-333333333333";

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

let validationHandler: typeof import("@/app/api/v1/concept-notes/[runId]/chapters/[chapterId]/validation/route").POST;

beforeAll(async () => {
  ({ POST: validationHandler } =
    await import("@/app/api/v1/concept-notes/[runId]/chapters/[chapterId]/validation/route"));
});

describe("Concept Note chapter-validation proxy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadRunCity.mockResolvedValue(cityId);
    canAccessCity.mockResolvedValue(undefined);
    callConceptNoteApi.mockResolvedValue(
      Response.json({ chapter_id: chapterId, status: "needs_review" }),
    );
    readConceptNoteApiPayload.mockResolvedValue({
      chapter_id: chapterId,
      status: "needs_review",
    });
  });

  it("authorizes the city and forwards the explicit validation request", async () => {
    const requestId = "cc-validation-request";
    const response = await validationHandler(
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-request-id": requestId },
      }),
      {
        session: { user: { id: "owner-user" } },
        params: { chapterId, runId },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      chapter_id: chapterId,
      status: "needs_review",
    });
    expect(loadRunCity).toHaveBeenCalledWith({
      runId,
      userId: "owner-user",
      requestId,
    });
    expect(canAccessCity).toHaveBeenCalledWith(expect.anything(), cityId, {
      includeResource: false,
    });
    expect(callConceptNoteApi).toHaveBeenCalledWith({
      path: `/v1/concept-notes/${runId}/chapters/${chapterId}/validation`,
      method: "POST",
      userId: "owner-user",
      requestId,
      searchParams: { user_id: "owner-user" },
    });
  });

  it("requires an authenticated session", async () => {
    await expect(
      validationHandler(new Request("http://localhost"), {
        session: null,
        params: { chapterId, runId },
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });
});
