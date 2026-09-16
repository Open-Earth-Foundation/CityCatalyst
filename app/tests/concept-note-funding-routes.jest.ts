import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const runId = "11111111-1111-4111-8111-111111111111";
const funderId = "22222222-2222-4222-8222-222222222222";
const cityId = "33333333-3333-4333-8333-333333333333";
const loadRunCity = jest.fn<() => Promise<string>>();
const canAccessCity = jest.fn<() => Promise<void>>();
const callConceptNoteApi = jest.fn<() => Promise<Response>>();
jest.unstable_mockModule("@/backend/ConceptNoteUploadService", () => ({
  loadConceptNoteRunCity: loadRunCity,
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let catalogue: typeof import("@/app/api/v1/concept-notes/[runId]/funding-catalogue/route").GET;
let save: typeof import("@/app/api/v1/concept-notes/[runId]/application-context/route").PATCH;
const context = { session: { user: { id: "owner" } }, params: { runId } };
const selection = {
  funder_id: funderId,
  selected_funding_opportunity_id: null,
  expected_funder_id: null,
  expected_funding_opportunity_id: null,
  acknowledge_draft_review: false,
};
const request = (body = selection) =>
  new Request("http://localhost", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  ({ GET: catalogue } =
    await import("@/app/api/v1/concept-notes/[runId]/funding-catalogue/route"));
  ({ PATCH: save } =
    await import("@/app/api/v1/concept-notes/[runId]/application-context/route"));
});
beforeEach(() => {
  jest.clearAllMocks();
  loadRunCity.mockResolvedValue(cityId);
  canAccessCity.mockResolvedValue(undefined);
  callConceptNoteApi.mockResolvedValue(Response.json({ funders: [] }));
});

describe("Funding selection API boundary", () => {
  it("authorizes catalogue browsing before contacting the funding service", async () => {
    const response = await catalogue(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(canAccessCity).toHaveBeenCalledWith(context.session, cityId, {
      includeResource: false,
    });
    expect(callConceptNoteApi).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/concept-notes/${runId}/funding-catalogue`,
        searchParams: { user_id: "owner" },
      }),
    );
  });
  it("requires authentication for both reading and saving", async () => {
    await expect(
      catalogue(new Request("http://localhost"), { ...context, session: null }),
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      save(request(), { ...context, session: null }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });
  it("does not read or save catalogue data when city access is denied", async () => {
    canAccessCity.mockRejectedValue(
      Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    );
    await expect(
      catalogue(new Request("http://localhost"), context),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(save(request(), context)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });
  it("forwards the explicit choice and concurrency check with the authenticated user", async () => {
    const response = await save(request(), context);
    expect(response.status).toBe(200);
    expect(callConceptNoteApi).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PATCH",
        body: selection,
        userId: "owner",
        searchParams: { user_id: "owner" },
      }),
    );
  });
  it("rejects programme-only choices before any upstream call", async () => {
    await expect(
      save(
        request({
          ...selection,
          funder_id: null,
          selected_funding_opportunity_id: funderId,
        }),
        context,
      ),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });
  it("preserves upstream conflicts for the user to resolve", async () => {
    callConceptNoteApi.mockResolvedValue(
      Response.json({ detail: "Selection changed" }, { status: 409 }),
    );
    const response = await save(request(), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ detail: "Selection changed" });
  });
});
