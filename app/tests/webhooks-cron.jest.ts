import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { NextRequest } from "next/server";

const processDeliveries = jest.fn<
  () => Promise<{
    claimed: number;
    delivered: number;
    retried: number;
    failed: number;
    purged: number;
  }>
>();
const initialize = jest.fn<() => Promise<void>>();

jest.unstable_mockModule("@/models", () => ({
  db: { initialized: false, initialize },
}));
jest.unstable_mockModule("@/backend/webhooks/WebhookDeliveryService", () => ({
  processWebhookDeliveries: processDeliveries,
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

let POST: typeof import("@/app/api/v1/cron/process-webhook-deliveries/route").POST;
const routeContext = { params: Promise.resolve({}) };

beforeAll(async () => {
  ({ POST } = await import(
    "@/app/api/v1/cron/process-webhook-deliveries/route"
  ));
});

describe("webhook delivery cron authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CC_CRON_JOB_API_KEY = "cron-secret";
    processDeliveries.mockResolvedValue({
      claimed: 2,
      delivered: 1,
      retried: 1,
      failed: 0,
      purged: 0,
    });
  });

  it.each([undefined, "Bearer wrong"])("rejects %s", async (authorization) => {
    const request = new NextRequest(
      "http://localhost/api/v1/cron/process-webhook-deliveries",
      {
        method: "POST",
        headers: authorization ? { Authorization: authorization } : {},
      },
    );
    expect((await POST(request, routeContext)).status).toBe(401);
    expect(processDeliveries).not.toHaveBeenCalled();
  });

  it("processes due deliveries for a valid secret", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/cron/process-webhook-deliveries",
      {
        method: "POST",
        headers: { Authorization: "Bearer cron-secret" },
      },
    );
    const response = await POST(request, routeContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      claimed: 2,
      delivered: 1,
      retried: 1,
      failed: 0,
      purged: 0,
    });
  });
});
