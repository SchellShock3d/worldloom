// `npm start`: run Worldloom in fast (production) mode.
// Builds first when there's no build yet or the code has changed since the last one,
// so after an update you still only need this one command.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = process.env.NEXT_DIST_DIR || ".next";
const buildId = path.join(root, distDir, "BUILD_ID");
const port = process.env.PORT || "3000";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function newestChange(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestChange(p));
    else newest = Math.max(newest, statSync(p).mtimeMs);
  }
  return newest;
}

function needsBuild() {
  if (process.argv.includes("--rebuild")) return true;
  if (!existsSync(buildId)) return true;
  const built = statSync(buildId).mtimeMs;
  const sources = ["src", "drizzle", "public"].map((d) => path.join(root, d)).filter(existsSync);
  const files = ["package.json", "package-lock.json", "next.config.ts", "postcss.config.mjs", "tsconfig.json"].map((f) => path.join(root, f)).filter(existsSync);
  const newest = Math.max(...sources.map(newestChange), ...files.map((f) => statSync(f).mtimeMs));
  return newest > built;
}

if (needsBuild()) {
  console.log("\nPreparing Worldloom for fast mode. This takes a couple of minutes the first time and after updates.\n");
  const b = spawnSync(npx, ["next", "build"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (b.status !== 0) {
    console.error("\nThe build failed. The messages above say why.");
    process.exit(b.status ?? 1);
  }
}

console.log(`\nWorldloom is starting at http://localhost:${port}\nKeep this window open while you play. Press Ctrl+C to stop.\n`);
const child = spawn(npx, ["next", "start", "-p", port], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
