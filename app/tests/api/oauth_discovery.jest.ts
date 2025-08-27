import {
  GET as getMetadata,
} from "@/app/api/v0/oauth/metadata/route";

import { db } from "@/models";

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  mockRequest,
  setupTests,
} from "../helpers";

import { setFeatureFlag, FeatureFlags } from "@/util/feature-flags";

const URL_REGEX = /^https?:\/\/(?:(?:[a-z0-9-]+\.)+[a-z]{2,}|localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d{2,5})?(?:\/\S*)?$/

describe('OAuth 2.0 Authorization Server Metadata', () => {

  let oldFeatureFlag: boolean;
  beforeAll(async () => {
    setupTests();
    await db.initialize();
    oldFeatureFlag = setFeatureFlag(FeatureFlags.OAUTH_ENABLED, true);
  });

  afterAll(async () => {
    await db.sequelize?.close();
    setFeatureFlag(FeatureFlags.OAUTH_ENABLED, oldFeatureFlag);
  });

  describe("GET /.well-known/oauth-authorization-server", () => {
    let metadata: Record<string,string>

    it('should return a JSON object', async () => {
      const req = mockRequest();
      const res = await getMetadata(req, { params: Promise.resolve({}) });
      expect(res.status).toEqual(200);
      expect(res.headers.get('Content-Type')).toEqual('application/json')
      metadata = await res.json();
      expect(typeof metadata).toBe('object');
    })

    it('should have an issuer', () => {
      expect(metadata).toHaveProperty('issuer');
      expect(typeof metadata.issuer).toBe('string');
      expect(metadata.issuer).toMatch(URL_REGEX);
    })

    it('should have an authorization endpoint', () => {
      expect(metadata).toHaveProperty('authorization_endpoint');
      expect(typeof metadata.authorization_endpoint).toBe('string');
      expect(metadata.authorization_endpoint).toMatch(URL_REGEX);
    })

    it('should have a token endpoint', () => {
      expect(metadata).toHaveProperty('token_endpoint');
      expect(typeof metadata.token_endpoint).toBe('string');
      expect(metadata.token_endpoint).toMatch(URL_REGEX);
    })

    it('should have a list of scopes supported', () => {
      expect(metadata).toHaveProperty('scopes_supported');
      expect(Array.isArray(metadata.scopes_supported)).toBeTruthy();
      expect(metadata.scopes_supported).toContain('read');
      expect(metadata.scopes_supported).toContain('write');
    })

    it('should have a list of response types supported', () => {
      expect(metadata).toHaveProperty('response_types_supported');
      expect(Array.isArray(metadata.response_types_supported)).toBeTruthy();
      expect(metadata.response_types_supported).toContain('code');
    })

    it('should have a list of grant types supported', () => {
      expect(metadata).toHaveProperty('grant_types_supported');
      expect(Array.isArray(metadata.grant_types_supported)).toBeTruthy();
      expect(metadata.grant_types_supported).toContain('authorization_code');
      expect(metadata.grant_types_supported).toContain('refresh_token');
    })

    it('should have a service documentation URL', () => {
      expect(metadata).toHaveProperty('service_documentation');
      expect(typeof metadata.issuer).toBe('string');
      expect(metadata.service_documentation).toMatch(URL_REGEX);
    })

    it('should have a list of UI locales supported', () => {
      expect(metadata).toHaveProperty('ui_locales_supported');
      expect(Array.isArray(metadata.ui_locales_supported)).toBeTruthy();
      expect(metadata.ui_locales_supported).toContain('de');
      expect(metadata.ui_locales_supported).toContain('en');
      expect(metadata.ui_locales_supported).toContain('es');
      expect(metadata.ui_locales_supported).toContain('fr');
      expect(metadata.ui_locales_supported).toContain('pt');
    })

    it('should have a list of code challenge methods supported', () => {
      expect(metadata).toHaveProperty('code_challenge_methods_supported');
      expect(Array.isArray(metadata.code_challenge_methods_supported)).toBeTruthy();
      expect(metadata.code_challenge_methods_supported).toContain('S256');
    })
  });
});