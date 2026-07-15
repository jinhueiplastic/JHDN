import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/daily.html", destination: "/daily" },
      { source: "/filter.html", destination: "/filter" },
      { source: "/order.html", destination: "/order" },
      { source: "/report.html", destination: "/report" },
    ];
  },
  async headers() {
    return [
      {
        // Every page except the hashed build assets: always revalidate so a
        // new deploy shows up on next load instead of a stale cached page.
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
