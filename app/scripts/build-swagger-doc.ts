import fs from "fs";
import path from "path";
import { createSwaggerSpec } from "next-swagger-doc";

const packagePath = path.join(process.cwd(), "package.json");
const packageJson = fs.readFileSync(packagePath).toString();
const packageInfo = JSON.parse(packageJson);

// Generate OpenAPI spec at build time
function generateOpenAPISpec() {
  try {
    console.log("🔄 Generating OpenAPI specification...");

    // Suppress console output from swagger doc generation
    const originalError = console.error;
    const originalLog = console.log;
    console.error = () => {};
    console.log = () => {};

    const spec: Record<string, any> = createSwaggerSpec({
      apiFolder: "src/app/api/v1",
      definition: {
        openapi: "3.0.0",
        info: {
          title: "CityCatalyst API",
          version: packageInfo.version,
          description:
            "CityCatalyst API for managing greenhouse gas inventories, city data, and climate action planning",
          contact: {
            name: "CityCatalyst Support",
            email: "info@openearth.org",
          },
        },
        servers: [
          {
            url: "https://citycatalyst.io",
            description: "Production",
          },
          {
            url: "https://citycatalyst.openearth.dev",
            description: "Development",
          },
          {
            url: "https://citycatalyst-test.openearth.dev",
            description: "Test",
          },
        ],
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
        tags: [
          {
            name: "activity",
            description: "Inventory activity value operations",
          },
          {
            name: "admin",
            description: "Administrative operations",
          },
          {
            name: "assistants",
            description: "AI assistant operations",
          },
          {
            name: "auth",
            description: "Authentication and authorization",
          },
          {
            name: "bulk",
            description: "Bulk operations",
          },
          {
            name: "cdp",
            description: "CDP (Carbon Disclosure Project) operations",
          },
          {
            name: "chat",
            description: "Chat and messaging operations",
          },
          {
            name: "check",
            description: "Health check and liveness endpoints",
          },
          {
            name: "city",
            description: "City-related operations",
          },
          {
            name: "clients",
            description: "OAuth client operations",
          },
          {
            name: "composition",
            description: "Waste composition operations",
          },
          {
            name: "cron",
            description: "Cron job operations",
          },
          {
            name: "data",
            description: "Data source operations",
          },
          {
            name: "download",
            description: "Download operations",
          },
          {
            name: "emissions",
            description: "Emissions factor operations",
          },
          {
            name: "factors",
            description: "Emissions factor operations",
          },
          {
            name: "files",
            description: "File upload and management operations",
          },
          {
            name: "ghg",
            description: "Greenhouse gas inventory operations",
          },
          {
            name: "hiap",
            description: "Heatwave Impact Assessment Plan operations",
          },
          {
            name: "internal",
            description: "Internal API operations",
          },
          {
            name: "inventory",
            description: "Inventory operations",
          },
          {
            name: "invitations",
            description: "Organization invitation operations",
          },
          {
            name: "invites",
            description: "City and user invitation operations",
          },
          {
            name: "locations",
            description: "Bulk location operations",
          },
          {
            name: "mock",
            description: "Mock data endpoints",
          },
          {
            name: "modules",
            description: "Module operations",
          },
          {
            name: "notation-keys",
            description: "Inventory notation key operations",
          },
          {
            name: "oauth",
            description: "OAuth operations",
          },
          {
            name: "organization",
            description: "Organization operations",
          },
          {
            name: "organizations",
            description: "Organization management operations",
          },
          {
            name: "population",
            description: "City population operations",
          },
          {
            name: "populations",
            description: "Inventory population operations",
          },
          {
            name: "progress",
            description: "Inventory progress operations",
          },
          {
            name: "project",
            description: "Project operations",
          },
          {
            name: "projects",
            description: "Project management operations",
          },
          {
            name: "public",
            description: "Public API endpoints",
          },
          {
            name: "results",
            description: "Inventory results operations",
          },
          {
            name: "root",
            description: "API root endpoint",
          },
          {
            name: "sector",
            description: "Sector operations",
          },
          {
            name: "sources",
            description: "Data source operations",
          },
          {
            name: "subsector",
            description: "Subsector operations",
          },
          {
            name: "threads",
            description: "Assistant thread operations",
          },
          {
            name: "transfer",
            description: "City transfer operations",
          },
          {
            name: "user",
            description: "User operations",
          },
          {
            name: "users",
            description: "User management operations",
          },
          {
            name: "values",
            description: "Inventory value operations",
          },
          {
            name: "waste",
            description: "Waste composition operations",
          },
          {
            name: "dashboard",
            description: "endpoints specifically for dashboards",
          },
          {
            name: "mcp",
            description: "endpoints for the Model Context Protocol",
          },
        ],
      },
    });

    // Restore console
    console.error = originalError;
    console.log = originalLog;

    // Create public directory if it doesn't exist
    const publicDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Write the spec to a public JSON file
    const outputPath = path.join(publicDir, "openapi-spec.json");
    fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));

    console.log(`✅ OpenAPI spec generated: ${outputPath}`);
    console.log(
      `📊 Found ${Object.keys(spec.paths || {}).length} API endpoints`,
    );

    return spec;
  } catch (error) {
    console.error("❌ Error generating OpenAPI spec:", error);
    return null;
  }
}

generateOpenAPISpec();
