import type { NextConfig } from "next";

// Content-Security-Policy. The CMS talks to itself and to Supabase (sign-in, photo uploads),
// shows GitHub avatars, the site's own art (event and member pickers) and pictures from Supabase
// storage or ImageKit, and uploads to ImageKit.
// Sign-in leaves through Supabase to GitHub, so those may receive the form redirect. Next's
// inline scripts need 'unsafe-inline'; dev mode also needs eval and the hot-reload socket.
const dev = process.env.NODE_ENV !== "production";
const supabase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase} https://avatars.githubusercontent.com https://ik.imagekit.io https://thefableclub.com https://www.thefableclub.com`,
  `media-src 'self' blob: ${supabase} https://ik.imagekit.io`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} https://upload.imagekit.io${dev ? " ws: wss:" : ""}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  `form-action 'self' ${supabase} https://github.com`,
  "base-uri 'self'",
  "object-src 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

// The CMS is entirely per-user and login-gated, so it opts out of the
// prerender/caching features that suit the public site.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // What may load, and never framed (clickjacking).
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
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
