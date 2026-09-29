import { beforeEach, expect, it, jest } from "@jest/globals";
import { NextRequest } from "next/server";

const runId = "11111111-1111-4111-8111-111111111111";
const cityId = "33333333-3333-4333-8333-333333333333";

const callConceptNoteApi = jest.fn<() => Promise<Response>>();
const createEventStream = jest.fn<() => ReadableStream<Uint8Array>>();
const canAccessCity = jest.fn<() => Promise<void>>();

// Mock at the upstream boundary rather than stubbing apiHandler, so these cases
// exercise the real wrapper and the real run-city lookup that carries Retry-After.
jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/backend/ConceptNoteWorkspaceObserver", () => ({
  createConceptNoteWorkspaceEventStream: createEventStream,
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/lib/auth", () => ({
  Auth: {
    getServerSession: async () => ({
      user: { id: "owner-user", role: "user" },
    }),
  },
}));
jest.unstable_mockModule("@/lib/auth/access-token-validator", () => ({
  isPATToken: () => false,
  validatePAT: jest.fn(),
}));
jest.unstable_mockModule("@/models", () => ({ db: { initialized: true } }));
for (const name of ["OAuthClientAuthz", "OAuthClient", "Organization"]) {
  jest.unstable_mockModule(`@/models/${name}`, () => ({ [name]: {} }));
}
jest.unstable_mockModule("@/lib/highlight", () => ({ H: null }));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.unstable_mockModule("@/util/feature-flags", () => ({
  FeatureFlags: {},
  hasFeatureFlag: () => false,
  hasServerFeatureFlag: () => false,
}));

const { GET } = await import("@/app/api/v1/concept-notes/[runId]/events/route");

function request(resources: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/concept-notes/${runId}/events?resources=${resources}`,
  );
}

const params = { params: Promise.resolve({ runId }) };

beforeEach(() => {
  jest.clearAllMocks();
  callConceptNoteApi.mockResolvedValue(Response.json({ city_id: cityId }));
  canAccessCity.mockResolvedValue(undefined);
  createEventStream.mockReturnValue(
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
  );
});

it("authorizes once and returns a non-buffered event stream", async () => {
  const response = await GET(request("run,draft"), params);

  expect(canAccessCity).toHaveBeenCalledTimes(1);
  expect(createEventStream).toHaveBeenCalledWith(
    expect.objectContaining({
      resources: new Set(["run", "draft"]),
      runId,
      userId: "owner-user",
    }),
  );
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(response.headers.get("x-accel-buffering")).toBe("no");
});

it("rejects an invalid resource before loading the run", async () => {
  const response = await GET(request("proposal"), params);

  expect(response.status).toBe(400);
  expect(callConceptNoteApi).not.toHaveBeenCalled();
  expect(createEventStream).not.toHaveBeenCalled();
});

it.each(["60", "Tue, 22 Sep 2026 12:01:00 GMT"])(
  "preserves pre-stream Retry-After %s through the real API wrapper",
  async (retryAfter) => {
    callConceptNoteApi.mockResolvedValue(
      Response.json(
        { detail: "throttled" },
        { status: 429, headers: { "Retry-After": retryAfter } },
      ),
    );

    const response = await GET(request("draft"), params);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe(retryAfter);
    expect(createEventStream).not.toHaveBeenCalled();
  },
);
