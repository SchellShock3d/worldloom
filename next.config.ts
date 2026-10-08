import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM + data files and postgres-js uses Node sockets; keep both out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
    // The auth middleware runs on uploads and imports; don't truncate large bodies.
    middlewareClientMaxBodySize: "210mb",
  },
  poweredByHeader: false,
  devIndicators: false,
};

export default nextConfig;
