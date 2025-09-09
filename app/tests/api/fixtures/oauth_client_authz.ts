import { OAuthClientAttributes } from "@/models/OAuthClient";
import { OAuthClientI18NAttributes } from "@/models/OAuthClientI18N";
import { OAuthClientAuthzAttributes } from "@/models/OAuthClientAuthz";
import { testUserID } from "../../helpers";

export const testClients: OAuthClientAttributes[] = [
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

export const testClientI18Ns: OAuthClientI18NAttributes[] = [
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

export const testOAuthClientAuthzs: OAuthClientAuthzAttributes[] = [
  {
    clientId: "test-client-1",
    userId: testUserID,
    created: new Date(),
  },
  {
    clientId: "test-client-2",
    userId: testUserID,
    created: new Date(),
  },
  {
    clientId: "test-client-3",
    userId: testUserID,
    created: new Date(),
  },
];

export const testClientDNE = "test-client-does-not-exist";
