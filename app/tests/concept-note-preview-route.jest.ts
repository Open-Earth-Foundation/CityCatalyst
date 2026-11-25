import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import createHttpError from "http-errors";

const viewerId = "teammate";
const cityId = "11111111-1111-4111-8111-111111111111";
const projectId = "33333333-3333-4333-8333-333333333333";
const runId = "22222222-2222-4222-8222-222222222222";
const cnbModuleId = "7a2d4acc-230f-4810-ace6-a3c339f1f60e";

const callConceptNoteApi = jest.fn<() => Promise<Response>>();
const canAccessCity = jest.fn<() => Promise<unknown>>();
const hasModuleAccess = jest.fn<() => Promise<boolean>>();

jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/backend/ModuleAccessService", () => ({
  ModuleAccessService: { hasModuleAccess },
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let preview: typeof import("@/app/api/v1/concept-notes/[runId]/preview/route").GET;

const context = {
  session: { user: { id: viewerId } },
  params: { runId },
  searchParams: { city_id: cityId },
};
const request = () =>
  new Request("http://localhost", { headers: { "x-request-id": "req-1" } });

beforeAll(async () => {
  ({ GET: preview } =
    await import("@/app/api/v1/concept-notes/[runId]/preview/route"));
});

describe("Concept Note collaborator preview route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canAccessCity.mockResolvedValue({ resource: { projectId } });
    hasModuleAccess.mockResolvedValue(true);
  });

  it("reads the note for a city member with the module active", async () => {
    callConceptNoteApi.mockResolvedValueOnce(
      Response.json({ run_id: runId, city_id: cityId, proposals: [] }),
    );

    const response = await preview(request(), context as never);

    expect(response.status).toBe(200);
    expect(canAccessCity).toHaveBeenCalledWith(context.session, cityId);
    expect(hasModuleAccess).toHaveBeenCalledWith(projectId, cnbModuleId);
    expect(callConceptNoteApi).toHaveBeenCalledWith({
      path: `/v1/concept-notes/${runId}/preview`,
      userId: viewerId,
      requestId: "req-1",
      searchParams: { user_id: viewerId, city_id: cityId },
    });
  });

  it("hides the note when the Concept Note module is not active", async () => {
    hasModuleAccess.mockResolvedValueOnce(false);

    await expect(preview(request(), context as never)).rejects.toMatchObject({
      status: 404,
    });
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });

  it("refuses a user without access to the city", async () => {
    canAccessCity.mockRejectedValueOnce(new createHttpError.Forbidden());

    await expect(preview(request(), context as never)).rejects.toMatchObject({
      status: 403,
    });
    expect(hasModuleAccess).not.toHaveBeenCalled();
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });

  it("passes on not found for a note in another city or after revoked access", async () => {
    callConceptNoteApi.mockResolvedValueOnce(
      Response.json(
        { detail: "Concept Note run not found", internal: "x" },
        { status: 404 },
      ),
    );

    const response = await preview(request(), context as never);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      detail: "Concept Note run not found",
    });
  });
});
