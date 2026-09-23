import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { randomBytes, randomUUID } from "node:crypto";

import {
  DELETE as deleteWebhook,
  GET as getWebhook,
  PATCH as patchWebhook,
} from "@/app/api/v1/organizations/[organization]/webhooks/[webhook]/route";
import { POST as rotateWebhookSecret } from "@/app/api/v1/organizations/[organization]/webhooks/[webhook]/rotate-secret/route";
import {
  GET as listWebhooks,
  POST as createWebhook,
} from "@/app/api/v1/organizations/[organization]/webhooks/route";
import WebhookService from "@/backend/webhooks/WebhookService";
import { AppSession, Auth } from "@/lib/auth";
import { db } from "@/models";
import { Roles } from "@/util/types";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  testUserID,
} from "../helpers";
import {
  cleanupTestData,
  createTestData,
  type TestData,
} from "../helpers/testDataCreationHelper";

const mockAdminSession: AppSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
};

const mockUserSession: AppSession = {
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};

const createBody = {
  name: "Partner webhook",
  url: "https://partner.example/hooks/cc",
  events: ["inventory.published"],
};

describe("Organization webhook API", () => {
  const prevGetServerSession = Auth.getServerSession;
  let prevEncryptionKey: string | undefined;
  let testData: TestData;
  let organizationParams: { params: Promise<{ organization: string }> };

  beforeAll(async () => {
    prevEncryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    setupTests();
    await db.initialize();
    testData = await createTestData({
      organizationName: "Webhook API Test Org",
    });
    mockAdminSession.user.id = testData.userId;
    mockUserSession.user.id = testData.userId;
    organizationParams = {
      params: Promise.resolve({ organization: testData.organizationId }),
    };
  });

  beforeEach(async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));
    await db.models.WebhookSubscription.destroy({
      where: { organizationId: testData.organizationId },
    });
  });

  afterAll(async () => {
    Auth.getServerSession = prevGetServerSession;
    if (prevEncryptionKey === undefined) {
      delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    } else {
      process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = prevEncryptionKey;
    }
    if (testData) {
      await db.models.WebhookSubscription.destroy({
        where: { organizationId: testData.organizationId },
      });
      await cleanupTestData(testData);
    }
    if (db.sequelize) await db.sequelize.close();
  });

  it("creates a subscription and returns the signing secret once", async () => {
    const res = await createWebhook(mockRequest(createBody), organizationParams);
    await expectStatusCode(res, 200);
    const { data } = await res.json();
    expect(data.secret).toEqual(expect.any(String));
    expect(data.secret.length).toBeGreaterThan(8);
    expect(data.url).toBe(createBody.url);
    expect(data.events).toEqual(["inventory.published"]);
    expect(data).not.toHaveProperty("secretCiphertext");

    const listed = await listWebhooks(mockRequest(), organizationParams);
    await expectStatusCode(listed, 200);
    const listBody = await listed.json();
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].secret).toBeUndefined();
    expect(listBody.data[0].id).toBe(data.id);

    const got = await getWebhook(mockRequest(), {
      params: Promise.resolve({
        organization: testData.organizationId,
        webhook: data.id,
      }),
    });
    await expectStatusCode(got, 200);
    const getBody = await got.json();
    expect(getBody.data.secret).toBeUndefined();
    expect(getBody.data.secretPrefix).toBe(data.secretPrefix);
  });

  it("rejects non-admins from managing webhooks", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockUserSession));
    const res = await createWebhook(mockRequest(createBody), organizationParams);
    await expectStatusCode(res, 403);
  });

  it("rejects http URLs and unknown event types", async () => {
    const httpRes = await createWebhook(
      mockRequest({ ...createBody, url: "http://partner.example/hooks" }),
      organizationParams,
    );
    await expectStatusCode(httpRes, 400);

    const eventRes = await createWebhook(
      mockRequest({ ...createBody, events: ["inventory.created"] }),
      organizationParams,
    );
    await expectStatusCode(eventRes, 400);
  });

  it("updates, rotates, and deletes a subscription", async () => {
    const created = await createWebhook(
      mockRequest(createBody),
      organizationParams,
    );
    const { data } = await created.json();
    const webhookParams = {
      params: Promise.resolve({
        organization: testData.organizationId,
        webhook: data.id,
      }),
    };

    const patched = await patchWebhook(
      mockRequest({
        name: "Updated hook",
        events: ["inventory.published", "plan.generated"],
        enabled: false,
      }),
      webhookParams,
    );
    await expectStatusCode(patched, 200);
    const patchedBody = await patched.json();
    expect(patchedBody.data.name).toBe("Updated hook");
    expect(patchedBody.data.enabled).toBe(false);
    expect(patchedBody.data.secret).toBeUndefined();

    const rotated = await rotateWebhookSecret(mockRequest(), webhookParams);
    await expectStatusCode(rotated, 200);
    const rotatedBody = await rotated.json();
    expect(rotatedBody.data.secret).toEqual(expect.any(String));
    expect(rotatedBody.data.secret).not.toBe(data.secret);
    expect(rotatedBody.data.secretPrefix).not.toBe(data.secretPrefix);

    const deleted = await deleteWebhook(mockRequest(), webhookParams);
    await expectStatusCode(deleted, 200);
    const missing = await getWebhook(mockRequest(), webhookParams);
    await expectStatusCode(missing, 404);
  });

  it("queues outbox rows only for matching enabled subscriptions", async () => {
    const matching = await WebhookService.create({
      organizationId: testData.organizationId,
      name: "Match",
      url: "https://partner.example/a",
      events: ["inventory.published"],
    });
    await WebhookService.create({
      organizationId: testData.organizationId,
      name: "Other event",
      url: "https://partner.example/b",
      events: ["plan.generated"],
    });
    const disabled = await WebhookService.create({
      organizationId: testData.organizationId,
      name: "Disabled",
      url: "https://partner.example/c",
      events: ["inventory.published"],
    });
    await WebhookService.update(
      testData.organizationId,
      disabled.subscription.id,
      { enabled: false },
    );

    await WebhookService.emitForCity(testData.cityId, "inventory.published", {
      inventoryId: randomUUID(),
      cityId: testData.cityId,
      year: 2024,
    });

    const deliveries = await db.models.WebhookDelivery.findAll({
      where: { subscriptionId: matching.subscription.id },
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].subscriptionId).toBe(matching.subscription.id);
    expect(deliveries[0].status).toBe("pending");
    expect(deliveries[0].eventType).toBe("inventory.published");
    expect(deliveries[0].payload.type).toBe("inventory.published");
    expect(deliveries[0].payload.data.organizationId).toBe(
      testData.organizationId,
    );
    expect(deliveries[0].payload.id).toBe(deliveries[0].id);
  });

  it("does not fail emit when organization resolution misses", async () => {
    await expect(
      WebhookService.emitForCity(randomUUID(), "plan.generated", {
        planId: randomUUID(),
      }),
    ).resolves.toBeUndefined();
  });
});
