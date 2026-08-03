import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.primesocial.de", "*.vercel.app"],
    },
  },
  serverExternalPackages: ["apify-client", "proxy-agent"],
};

export default nextConfig;
