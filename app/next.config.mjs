import fs from "fs";
import path from "path";
import { createSwaggerSpec } from "next-swagger-doc";

const packagePath = path.join(process.cwd(), "package.json");
const packageJson = fs.readFileSync(packagePath);
const packageInfo = JSON.parse(packageJson);

// Generate OpenAPI spec at build time
function generateOpenAPISpec() {
  try {
    console.log("🔄 Generating OpenAPI specification...");
    
    const spec = createSwaggerSpec({
      apiFolder: "src/app/api/v0",
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

    // Create public directory if it doesn't exist
    const publicDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Write the spec to a public JSON file
    const outputPath = path.join(publicDir, "openapi-spec.json");
    fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));
    
    console.log(`✅ OpenAPI spec generated: ${outputPath}`);
    console.log(`📊 Found ${Object.keys(spec.paths || {}).length} API endpoints`);
    
    return spec;
  } catch (error) {
    console.error("❌ Error generating OpenAPI spec:", error);
    return null;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  serverExternalPackages: ["sequelize"],
  experimental: {
    optimizePackageImports: ["@chakra-ui/react"],
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Generate OpenAPI spec during build (only once, on server-side build)
    if (isServer && !dev) {
      generateOpenAPISpec();
    }
    return config;
  },
  env: {
    APP_VERSION: packageInfo.version,
    NEXT_AWS_REGION: process.env.NEXT_AWS_REGION,
    NEXT_AWS_ACCESS_KEY_ID: process.env.NEXT_AWS_ACCESS_KEY_ID,
    NEXT_AWS_SECRET_ACCESS_KEY: process.env.NEXT_AWS_SECRET_ACCESS_KEY,
    NEXT_AWS_S3_BUCKET_ID: process.env.NEXT_AWS_S3_BUCKET_ID,
  },
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/v0/oauth/metadata/",
      },
    ];
  },
};

export default nextConfig;
