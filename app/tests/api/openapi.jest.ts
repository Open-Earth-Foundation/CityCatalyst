import { GET as getOpenAPISpec } from "@/app/api/openapi/json/route";
import { db } from "@/models";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { mockRequest, setupTests } from "../helpers";
import packageJson from "@/../package.json";

describe("OpenAPI Specification Endpoint", () => {
  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });

  afterAll(async () => {
    await db.sequelize?.close();
  });

  describe("GET /api/openapi/json", () => {
    let openApiSpec: any;

    it("should return a JSON response with 200 status", async () => {
      const req = mockRequest();
      const res = await getOpenAPISpec(req, { params: Promise.resolve({}) });

      expect(res.status).toEqual(200);
      expect(res.headers.get("Content-Type")).toEqual("application/json");

      openApiSpec = await res.json();
      expect(typeof openApiSpec).toBe("object");
    });

    it("should have valid OpenAPI 3.0 structure", () => {
      expect(openApiSpec).toHaveProperty("openapi");
      expect(openApiSpec.openapi).toBe("3.0.0");

      expect(openApiSpec).toHaveProperty("info");
      expect(openApiSpec.info).toHaveProperty("title");
      expect(openApiSpec.info).toHaveProperty("version");
    });

    it("should have correct API metadata", () => {
      expect(openApiSpec.info.title).toBe("CityCatalyst API");
      expect(openApiSpec.info.version).toBe(packageJson.version);
    });

    it("should have security schemes defined", () => {
      expect(openApiSpec).toHaveProperty("components");
      expect(openApiSpec.components).toHaveProperty("securitySchemes");
      expect(openApiSpec.components.securitySchemes).toHaveProperty("BearerAuth");

      const bearerAuth = openApiSpec.components.securitySchemes.BearerAuth;
      expect(bearerAuth.type).toBe("http");
      expect(bearerAuth.scheme).toBe("bearer");
      expect(bearerAuth.bearerFormat).toBe("JWT");
    });

    it("should have documented API paths", () => {
      expect(openApiSpec).toHaveProperty("paths");
      expect(typeof openApiSpec.paths).toBe("object");

      const pathCount = Object.keys(openApiSpec.paths).length;
      expect(pathCount).toBeGreaterThan(0);
    });

    it("should include core API endpoints", () => {
      const paths = Object.keys(openApiSpec.paths);

      // Check for some core endpoints that should always exist
      expect(paths).toContain("/api/v1/organizations");
      expect(paths).toContain("/api/v1/user/whoami");
      expect(paths).toContain("/api/v1/check/health");
    });

    it("should have properly structured path definitions", () => {
      const samplePath = "/api/v1/organizations";
      expect(openApiSpec.paths).toHaveProperty(samplePath);

      const pathDefinition = openApiSpec.paths[samplePath];
      expect(typeof pathDefinition).toBe("object");

      // Should have HTTP methods defined
      const methods = Object.keys(pathDefinition);
      expect(methods.length).toBeGreaterThan(0);

      // Each method should have proper structure
      methods.forEach(method => {
        const methodDef = pathDefinition[method];
        expect(methodDef).toHaveProperty("tags");
        expect(methodDef).toHaveProperty("summary");
        expect(methodDef).toHaveProperty("responses");
      });
    });

    it("should have consistent API versioning", () => {
      const paths = Object.keys(openApiSpec.paths);

      // Most paths should be under /api/v1/
      const v1Paths = paths.filter(path => path.startsWith("/api/v1/"));
      expect(v1Paths.length).toBeGreaterThan(0);

      // Should represent majority of documented endpoints
      expect(v1Paths.length / paths.length).toBeGreaterThan(0.8);
    });

    it("should have appropriate cache headers", async () => {
      const req = mockRequest();
      const res = await getOpenAPISpec(req, { params: Promise.resolve({}) });

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=3600");
    });
  });
});