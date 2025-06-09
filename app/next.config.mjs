
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  trailingSlash: false,
  experimental: {
    esmExternals: 'loose',
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
  // Production build configuration for Replit
  env: {
    PORT: process.env.PORT || '3000',
    NEXT_PUBLIC_SUPPORT_EMAILS: process.env.NEXT_PUBLIC_SUPPORT_EMAILS || 'info@openearth.org,greta@openearth.org',
    NEXT_PUBLIC_OPENCLIMATE_API_URL: process.env.NEXT_PUBLIC_OPENCLIMATE_API_URL || 'https://openclimate.openearth.dev',
  },
};

export default nextConfig;
