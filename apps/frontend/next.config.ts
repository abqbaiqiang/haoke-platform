import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    const backend = process.env.INTERNAL_API_URL;
    return backend ? [{ source: "/api/:path*", destination: `${backend}/api/:path*` }] : [];
  },
};
export default nextConfig;
