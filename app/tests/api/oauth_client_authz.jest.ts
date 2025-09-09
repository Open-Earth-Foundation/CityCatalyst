import { GET as listClientAuthz } from "@/app/api/v0/user/clients/route";

import {
  GET as getClientAuthz,
  DELETE as deleteClientAuthz,
} from "@/app/api/v0/user/clients/[client]/route";

import { db } from "@/models";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { OAuthClient, OAuthClientAttributes } from "@/models/OAuthClient";
import {
  OAuthClientI18N,
  OAuthClientI18NAttributes,
} from "@/models/OAuthClientI18N";
import {
  OAuthClientAuthz,
  OAuthClientAuthzAttributes,
} from "@/models/OAuthClientAuthz";
import { User, UserAttributes } from "@/models/User";
import {
  cascadeDeleteDataSource,
  createRequest,
  expectStatusCode,
  expectToBeLooselyEqual,
  mockRequest,
  setupTests,
  testUserID,
} from "../helpers";
import { setFeatureFlag, FeatureFlags } from "@/util/feature-flags";

const testClients: OAuthClientAttributes[] = [
  {
    clientId: "test-client-1",
    redirectURI: "https://test1.example/redirect",
  },
  {
    clientId: "test-client-2",
    redirectURI: "https://test2.example/redirect",
  },
  {
    clientId: "test-client-3",
    redirectURI: "https://test3.example/redirect",
  },
  {
    clientId: "test-client-4",
    redirectURI: "https://test4.example/redirect",
  },
];

const testClientI18Ns: OAuthClientI18NAttributes[] = [
  {
    clientId: "test-client-1",
    language: "en",
    name: "Test Client 1",
    description: "First test client for our API unit tests",
  },
  {
    clientId: "test-client-2",
    language: "en",
    name: "Test Client 2",
    description: "Second test client for our API unit tests",
  },
  {
    clientId: "test-client-3",
    language: "en",
    name: "Test Client 3",
    description: "Third test client for our API unit tests",
  },
  {
    clientId: "test-client-4",
    language: "en",
    name: "Test Client 4",
    description: "Fourth test client for our API unit tests",
  },
  {
    clientId: "test-client-1",
    language: "fr",
    name: "Client de Test 1",
    description: "Premier client de test pour nos tests unitaires d'API",
  },
  {
    clientId: "test-client-2",
    language: "es",
    name: "Cliente de Prueba 2",
  },
  {
    clientId: "test-client-3",
    language: "de",
    name: "Testkunde 3",
    description: "Dritter Testkunde für unsere API-Unit-Tests",
  },
];

const testOAuthClientAuthzs: OAuthClientAuthzAttributes[] = [
  {
    clientId: "test-client-1",
    userId: testUserID,
  },
  {
    clientId: "test-client-2",
    userId: testUserID,
  },
  {
    clientId: "test-client-3",
    userId: testUserID,
  },
];

const testClientDNE = "test-client-does-not-exist";

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

  describe("GET /api/v0/user/clients", () => {
    it("should return an array of client authorization objects", async () => {
      const req = mockRequest();
      const res = await listClientAuthz(req, { params: Promise.resolve({}) });
      expect(res.status).toEqual(200);
      const { data } = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toEqual(testOAuthClientAuthzs.length);
      for (const clientAuthz of testOAuthClientAuthzs) {
        let authz = data.find(
          (authz: any) => authz.client.clientId == clientAuthz.clientId,
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

  describe("GET /api/v0/user/clients/[client]", () => {
    it("should get the client object", async () => {
      const req = mockRequest();
      const clientAuthz = testOAuthClientAuthzs[0];
      const res = await getClientAuthz(req, {
        params: Promise.resolve({ client: clientAuthz.clientId }),
      });
      expect(res.status).toEqual(200);
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
      expect(res.status).toEqual(404);
    });

    it("should fail for an unauthorized client", async () => {
      const req = mockRequest();
      const res = await getClientAuthz(req, {
        params: Promise.resolve({ client: "test-client-4" }),
      });
      expect(res.status).toEqual(404);
    });
  });

  describe("DELETE /api/v0/user/clients/[client]", () => {
    it("should delete the authorization", async () => {
      const req = mockRequest();
      const res = await deleteClientAuthz(req, {
        params: Promise.resolve({ client: "test-client-3" }),
      });
      expect(res.status).toEqual(204);
    });

    it("should not be in the list of all clients", async () => {
      const req = mockRequest();
      const res = await listClientAuthz(req, { params: Promise.resolve({}) });
      expect(res.status).toEqual(200);
      const { data } = await res.json();
      expect(Array.isArray(data)).toBe(true);
      const found = data.find(
        (cl: any) => cl.client.clientId === "test-client-3",
      );
      expect(found).toBeUndefined();
    });

    it("should fail for a non-existent object", async () => {
      const req = mockRequest();
      const res = await deleteClientAuthz(req, {
        params: Promise.resolve({ client: testClientDNE }),
      });
      expect(res.status).toEqual(404);
    });

    it("should fail for an unauthorized client", async () => {
      const req = mockRequest();
      const res = await deleteClientAuthz(req, {
        params: Promise.resolve({ client: "test-client-4" }),
      });
      expect(res.status).toEqual(404);
    });
  });
});
