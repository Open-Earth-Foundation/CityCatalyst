import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { NextRequest } from "next/server";

const enforceRetentionPolicies = jest.fn<() => Promise<{ runId: string }>>();
const initialize = jest.fn<() => Promise<void>>();

jest.unstable_mockModule("@/models", () => ({
  db: { initialized: false, initialize },
}));
jest.unstable_mockModule("@/backend/gdpr/RetentionService", () => ({
  enforceRetentionPolicies,
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

let POST: typeof import("@/app/api/v1/cron/enforce-retention/route").POST;
const routeContext = { params: Promise.resolve({}) };

beforeAll(async () => {
  ({ POST } = await import("@/app/api/v1/cron/enforce-retention/route"));
});

describe("retention cron authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CC_CRON_JOB_API_KEY = "cron-secret";
    enforceRetentionPolicies.mockResolvedValue({ runId: "run-1" });
  });

  it.each([undefined, "Bearer wrong"])("rejects %s", async (authorization) => {
    const request = new NextRequest(
      "http://localhost/api/v1/cron/enforce-retention",
      {
        method: "POST",
        headers: authorization ? { Authorization: authorization } : {},
      },
    );
    expect((await POST(request, routeContext)).status).toBe(401);
    expect(enforceRetentionPolicies).not.toHaveBeenCalled();
  });

  it("runs retention for a valid secret", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/cron/enforce-retention",
      {
        method: "POST",
        headers: { Authorization: "Bearer cron-secret" },
      },
    );
    const response = await POST(request, routeContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ runId: "run-1" });
    expect(enforceRetentionPolicies).toHaveBeenCalled();
  });
});
