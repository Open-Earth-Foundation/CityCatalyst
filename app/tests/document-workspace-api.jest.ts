import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { AppSession } from "@/lib/auth";

const runId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const cityId = "33333333-3333-4333-8333-333333333333";
const idempotencyKey = "44444444-4444-4444-8444-444444444444";
const loadRun = jest.fn<() => Promise<string>>();
const access = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const upstream = jest.fn<(...args: unknown[]) => Promise<Response>>();
const enabled = jest.fn<() => boolean>();

jest.unstable_mockModule("@/backend/ConceptNoteUploadService", () => ({
  loadConceptNoteRunCity: loadRun,
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity: access },
}));
jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi: upstream,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/util/feature-flags", () => ({
  FeatureFlags: { CONCEPT_NOTE_BUILDER: "cnb", CA_SERVICE_INTEGRATION: "ca" },
  hasServerFeatureFlag: enabled,
}));

const { forwardDocumentWorkspace } =
  await import("@/backend/document-workspace-api");
const session = { user: { id: userId } } as AppSession;
const context = { session, params: { runId, pointKey: "financing.request" } };
function request(body?: unknown): Request {
  return new Request("http://localhost/api/v1/concept-notes/workspace", {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  enabled.mockReturnValue(true);
  loadRun.mockResolvedValue(cityId);
  access.mockResolvedValue({ organizationId: "org" });
  upstream.mockResolvedValue(Response.json({ revision: 2 }));
});

describe("document workspace bridge", () => {
  it("binds the caller and rechecks target city for every read", async () => {
    const response = await forwardDocumentWorkspace(
      request(),
      context,
      "workspace",
    );
    expect(await response.json()).toEqual({ revision: 2 });
    expect(loadRun).toHaveBeenCalledWith({
      runId,
      userId,
      requestId: undefined,
    });
    expect(access).toHaveBeenCalledWith(session, cityId, {
      includeResource: false,
      requireActive: false,
    });
    expect(upstream).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/concept-notes/${runId}/workspace`,
        userId,
        searchParams: { user_id: userId },
        method: "GET",
      }),
    );
  });

  it.each(["setup", "commands", "exports"] as const)(
    "requires an active organization for %s",
    async (operation) => {
      access.mockRejectedValueOnce(new Error("organization frozen"));
      await expect(
        forwardDocumentWorkspace(request({}), context, operation),
      ).rejects.toThrow("organization frozen");
      expect(access).toHaveBeenCalledWith(
        session,
        cityId,
        expect.objectContaining({ requireActive: true }),
      );
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it("preserves a version conflict rather than reporting success", async () => {
    upstream.mockResolvedValueOnce(
      Response.json({ detail: "point_changed" }, { status: 409 }),
    );
    const body = {
      command: "answer",
      value: 40,
      expected_version: 3,
      idempotency_key: idempotencyKey,
    };
    const response = await forwardDocumentWorkspace(
      request(body),
      context,
      "commands",
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ detail: "point_changed" });
    expect(upstream).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/concept-notes/${runId}/points/financing.request/commands`,
        body,
      }),
    );
  });

  it.each([
    {
      command: "answer",
      expected_version: -1,
      idempotency_key: idempotencyKey,
    },
    { command: "answer", expected_version: 1, idempotency_key: "not-an-id" },
    {
      command: "answer",
      expected_version: 1,
      idempotency_key: idempotencyKey,
      user_id: "other",
    },
    {
      command: "answer",
      expected_version: 1,
      idempotency_key: idempotencyKey,
      value: "x".repeat(16001),
    },
  ])("rejects unsafe or invalid command %j", async (body) => {
    await expect(
      forwardDocumentWorkspace(request(body), context, "commands"),
    ).rejects.toThrow();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("does not read or forward unauthenticated state", async () => {
    await expect(
      forwardDocumentWorkspace(
        request(),
        { ...context, session: null },
        "workspace",
      ),
    ).rejects.toThrow("Authentication required");
    expect(loadRun).not.toHaveBeenCalled();
  });

  it("does not expose disabled feature state", async () => {
    enabled.mockReturnValue(false);
    await expect(
      forwardDocumentWorkspace(request(), context, "workspace"),
    ).rejects.toThrow("unavailable");
    expect(loadRun).not.toHaveBeenCalled();
  });

  it("does not forward when run ownership or city access is revoked", async () => {
    loadRun.mockRejectedValueOnce(new Error("run not found"));
    await expect(
      forwardDocumentWorkspace(request(), context, "workspace"),
    ).rejects.toThrow("run not found");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards the exact revision and mode for server export validation", async () => {
    const body = { mode: "final", expected_revision: 12 };
    await forwardDocumentWorkspace(request(body), context, "exports");
    expect(upstream).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: `/v1/concept-notes/${runId}/exports`,
        body,
      }),
    );
  });

  it("rejects an unsupported document methodology before forwarding setup", async () => {
    await expect(
      forwardDocumentWorkspace(
        request({
          document_type: "climate_action_plan",
          expected_revision: 2,
          idempotency_key: idempotencyKey,
        }),
        context,
        "setup",
      ),
    ).rejects.toThrow();
    expect(upstream).not.toHaveBeenCalled();
  });
});
