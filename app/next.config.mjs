import fs from "fs";
import path from "path";

const packagePath = path.join(process.cwd(), "package.json");
const packageJson = fs.readFileSync(packagePath);
const packageInfo = JSON.parse(packageJson);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimize for deployment build
  swcMinify: true,
  compress: true,
  trailingSlash: true,
  eslint: {
    // Disable ESLint during builds for deployment
    ignoreDuringBuilds: process.env.NODE_ENV === 'production',
  },
  experimental: {
    serverComponentsExternalPackages: ["sequelize"],
    // Temporarily disabled for faster builds
    // optimizePackageImports: ['@chakra-ui/react']
  },
  env: {
    APP_VERSION: packageInfo.version,
    NEXT_AWS_REGION: process.env.NEXT_AWS_REGION,
    NEXT_AWS_ACCESS_KEY_ID: process.env.NEXT_AWS_ACCESS_KEY_ID,
    NEXT_AWS_SECRET_ACCESS_KEY: process.env.NEXT_AWS_SECRET_ACCESS_KEY,
    NEXT_AWS_S3_BUCKET_ID: process.env.NEXT_AWS_S3_BUCKET_ID,
  },
};

export default nextConfig;
