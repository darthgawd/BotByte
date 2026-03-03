import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Disable turbopack for builds to avoid _not-found issues
  turbopack: false,
  // Ensure static pages are generated properly
  output: 'standalone',
};

export default nextConfig;
