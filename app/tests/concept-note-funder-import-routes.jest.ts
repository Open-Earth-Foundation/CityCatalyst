import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const runId = "11111111-1111-4111-8111-111111111111";
const uploadId = "22222222-2222-4222-8222-222222222222";
const cityId = "33333333-3333-4333-8333-333333333333";
const importId = "44444444-4444-4444-8444-444444444444";
const loadRunCity = jest.fn<(...args: unknown[]) => Promise<string>>();
const canAccessCity = jest.fn<(...args: unknown[]) => Promise<void>>();
const callConceptNoteApi = jest.fn<(...args: unknown[]) => Promise<Response>>();
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

type Handler = (req: Request, context: unknown) => Promise<Response>;
let startImport: Handler;
let getImport: Handler;
let discardImport: Handler;
let retryImport: Handler;
let createFunder: Handler;
const context = { session: { user: { id: "owner" } }, params: { runId } };
const json = (body: unknown, method = "POST") =>
  new Request("http://localhost", { method, body: JSON.stringify(body) });
const funder = {
  funder: {
    name: "Green Cities Foundation",
    funder_type: null,
    country: null,
    region: null,
    profile: { stated: {}, derived: {} },
  },
  opportunity: {
    name: "Nature-Based Cities 2026",
    applicant_type: null,
    category: null,
    sector: null,
    hazards: [],
    interventions: [],
    finance_route: null,
    instrument_type: null,
    region_scope: null,
    min_award: 1000,
    max_award: 5000,
    currency: "USD",
    status: null,
    summary: null,
    known_gaps: [],
  },
  template: {
    template_name: "Proposal form",
    output_format: null,
    chapter_schema: [
      {
        chapter_ref: "",
        title: "Summary",
        description: null,
        required: true,
        required_fields: [],
      },
    ],
  },
  import_id: importId,
};

beforeAll(async () => {
  ({ POST: startImport } =
    (await import("@/app/api/v1/concept-notes/[runId]/funder-imports/route")) as unknown as {
      POST: Handler;
    });
  ({ GET: getImport, DELETE: discardImport } =
    (await import("@/app/api/v1/concept-notes/[runId]/funder-imports/current/route")) as unknown as {
      GET: Handler;
      DELETE: Handler;
    });
  ({ POST: retryImport } =
    (await import("@/app/api/v1/concept-notes/[runId]/funder-imports/current/retry/route")) as unknown as {
      POST: Handler;
    });
  ({ POST: createFunder } =
    (await import("@/app/api/v1/concept-notes/[runId]/funders/route")) as unknown as {
      POST: Handler;
    });
});
beforeEach(() => {
  jest.clearAllMocks();
  loadRunCity.mockResolvedValue(cityId);
  canAccessCity.mockResolvedValue(undefined);
  callConceptNoteApi.mockResolvedValue(
    Response.json({ funder_import: null }, { status: 200 }),
  );
});

describe("Funder import API boundary", () => {
  it("starts an import for an upload with the snake_case upstream body", async () => {
    callConceptNoteApi.mockResolvedValue(
      Response.json(
        { funder_import: { status: "processing" } },
        { status: 202 },
      ),
    );
    const response = await startImport(json({ uploadId }), context);
    expect(response.status).toBe(202);
    expect(canAccessCity).toHaveBeenCalledWith(context.session, cityId, {
      includeResource: false,
    });
    expect(callConceptNoteApi).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/concept-notes/${runId}/funder-imports`,
        method: "POST",
        body: { upload_id: uploadId },
        searchParams: { user_id: "owner" },
      }),
    );
  });

  it("rejects an invalid upload id before any upstream call", async () => {
    await expect(
      startImport(json({ uploadId: "not-a-uuid" }), context),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });

  it("reads, retries and discards the current import", async () => {
    const read = await getImport(new Request("http://localhost"), context);
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ funder_import: null });
    expect(callConceptNoteApi).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: `/v1/concept-notes/${runId}/funder-imports/current`,
      }),
    );

    callConceptNoteApi.mockResolvedValue(
      Response.json({ funder_import: null }, { status: 202 }),
    );
    const retried = await retryImport(new Request("http://localhost"), context);
    expect(retried.status).toBe(202);
    expect(callConceptNoteApi).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: `/v1/concept-notes/${runId}/funder-imports/current/retry`,
        method: "POST",
      }),
    );

    callConceptNoteApi.mockResolvedValue(new Response(null, { status: 204 }));
    const discarded = await discardImport(
      new Request("http://localhost", { method: "DELETE" }),
      context,
    );
    expect(discarded.status).toBe(204);
    expect(await discarded.text()).toBe("");
  });

  it("preserves upstream conflicts for the browser to map", async () => {
    const detail = { code: "funder_import_not_failed", message: "No" };
    callConceptNoteApi.mockResolvedValue(
      Response.json({ detail }, { status: 409 }),
    );
    const response = await retryImport(
      new Request("http://localhost"),
      context,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ detail });
  });

  it("requires authentication and city access", async () => {
    await expect(
      getImport(new Request("http://localhost"), { ...context, session: null }),
    ).rejects.toMatchObject({ statusCode: 401 });
    canAccessCity.mockRejectedValue(
      Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    );
    await expect(createFunder(json(funder), context)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });
});

describe("Funder create API boundary", () => {
  it("forwards reviewed values and returns the new catalogue ids", async () => {
    const created = {
      funder_id: "55555555-5555-4555-8555-555555555555",
      funding_opportunity_id: "66666666-6666-4666-8666-666666666666",
    };
    callConceptNoteApi.mockResolvedValue(
      Response.json(created, { status: 201 }),
    );
    const response = await createFunder(json(funder), context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(created);
    expect(callConceptNoteApi).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/concept-notes/${runId}/funders`,
        method: "POST",
        body: funder,
        userId: "owner",
      }),
    );
  });

  it.each([
    ["an empty funder name", { funder: { ...funder.funder, name: " " } }],
    ["no chapters", { template: { ...funder.template, chapter_schema: [] } }],
    [
      "a minimum above the maximum",
      { opportunity: { ...funder.opportunity, min_award: 9000 } },
    ],
    [
      "an empty-string award",
      { opportunity: { ...funder.opportunity, max_award: "" } },
    ],
    ["unknown fields", { extra: true }],
  ])("rejects %s before any upstream call", async (_name, patch) => {
    await expect(
      createFunder(json({ ...funder, ...patch }), context),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });
});
