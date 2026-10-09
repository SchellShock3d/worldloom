/**
 * Is Claude connected? Finds the key the way the app does, sends one tiny request, and says in
 * plain words what's wrong if it fails. Costs a fraction of a cent.
 *
 *   npm run check-ai
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const found: string[] = [];
for (const file of [".env.local", ".env"]) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    if (m[1] === "ANTHROPIC_API_KEY" && m[2]) found.push(file);
    if (!process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

const key = process.env.ANTHROPIC_API_KEY ?? "";
if (!key) {
  console.log("\nClaude is NOT connected: no ANTHROPIC_API_KEY found.\n");
  if (fs.existsSync(path.join(root, ".env.local.txt"))) console.log("Found .env.local.txt. Windows added .txt to the name; rename it to .env.local (in Command Prompt: ren .env.local.txt .env.local).\n");
  else if (!fs.existsSync(path.join(root, ".env.local"))) console.log("There's no .env.local file in this folder yet. Create one from the example:\n  Windows:  copy .env.example .env.local   then   notepad .env.local\n  Mac:      cp .env.example .env.local     then   open -e .env.local\n");
  else console.log(".env.local exists, but the ANTHROPIC_API_KEY line is empty or missing. It should look like:\n  ANTHROPIC_API_KEY=sk-ant-...\n");
  process.exit(1);
}
if (process.env.AI_PROVIDER?.toLowerCase() === "offline") {
  console.log("\nA key is set, but AI_PROVIDER=offline turns Claude off. Remove that line from .env.local.\n");
  process.exit(1);
}
if (!key.startsWith("sk-ant-")) console.log("\nThat key doesn't start with sk-ant-, so it may be pasted incompletely. Trying it anyway…");
if (/\s/.test(key)) console.log("\nThe key contains a space. Remove any spaces or quotes around it in .env.local. Trying it anyway…");

const { getAIProvider } = await import("../src/server/ai/provider");
const provider = await getAIProvider();
process.stdout.write(`\nKey found${found.length ? ` in ${found[0]}` : ""}. Asking Claude to reply… `);
try {
  const t0 = Date.now();
  const reply = await provider.text({ system: "Reply with exactly one word.", messages: [{ role: "user", content: "Say: ready" }], maxTokens: 10 });
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s.\n\nClaude is connected (${provider.model}). It replied: "${reply.trim()}"`);
  console.log("If Worldloom was already running, stop it (Ctrl+C) and run npm start again so it picks up the key.\n");
} catch (err) {
  console.log("failed.\n");
  console.log(`Claude is NOT working: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
