import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  // 允许通过局域网 IP 访问开发服务器（Next 16 默认拦截非 localhost 来源的 HMR/水合）。
  allowedDevOrigins: ["192.168.1.11"],
  async rewrites() {
    const backend = process.env.INTERNAL_API_URL;
    return backend ? [{ source: "/api/:path*", destination: `${backend}/api/:path*` }] : [];
  },
};
export default nextConfig;
