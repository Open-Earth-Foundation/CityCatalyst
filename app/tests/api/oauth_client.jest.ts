import {
  GET as listClients,
  POST as addClient,
} from "@/app/api/v0/client/route";

import {
  GET as getClient,
  DELETE as removeClient,
} from "@/app/api/v0/client/[client]/route";

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
  cascadeDeleteDataSource,
  createRequest,
  expectStatusCode,
  expectToBeLooselyEqual,
  mockRequest,
  setupTests,
  testUserID,
} from "../helpers";

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

const clientCreationArgs: any = {
  redirectUri: "https://created.example/api/callback/whatever",
  name: {
    en: "A client getting created",
    fr: "Un client à créer",
    es: "Cliente para pruebar",
  },
  description: {
    en: "This great client is perfect for testing.",
    es: "Este cliente es perfecto para pruebar",
  },
};

const testClientDNE = "test-client-does-not-exist";

describe("OAuth Client API", () => {
  beforeAll(async () => {
    setupTests();
    await db.initialize();
    for (const client of testClients) {
      await OAuthClient.create(client);
    }
    for (const clientI18N of testClientI18Ns) {
      await OAuthClientI18N.create(clientI18N);
    }
  });

  afterAll(async () => {
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
  });

  describe("GET /api/v0/client", () => {
    it("should return an array of OAuth2.0 client objects with name and description in different languages", async () => {
      const req = mockRequest();
      const res = await listClients(req, {});
      expect(res.status).toEqual(200);
      const { data } = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(3);
      for (const testClient of testClients) {
        let client = data.find((c: any) => c.clientId == testClient.clientId);
        expect(client).toBeDefined();
        expect(client.redirectUri).toEqual(testClient.redirectURI);
        expect(typeof client.name).toBe("object");
        expect(client.name).not.toBeNull();
        expect(typeof client.description).toBe("object");
        expect(client.description).not.toBeNull();
        const clientI18Ns = testClientI18Ns.filter(
          (ci) => ci.clientId == client.clientId,
        );
        for (const clientI18N of clientI18Ns) {
          if (clientI18N.name) {
            expect(client.name[clientI18N.language]).toBeDefined();
            expect(client.name[clientI18N.language]).toEqual(clientI18N.name);
          } else {
            expect(client.name[clientI18N.language]).not.toBeDefined();
          }
          if (clientI18N.description) {
            expect(client.description[clientI18N.language]).toBeDefined();
            expect(client.description[clientI18N.language]).toEqual(
              clientI18N.description,
            );
          } else {
            expect(client.description[clientI18N.language]).not.toBeDefined();
          }
        }
      }
    });
  });

  describe("POST /api/v0/client", () => {
    let createdClientId: string;

    it("should create a new OAuth2.0 client object", async () => {
      const req = mockRequest(clientCreationArgs);
      const res = await addClient(req, {});
      expect(res.status).toEqual(201);
      expect(res.headers.get("location")).toBeDefined();
      const { data } = await res.json();
      expect(data.clientId).toBeDefined();
      createdClientId = data.clientId;
      expect(data.redirectUri).toEqual(clientCreationArgs.redirectUri);
      expect(typeof data.name).toEqual("object");
      expect(data.name).not.toBeNull();
      expect(data.name.en).toEqual(clientCreationArgs.name.en);
      expect(data.name.fr).toEqual(clientCreationArgs.name.fr);
      expect(typeof data.description).toEqual("object");
      expect(data.description).not.toBeNull();
      expect(data.description.en).toEqual(clientCreationArgs.description.en);
      expect(data.description.es).toEqual(clientCreationArgs.description.es);
    });

    it("should be in the list of all clients", async () => {
      const req = mockRequest();
      const res = await listClients(req, {});
      expect(res.status).toEqual(200);
      const { data } = await res.json();
      expect(Array.isArray(data)).toBe(true);
      const found = data.find((cl: any) => cl.clientId === createdClientId);
      expect(found).toBeDefined();
    });

    afterAll(async () => {
      if (createdClientId) {
        for (const language of ["en", "fr", "es"]) {
          await OAuthClientI18N.destroy({
            where: {
              clientId: createdClientId,
              language,
            },
          });
        }
        await OAuthClient.destroy({ where: { clientId: createdClientId } });
      }
    });
  });

  describe("GET /api/v0/client/[client]", () => {
    it("should get the client object", async () => {
      const req = mockRequest();
      const client = testClients[0];
      const res = await getClient(req, {
        params: Promise.resolve({ client: client.clientId }),
      });
      expect(res.status).toEqual(200);
      const { data } = await res.json();
      expect(data.clientId).toEqual(client.clientId);
      expect(data.redirectUri).toEqual(client.redirectURI);
      const i18nEn = testClientI18Ns.find(
        (cl) => cl.clientId == client.clientId && cl.language == "en",
      );
      if (!i18nEn) {
        throw new Error(`No English i18n descriptors for ${client.clientId}`);
      }
      expect(data.name.en).toEqual(i18nEn.name);
      expect(data.description.en).toEqual(i18nEn.description);
      const i18nFr = testClientI18Ns.find(
        (cl) => cl.clientId == client.clientId && cl.language == "fr",
      );
      if (!i18nFr) {
        throw new Error(`No French i18n descriptors for ${client.clientId}`);
      }
      expect(data.name.fr).toEqual(i18nFr.name);
      expect(data.description.fr).toEqual(i18nFr.description);
    });

    it("should fail for a non-existent object", async () => {
      const req = mockRequest();
      const res = await getClient(req, {
        params: Promise.resolve({ client: testClientDNE }),
      });
      expect(res.status).toEqual(404);
    });
  });

  describe("DELETE /api/v0/client/[client]", () => {
    const toDelete: OAuthClientAttributes = {
      clientId: "test-client-to-delete",
      redirectURI: "https://deleteme.example/callback",
    };
    const toDeleteI18N: OAuthClientI18NAttributes[] = [
      {
        clientId: toDelete.clientId,
        language: "en",
        name: "Test Client to Delete",
        description: "This is a great test client to delete",
      },
      {
        clientId: toDelete.clientId,
        language: "fr",
        name: "Un client à supprimer",
        description: "Ceci est un merveilleux client à supprimer",
      },
    ];

    beforeAll(async () => {
      await OAuthClient.create(toDelete);
      for (const clientI18N of toDeleteI18N) {
        await OAuthClientI18N.create(clientI18N);
      }
    });

    afterAll(async () => {
      // clean these up if needed
      for (const clientI18N of toDeleteI18N) {
        await OAuthClientI18N.destroy({
          where: {
            clientId: clientI18N.clientId,
            language: clientI18N.language,
          },
        });
      }
      await OAuthClient.destroy({ where: { clientId: toDelete.clientId } });
    });

    it("should delete the client object", async () => {
      const req = mockRequest();
      const res = await removeClient(req, {
        params: Promise.resolve({ client: toDelete.clientId }),
      });
      expect(res.status).toEqual(204);
    });

    it("should not be in the list of all clients", async () => {
      const req = mockRequest();
      const res = await listClients(req, {});
      expect(res.status).toEqual(200);
      const { data } = await res.json();
      expect(Array.isArray(data)).toBe(true);
      const found = data.find((cl: any) => cl.clientId === toDelete.clientId);
      expect(found).toBeUndefined();
    });

    it("should fail for a non-existent object", async () => {
      const req = mockRequest();
      const res = await removeClient(req, {
        params: Promise.resolve({ client: testClientDNE }),
      });
      expect(res.status).toEqual(404);
    });
  });
});
