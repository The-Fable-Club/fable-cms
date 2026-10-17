import type { NextConfig } from "next";

// The CMS is entirely per-user and login-gated, so it opts out of the
// prerender/caching features that suit the public site.
const nextConfig: NextConfig = {
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
