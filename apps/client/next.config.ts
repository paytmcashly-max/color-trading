import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@color-trading/shared"],
  turbopack: {
    root: "../..",
  },
};

export default nextConfig;
