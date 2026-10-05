import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const runId = "11111111-1111-4111-8111-111111111111";
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
};

beforeAll(async () => {
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

describe("Funder create API boundary", () => {
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
        body: funder,
        searchParams: { user_id: "owner" },
      }),
    );
  });

  it.each([
    [
      "an empty funder name",
      () =>
        createFunder(
          post({ ...funder, funder: { ...funder.funder, name: " " } }),
          context,
        ),
    ],
    [
      "a minimum above the maximum",
      () =>
        createFunder(
          post({
            ...funder,
            opportunity: { ...funder.opportunity, min_award: 9000 },
          }),
          context,
        ),
    ],
  ])("rejects %s before any upstream call", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ name: "ZodError" });
    expect(callApi).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    await expect(
      createFunder(post(funder), { ...context, session: null }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(callApi).not.toHaveBeenCalled();
  });
});
