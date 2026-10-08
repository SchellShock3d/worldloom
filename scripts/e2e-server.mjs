// Starts a production server on a fresh, throwaway database for Playwright.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const port = process.argv[2] ?? "3100";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const data = path.join(root, ".data", "e2e");
rmSync(data, { recursive: true, force: true });

const distDir = ".next-e2e";
// Rebuild when the code is newer than the last e2e build, so tests never run against stale code.
const newest = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((m, e) => Math.max(m, e.isDirectory() ? newest(path.join(dir, e.name)) : statSync(path.join(dir, e.name)).mtimeMs), 0);
const buildId = path.join(root, distDir, "BUILD_ID");
const stale = !existsSync(buildId) || ["src", "drizzle"].some((d) => newest(path.join(root, d)) > statSync(buildId).mtimeMs);
if (stale || process.env.E2E_REBUILD === "1") {
  const b = spawnSync("npx", ["next", "build"], { cwd: root, stdio: "inherit", env: { ...process.env, NEXT_DIST_DIR: distDir } });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

const env = {
  ...process.env,
  DATABASE_URL: "",
  PGLITE_DIR: path.join(data, "pglite"),
  UPLOAD_DIR: path.join(data, "uploads"),
  AI_PROVIDER: "offline",
  INSECURE_COOKIES: "true",
  NODE_ENV: "production",
  NEXT_DIST_DIR: distDir,
};
const child = spawn("npx", ["next", "start", "-p", port], { cwd: root, env, stdio: "inherit" });
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
