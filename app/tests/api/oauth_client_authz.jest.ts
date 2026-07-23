import { GET as listClientAuthz } from "@/app/api/v1/user/clients/route";

import {
  DELETE as deleteClientAuthz,
  GET as getClientAuthz,
} from "@/app/api/v1/user/clients/[client]/route";

import { db } from "@/models";

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";

import { OAuthClient } from "@/models/OAuthClient";
import { OAuthClientAuthz } from "@/models/OAuthClientAuthz";
import { OAuthClientI18N } from "@/models/OAuthClientI18N";
import { FeatureFlags, setFeatureFlag } from "@/util/feature-flags";
import { expectStatusCode, mockRequest, setupTests } from "../helpers";
import {
  testClientDNE,
  testClientI18Ns,
  testClients,
  testOAuthClientAuthzs,
} from "./fixtures/oauth_client_authz";

describe("OAuth Client Authz API", () => {
  let oldFeatureFlag: boolean;
  beforeAll(async () => {
    setupTests();
    await db.initialize();
    oldFeatureFlag = setFeatureFlag(FeatureFlags.OAUTH_ENABLED, true);
    for (const client of testClients) {
      await OAuthClient.create(client);
    }
    for (const clientI18N of testClientI18Ns) {
      await OAuthClientI18N.create(clientI18N);
    }
    for (const clientAuthz of testOAuthClientAuthzs) {
      await OAuthClientAuthz.create(clientAuthz);
    }
  });

  afterAll(async () => {
    for (const clientAuthz of testOAuthClientAuthzs) {
      await OAuthClientAuthz.destroy({
        where: {
          clientId: clientAuthz.clientId,
          userId: clientAuthz.userId,
        },
      });
    }
    for (const clientI18N of testClientI18Ns) {
      await OAuthClientI18N.destroy({
        where: {
          clientId: clientI18N.clientId,
          language: clientI18N.language,
        },
      });
    }
    for (const client of testClients) {
      await OAuthClient.destroy({ where: { clientId: client.clientId } });
    }
    await db.sequelize?.close();
    setFeatureFlag(FeatureFlags.OAUTH_ENABLED, oldFeatureFlag);
  });

  describe("GET /api/v1/user/clients", () => {
    it("should return an array of client authorization objects", async () => {
      const req = mockRequest();
      const res = await listClientAuthz(req, { params: Promise.resolve({}) });
      await expectStatusCode(res, 200);
      const { data } = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toEqual(testOAuthClientAuthzs.length);
      for (const clientAuthz of testOAuthClientAuthzs) {
        const authz = data.find(
          (authz: { client: { clientId: string } }) =>
            authz.client.clientId == clientAuthz.clientId,
        );
        expect(authz).toBeDefined();
        expect(authz.client).toBeDefined();
        expect(authz.lastUsed).toBeDefined();
        expect(authz.created).toBeDefined();
        const client = authz.client;
        expect(client).toBeDefined();
        expect(typeof client).toBe("object");
        expect(typeof client.name).toBe("object");
        expect(client.name).not.toBeNull();
        expect(typeof client.description).toBe("object");
        expect(client.description).not.toBeNull();
        expect(typeof client.redirectURI).toBe("string");
      }
    });
  });

  describe("GET /api/v1/user/clients/[client]", () => {
    it("should get the client object", async () => {
      const req = mockRequest();
      const clientAuthz = testOAuthClientAuthzs[0];
      const res = await getClientAuthz(req, {
        params: Promise.resolve({ client: clientAuthz.clientId }),
      });
      await expectStatusCode(res, 200);
      const { data } = await res.json();
      expect(data.lastUsed).toBeDefined();
      expect(data.created).toBeDefined();
      expect(typeof data.created).toEqual("string");
      expect(data.client).toBeDefined();
      expect(typeof data.client).toEqual("object");
      expect(data.client).not.toBeNull();
      const client = data.client;
      expect(client.clientId).toEqual(clientAuthz.clientId);
    });

    it("should fail for a non-existent object", async () => {
      const req = mockRequest();
      const res = await getClientAuthz(req, {
        params: Promise.resolve({ client: testClientDNE }),
      });
      await expectStatusCode(res, 404);
    });

    it("should fail for an unauthorized client", async () => {
      const req = mockRequest();
      const res = await getClientAuthz(req, {
        params: Promise.resolve({ client: "test-client-4" }),
      });
      await expectStatusCode(res, 404);
    });
  });

  describe("DELETE /api/v1/user/clients/[client]", () => {
    it("should delete the authorization", async () => {
      const req = mockRequest();
      const res = await deleteClientAuthz(req, {
        params: Promise.resolve({ client: "test-client-3" }),
      });
      await expectStatusCode(res, 204);
    });

    it("should not be in the list of all clients", async () => {
      const req = mockRequest();
      const res = await listClientAuthz(req, { params: Promise.resolve({}) });
      await expectStatusCode(res, 200);
      const { data } = await res.json();
      expect(Array.isArray(data)).toBe(true);
      const found = data.find(
        (cl: { client: { clientId: string } }) =>
          cl.client.clientId === "test-client-3",
      );
      expect(found).toBeUndefined();
    });

    it("should fail for a non-existent object", async () => {
      const req = mockRequest();
      const res = await deleteClientAuthz(req, {
        params: Promise.resolve({ client: testClientDNE }),
      });
      await expectStatusCode(res, 404);
    });

    it("should fail for an unauthorized client", async () => {
      const req = mockRequest();
      const res = await deleteClientAuthz(req, {
        params: Promise.resolve({ client: "test-client-4" }),
      });
      await expectStatusCode(res, 404);
    });
  });
});
