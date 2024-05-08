/** @type {import('next').NextConfig} */
import fs from "fs";
import path from "path";

const packagePath = path.join(process.cwd(), "package.json");
const packageJson = fs.readFileSync(packagePath);
const packageInfo = JSON.parse(packageJson);

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["sequelize", "pino-loki"],
  },
  env: {
    APP_VERSION: packageInfo.version,
  },
};

export default nextConfig;
