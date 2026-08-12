import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import createHttpError from "http-errors";
import { ZodError } from "zod";

const cityId = "11111111-1111-4111-8111-111111111111";
const otherCityId = "22222222-2222-4222-8222-222222222222";
const ownerId = "owner-user";
const canAccessCity = jest.fn<() => Promise<void>>();
const callConceptNoteApi = jest.fn<() => Promise<Response>>();

jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let listRuns: typeof import("@/app/api/v1/concept-notes/route").GET;

const context = {
  session: { user: { id: ownerId } },
  searchParams: { city_id: cityId },
};

function runPayload(runId: string, runCityId: string = cityId) {
  return {
    run_id: runId,
    thread_id: null,
    name: "Resilient neighborhoods",
    city_id: runCityId,
    project_id: null,
    funder_id: null,
    selected_funding_opportunity_id: null,
    status: "active",
    workflow_step: "assembling_context",
    progress_summary: {},
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-02T09:00:00Z",
  };
}

beforeAll(async () => {
  ({ GET: listRuns } = await import("@/app/api/v1/concept-notes/route"));
});

describe("Concept Note run listing route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canAccessCity.mockResolvedValue(undefined);
  });

  it("returns the validated upstream order and forwards authenticated scope", async () => {
    const requestId = "cc-request-123";
    const runs = [
      runPayload("44444444-4444-4444-8444-444444444444"),
      runPayload("33333333-3333-4333-8333-333333333333"),
    ];
    callConceptNoteApi.mockResolvedValueOnce(Response.json({ runs }));

    const response = await listRuns(
      new Request("http://localhost", {
        headers: { "x-request-id": requestId },
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ runs });
    expect(canAccessCity).toHaveBeenCalledWith(context.session, cityId, {
      includeResource: false,
    });
    expect(callConceptNoteApi).toHaveBeenCalledWith({
      path: "/v1/concept-notes",
      userId: ownerId,
      requestId,
      searchParams: { user_id: ownerId, city_id: cityId },
    });
  });

  it("rejects unauthenticated requests before authorization or proxying", async () => {
    await expect(
      listRuns(new Request("http://localhost"), {
        ...context,
        session: null,
      }),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(canAccessCity).not.toHaveBeenCalled();
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });

  it("rejects an invalid city identifier before permission lookup", async () => {
    await expect(
      listRuns(new Request("http://localhost"), {
        ...context,
        searchParams: { city_id: "not-a-uuid" },
      }),
    ).rejects.toBeInstanceOf(ZodError);

    expect(canAccessCity).not.toHaveBeenCalled();
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });

  it("does not proxy a city access denial", async () => {
    canAccessCity.mockRejectedValueOnce(
      new createHttpError.Forbidden("City access denied"),
    );

    await expect(
      listRuns(new Request("http://localhost"), context),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });

  it("rejects a malformed successful upstream response", async () => {
    callConceptNoteApi.mockResolvedValueOnce(
      Response.json({ runs: [{ run_id: "missing-fields" }] }),
    );

    await expect(
      listRuns(new Request("http://localhost"), context),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("rejects a successful response containing another city's run", async () => {
    callConceptNoteApi.mockResolvedValueOnce(
      Response.json({
        runs: [runPayload("33333333-3333-4333-8333-333333333333", otherCityId)],
      }),
    );

    await expect(
      listRuns(new Request("http://localhost"), context),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("preserves upstream error status and payload", async () => {
    callConceptNoteApi.mockResolvedValueOnce(
      Response.json({ detail: "Authorization unavailable" }, { status: 503 }),
    );

    const response = await listRuns(new Request("http://localhost"), context);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      detail: "Authorization unavailable",
    });
  });
});
