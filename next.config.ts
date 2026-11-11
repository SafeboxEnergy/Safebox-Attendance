import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // Produces a minimal, self-contained .next/standalone build (server + only the
  // node_modules it actually needs) — what deploy/Dockerfile copies into the
  // final image. Netlify's own build/plugin ignores this and does its own thing,
  // so this is safe to leave on unconditionally; it doesn't affect Netlify deploys.
  output: "standalone",
  allowedDevOrigins: ["brusquely-multijugate-torri.ngrok-free.dev"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
