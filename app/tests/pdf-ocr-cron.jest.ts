import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { NextRequest } from "next/server";

const processOcr =
  jest.fn<() => Promise<{ claimed: number; resumed: number }>>();
const processDeliveries = jest.fn<() => Promise<number>>();
const initialize = jest.fn<() => Promise<void>>();

jest.unstable_mockModule("@/models", () => ({
  db: { initialized: false, initialize },
}));
jest.unstable_mockModule("@/backend/PdfOcrService", () => ({
  processPdfOcrJobs: processOcr,
}));
jest.unstable_mockModule("@/backend/PdfOcrDeliveryService", () => ({
  processPdfOcrDeliveries: processDeliveries,
  resolvePdfOcrDeliverySource: jest.fn(),
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

let POST: typeof import("@/app/api/v1/cron/process-pdf-ocr-jobs/route").POST;
const routeContext = { params: Promise.resolve({}) };

beforeAll(async () => {
  ({ POST } = await import("@/app/api/v1/cron/process-pdf-ocr-jobs/route"));
});

describe("PDF OCR cron authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CC_CRON_JOB_API_KEY = "cron-secret";
    processOcr.mockResolvedValue({ claimed: 2, resumed: 1 });
    processDeliveries.mockResolvedValue(0);
  });

  it.each([undefined, "Bearer wrong"])("rejects %s", async (authorization) => {
    const request = new NextRequest(
      "http://localhost/api/v1/cron/process-pdf-ocr-jobs",
      {
        method: "POST",
        headers: authorization ? { Authorization: authorization } : {},
      },
    );
    expect((await POST(request, routeContext)).status).toBe(401);
    expect(processOcr).not.toHaveBeenCalled();
  });

  it("processes no more than the worker service claims for a valid secret", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/cron/process-pdf-ocr-jobs",
      {
        method: "POST",
        headers: { Authorization: "Bearer cron-secret" },
      },
    );
    const response = await POST(request, routeContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      claimed: 2,
      resumed: 1,
      deliveries: 0,
    });
  });
});
