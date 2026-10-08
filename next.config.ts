import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the e2e suite build and serve from its own folder while `next dev` keeps using .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // PGlite ships WASM + data files and postgres-js uses Node sockets; keep both out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  experimental: {
    // Import only the parts of these libraries a page uses (smaller bundles, faster dev compiles).
    optimizePackageImports: ["radix-ui", "lucide-react", "sonner"],
    serverActions: { bodySizeLimit: "25mb" },
    // The auth middleware runs on uploads and imports; don't truncate large bodies.
    middlewareClientMaxBodySize: "110mb",
  },
  poweredByHeader: false,
  devIndicators: false,
};

export default nextConfig;
