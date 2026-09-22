import { expect, it, jest } from "@jest/globals";
import { NextRequest } from "next/server";

const callConceptNoteApi = jest.fn<() => Promise<Response>>();
const createEventStream = jest.fn();
jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/backend/ConceptNoteWorkspaceObserver", () => ({
  createConceptNoteWorkspaceEventStream: createEventStream,
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity: jest.fn() },
}));
jest.unstable_mockModule("@/lib/auth", () => ({
  Auth: {
    getServerSession: async () => ({ user: { id: "owner", role: "user" } }),
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

it.each(["60", "Tue, 22 Sep 2026 12:01:00 GMT"])(
  "preserves pre-stream Retry-After %s through the real API wrapper",
  async (retryAfter) => {
    callConceptNoteApi.mockResolvedValue(
      Response.json(
        { detail: "throttled" },
        {
          status: 429,
          headers: { "Retry-After": retryAfter },
        },
      ),
    );
    const runId = "11111111-1111-4111-8111-111111111111";
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/concept-notes/${runId}/events?resources=draft`,
      ),
      {
        params: Promise.resolve({ runId }),
      },
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe(retryAfter);
    expect(createEventStream).not.toHaveBeenCalled();
  },
);
