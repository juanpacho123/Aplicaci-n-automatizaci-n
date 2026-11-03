import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  agentRules: false,
  serverExternalPackages: ["@azure/msal-node", "pg"],
  env: {
    NEXT_PUBLIC_APP_TIMEZONE: process.env.APP_TIMEZONE ?? "America/Bogota",
  },
};

export default nextConfig;
