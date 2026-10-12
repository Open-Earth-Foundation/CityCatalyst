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
const loadRunCity = jest.fn<(...args: unknown[]) => Promise<string>>();
const callApi = jest.fn<(...args: unknown[]) => Promise<Response>>();
jest.unstable_mockModule("@/backend/ConceptNoteUploadService", () => ({
  loadConceptNoteRunCity: loadRunCity,
}));
jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callAuthorizedConceptNoteApi: callApi,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

type Handler = (req: Request, context: unknown) => Promise<Response>;
let startImport: Handler;
let getImport: Handler;
let discardImport: Handler;
let createFunder: Handler;
const session = { user: { id: "owner" } };
const context = { session, params: { runId } };
const post = (body: unknown) =>
  new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
  });
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
  import_id: null,
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
  ({ POST: createFunder } =
    (await import("@/app/api/v1/concept-notes/[runId]/funders/route")) as unknown as {
      POST: Handler;
    });
});
beforeEach(() => {
  jest.clearAllMocks();
  loadRunCity.mockResolvedValue(cityId);
  callApi.mockResolvedValue(
    Response.json({ funder_import: null }, { status: 200 }),
  );
});

describe("Funder API boundary", () => {
  it.each(["funder", "template"] as const)(
    "starts a %s import after the city check",
    async (kind) => {
      callApi.mockResolvedValue(
        Response.json(
          { funder_import: { status: "processing" } },
          { status: 202 },
        ),
      );
      const response = await startImport(
        post(kind === "funder" ? { uploadId } : { uploadId, kind }),
        context,
      );
      expect(response.status).toBe(202);
      expect(callApi).toHaveBeenCalledWith(
        expect.objectContaining({
          cityId,
          session,
          path: `/v1/concept-notes/${runId}/funder-imports`,
          method: "POST",
          body: { upload_id: uploadId, kind },
          searchParams: { user_id: "owner" },
        }),
      );
    },
  );

  it("reads and discards the current import, keeping upstream codes", async () => {
    const read = await getImport(new Request("http://localhost"), context);
    expect(await read.json()).toEqual({ funder_import: null });

    callApi.mockResolvedValue(new Response(null, { status: 204 }));
    const discarded = await discardImport(
      new Request("http://localhost", {
        method: "DELETE",
        body: JSON.stringify({ importId: uploadId }),
      }),
      context,
    );
    expect(discarded.status).toBe(204);
    expect(callApi).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "DELETE",
        body: { import_id: uploadId },
      }),
    );

    const detail = { code: "funder_import_running", message: "No" };
    callApi.mockResolvedValue(Response.json({ detail }, { status: 409 }));
    const conflict = await startImport(post({ uploadId }), context);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ detail });
  });

  it("forwards reviewed funder values", async () => {
    const created = { funder_id: "f", funding_opportunity_id: "o" };
    callApi.mockResolvedValue(Response.json(created, { status: 201 }));
    const response = await createFunder(post(funder), context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(created);
    expect(callApi).toHaveBeenCalledWith(
      expect.objectContaining({
        cityId,
        session,
        path: `/v1/concept-notes/${runId}/funders`,
        method: "POST",
        searchParams: { user_id: "owner" },
        body: funder,
      }),
    );
  });

  it.each([
    ["a discard without an import id", () => discardImport(post({}), context)],
    [
      "an invalid discard import id",
      () => discardImport(post({ importId: "invalid" }), context),
    ],
    [
      "an invalid upload id",
      () => startImport(post({ uploadId: "x" }), context),
    ],
    [
      "an empty funder name",
      () =>
        createFunder(
          post({ ...funder, funder: { ...funder.funder, name: " " } }),
          context,
        ),
    ],
  ])("rejects %s before any upstream call", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ name: "ZodError" });
    expect(callApi).not.toHaveBeenCalled();
  });

  it.each([
    [
      "reading an import",
      () =>
        getImport(new Request("http://localhost"), {
          ...context,
          session: null,
        }),
    ],
    [
      "creating a funder",
      () => createFunder(post(funder), { ...context, session: null }),
    ],
    [
      "creating with invalid details",
      () => createFunder(post({}), { ...context, session: null }),
    ],
  ])("requires authentication before %s", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ statusCode: 401 });
    expect(callApi).not.toHaveBeenCalled();
  });
});
