import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CVs, photos and LinkedIn exports are uploaded through server actions, which allow 1 MB by default.
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
  // The app moved to jobpipe.in: old addresses go there, except Google's ownership file, which must stay reachable.
  async redirects() {
    return ["myjobpipe.vercel.app", "www.jobpipe.in"].map((host) => ({
      source: "/:path((?!google1e06ebb533b6dcaa\\.html$).*)",
      has: [{ type: "host" as const, value: host }],
      destination: "https://jobpipe.in/:path",
      permanent: true,
    }));
  },
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
