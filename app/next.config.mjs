import fs from "fs";
import path from "path";

const packagePath = path.join(process.cwd(), "package.json");
const packageJson = fs.readFileSync(packagePath);
const packageInfo = JSON.parse(packageJson);

/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  experimental: {
    serverComponentsExternalPackages: ["sequelize"],
    optimizePackageImports: ['@chakra-ui/react']
  },
  env: {
    APP_VERSION: packageInfo.version,
  },
};

export default nextConfig;
