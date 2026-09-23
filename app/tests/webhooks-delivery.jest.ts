import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { randomUUID } from "node:crypto";

import type { WebhookDelivery } from "@/models/WebhookDelivery";
import type { WebhookSubscription } from "@/models/WebhookSubscription";
import { verifyWebhookSignature } from "@/util/webhook-signature";

const findAll = jest.fn();
const destroyMock = jest.fn<() => Promise<number>>().mockResolvedValue(0);

jest.unstable_mockModule("@/models", () => ({
  db: {
    models: {
      WebhookDelivery: {
        findAll,
        destroy: destroyMock,
      },
    },
  },
}));

jest.unstable_mockModule("@/backend/webhooks/WebhookService", () => ({
  default: {
    decryptSecret: () => "test-signing-secret",
  },
}));

jest.unstable_mockModule("@/services/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

let processWebhookDeliveries: typeof import("@/backend/webhooks/WebhookDeliveryService").processWebhookDeliveries;

const SECRET = "test-signing-secret";

function makeSubscription(
  overrides: Partial<WebhookSubscription> = {},
): WebhookSubscription {
  const sub = {
    id: randomUUID(),
    enabled: true,
    consecutiveFailures: 0,
    disabledAt: null,
    url: "https://partner.example/hooks",
    update: jest.fn(async (fields: Record<string, unknown>) => {
      Object.assign(sub, fields);
    }),
    ...overrides,
  };
  return sub as unknown as WebhookSubscription;
}

function makeDelivery(
  subscription: WebhookSubscription,
  overrides: Partial<WebhookDelivery> = {},
): WebhookDelivery {
  const id = overrides.id ?? randomUUID();
  const delivery = {
    id,
    subscriptionId: subscription.id,
    eventType: "inventory.published",
    payload: {
      id,
      type: "inventory.published",
      created_at: "2026-08-10T08:00:00.000Z",
      data: { inventoryId: "inv-1" },
    },
    status: "pending",
    attemptCount: 0,
    subscription,
    update: jest.fn(async (fields: Record<string, unknown>) => {
      Object.assign(delivery, fields);
    }),
    ...overrides,
  };
  return delivery as unknown as WebhookDelivery;
}

beforeAll(async () => {
  ({ processWebhookDeliveries } = await import(
    "@/backend/webhooks/WebhookDeliveryService"
  ));
});

describe("webhook delivery worker", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  beforeEach(() => {
    findAll.mockReset();
    destroyMock.mockClear();
    destroyMock.mockResolvedValue(0);
  });

  it("POSTs a signed envelope and marks the delivery delivered on 2xx", async () => {
    const subscription = makeSubscription();
    const delivery = makeDelivery(subscription);
    findAll.mockResolvedValue([delivery]);
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response("", { status: 200 }),
    );

    await expect(processWebhookDeliveries()).resolves.toEqual({
      claimed: 1,
      delivered: 1,
      retried: 0,
      failed: 0,
      purged: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe(subscription.url);
    expect(init.method).toBe("POST");
    expect(init.headers["X-CityCatalyst-Event"]).toBe("inventory.published");
    expect(init.headers["X-CityCatalyst-Delivery"]).toBe(delivery.id);
    expect(
      verifyWebhookSignature({
        secret: SECRET,
        timestampSeconds: Number(init.headers["X-CityCatalyst-Timestamp"]),
        rawBody: init.body,
        signatureHeader: init.headers["X-CityCatalyst-Signature"],
      }),
    ).toBe(true);
    expect(delivery.status).toBe("delivered");
    expect(delivery.lastHttpStatus).toBe(200);
  });

  it("reschedules retryable HTTP failures with backoff", async () => {
    const subscription = makeSubscription();
    const delivery = makeDelivery(subscription);
    findAll.mockResolvedValue([delivery]);
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response("", { status: 503 }),
    );

    await expect(processWebhookDeliveries()).resolves.toEqual({
      claimed: 1,
      delivered: 0,
      retried: 1,
      failed: 0,
      purged: 0,
    });
    expect(delivery.status).toBe("pending");
    expect(delivery.attemptCount).toBe(1);
    expect(delivery.runAfter).toBeInstanceOf(Date);
    expect(subscription.consecutiveFailures).toBe(1);
    expect(subscription.enabled).toBe(true);
  });

  it("marks non-retryable 4xx as failed", async () => {
    const subscription = makeSubscription();
    const delivery = makeDelivery(subscription);
    findAll.mockResolvedValue([delivery]);
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response("", { status: 400 }),
    );

    await expect(processWebhookDeliveries()).resolves.toEqual({
      claimed: 1,
      delivered: 0,
      retried: 0,
      failed: 1,
      purged: 0,
    });
    expect(delivery.status).toBe("failed");
  });

  it("auto-disables a subscription after consecutive failures", async () => {
    const subscription = makeSubscription({ consecutiveFailures: 9 });
    const delivery = makeDelivery(subscription);
    findAll.mockResolvedValue([delivery]);
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response("", { status: 500 }),
    );

    await processWebhookDeliveries();
    expect(subscription.enabled).toBe(false);
    expect(subscription.disabledAt).toBeInstanceOf(Date);
    expect(subscription.consecutiveFailures).toBe(10);
  });
});
