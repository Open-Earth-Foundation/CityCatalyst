import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ZodError } from "zod";

const ownerId = "owner-user";
const cityId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "44444444-4444-4444-8444-444444444444";
const callConceptNoteApi = jest.fn<() => Promise<Response>>();

jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi,
  conceptNoteRunResponse: (response: Response) => response,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

type RouteContext = {
  session: { user: { id: string } } | null;
  params: { runId: string };
};

let renameRun: typeof import("@/app/api/v1/concept-notes/[runId]/route").PATCH;
let deleteRun: typeof import("@/app/api/v1/concept-notes/[runId]/route").DELETE;
let duplicateRun: typeof import("@/app/api/v1/concept-notes/[runId]/duplicate/route").POST;

const context: RouteContext = {
  session: { user: { id: ownerId } },
  params: { runId },
};

beforeAll(async () => {
  ({ PATCH: renameRun, DELETE: deleteRun } =
    await import("@/app/api/v1/concept-notes/[runId]/route"));
  ({ POST: duplicateRun } =
    await import("@/app/api/v1/concept-notes/[runId]/duplicate/route"));
});

describe("Concept Note lifecycle proxy routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("forwards a trimmed rename", async () => {
    callConceptNoteApi.mockResolvedValueOnce(
      Response.json({
        run_id: runId,
        city_id: cityId,
        name: "Cooling schools",
      }),
    );

    const response = await renameRun(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "x-request-id": "request-1" },
        body: JSON.stringify({ name: "  Cooling schools  " }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(callConceptNoteApi).toHaveBeenCalledWith({
      path: `/v1/concept-notes/${runId}`,
      userId: ownerId,
      method: "PATCH",
      body: { name: "Cooling schools" },
      requestId: "request-1",
      searchParams: { user_id: ownerId },
    });
  });

  it("forwards duplicate idempotency and preserves a conflict", async () => {
    callConceptNoteApi.mockResolvedValueOnce(
      Response.json(
        { detail: { code: "concept_note_lifecycle_conflict" } },
        { status: 409 },
      ),
    );

    const response = await duplicateRun(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(callConceptNoteApi).toHaveBeenCalledWith({
      path: `/v1/concept-notes/${runId}/duplicate`,
      userId: ownerId,
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      requestId: undefined,
      searchParams: { user_id: ownerId },
    });
  });

  it("forwards permanent delete and returns an empty 204", async () => {
    callConceptNoteApi.mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    const response = await deleteRun(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Idempotency-Key": idempotencyKey },
      }),
      context,
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(callConceptNoteApi).toHaveBeenCalledWith({
      path: `/v1/concept-notes/${runId}`,
      userId: ownerId,
      method: "DELETE",
      headers: { "Idempotency-Key": idempotencyKey },
      requestId: undefined,
      searchParams: { user_id: ownerId },
    });
  });

  it("requires authentication and a valid idempotency key", async () => {
    await expect(
      duplicateRun(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
        }),
        { ...context, session: null },
      ),
    ).rejects.toMatchObject({ statusCode: 401 });

    await expect(
      deleteRun(
        new Request("http://localhost", {
          method: "DELETE",
          headers: { "Idempotency-Key": "not-a-uuid" },
        }),
        context,
      ),
    ).rejects.toBeInstanceOf(ZodError);
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });
});
