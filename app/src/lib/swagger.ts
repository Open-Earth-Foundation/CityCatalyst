import { createSwaggerSpec } from "next-swagger-doc";
import fs from "fs";
import path from "path";

export const getApiDocs = async () => {
  // Try to use the pre-generated spec first
  try {
    const specPath = path.join(process.cwd(), "public", "openapi-spec.json");
    if (fs.existsSync(specPath)) {
      const specContent = fs.readFileSync(specPath, "utf-8");
      const preGeneratedSpec = JSON.parse(specContent);
      // Only use pre-generated spec if it has actual paths (not empty)
      if (preGeneratedSpec.paths && Object.keys(preGeneratedSpec.paths).length > 0) {
        return preGeneratedSpec;
      }
    }
  } catch (error) {
    console.warn("Failed to load pre-generated OpenAPI spec, falling back to dynamic generation:", error);
  }

  // Fallback to dynamic generation if pre-generated spec doesn't exist or is empty
  const spec = createSwaggerSpec({
    apiFolder: "src/app/api/v1",
    definition: {
      openapi: "3.0.0",
      info: {
        title: "CityCatalyst API",
        version: "0.1.0",
      },
      components: {
        securitySchemes: {
          BearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      security: [],
    },
  });
  return spec;
};
