import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CVs, photos and LinkedIn exports are uploaded through server actions, which allow 1 MB by default.
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
