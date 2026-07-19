import fs from "fs";
import path from "path";

const packagePath = path.join(process.cwd(), "package.json");
const packageJson = fs.readFileSync(packagePath);
const packageInfo = JSON.parse(packageJson);

/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  // Keep PDF parsers outside Turbopack/webpack bundles. pdf-parse's vendored pdf.js
  // historically produced "bad XRef entry" when bundled; unpdf is the Path C extractor.
  serverExternalPackages: ["sequelize", "unpdf"],
  turbopack: {
    rules: {},
  },
  experimental: {
    optimizePackageImports: ["@chakra-ui/react"],
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
        destination: "/api/v1/oauth/metadata/",
      },
      { source: "/api/v0/:path*", destination: "/api/v1/:path*" },
      { source: "/api/cron/:path*", destination: "/api/v1/cron/:path*" },
    ];
  },
};

export default nextConfig;
