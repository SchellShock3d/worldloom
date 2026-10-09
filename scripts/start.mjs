// `npm start`: run Worldloom in fast (production) mode.
// Builds first when there's no build yet or the code has changed since the last one,
// so after an update you still only need this one command.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

// Say up front whether Claude will be used, so a missing key isn't a mystery later.
function claudeStatus() {
  if (process.env.ANTHROPIC_API_KEY) return "Claude: connected (key set in the environment).";
  for (const file of [".env.local", ".env"]) {
    const p = path.join(root, file);
    if (existsSync(p) && /^\s*ANTHROPIC_API_KEY\s*=\s*\S+/m.test(readFileSync(p, "utf8"))) return `Claude: key found in ${file}. Run "npm run check-ai" if AI features don't seem to work.`;
  }
  if (existsSync(path.join(root, ".env.local.txt"))) return 'Claude: NOT connected. Found ".env.local.txt"; rename it to ".env.local" (ren .env.local.txt .env.local) and restart.';
  return 'Claude: NOT connected. AI features use the small built-in engine. Put ANTHROPIC_API_KEY=your-key in a file named .env.local in this folder, then restart.';
}

function musicStatus() {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "Music: Google Lyria ready.";
  for (const file of [".env.local", ".env"]) {
    const p = path.join(root, file);
    if (existsSync(p) && /^\s*(GEMINI|GOOGLE)_API_KEY\s*=\s*\S+/m.test(readFileSync(p, "utf8"))) return `Music: Gemini key found in ${file}.`;
  }
  return "Music: not set up (optional). Add GEMINI_API_KEY to .env.local to compose scene music.";
}

console.log(`\nWorldloom is starting at http://localhost:${port}\n${claudeStatus()}\n${musicStatus()}\nKeep this window open while you play. Press Ctrl+C to stop.\n`);
const child = spawn(npx, ["next", "start", "-p", port], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
