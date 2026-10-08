import { defineConfig } from "vitest/config";
import path from "node:path";
import os from "node:os";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: "forks",
    env: { WORLDLOOM_TEST: "1", AI_PROVIDER: "offline", UPLOAD_DIR: path.join(os.tmpdir(), "worldloom-test-uploads") },
  },
});
