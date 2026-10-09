/**
 * Live AI check: runs every AI feature against a fresh demo world in a
 * throwaway embedded database, using the real model from ANTHROPIC_API_KEY.
 * Costs a little API usage. Prints a summary and writes full outputs to JSON.
 *
 *   npx tsx scripts/live-ai-check.ts [output.json] [only=feature,feature]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Load .env.local without needing Next.
for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

const out = process.argv[2] ?? "live-ai-check.json";
const only = process.argv.find((a) => a.startsWith("only="))?.slice(5).split(",");

const { createDb } = await import("../src/server/db/client");
const { users, entities, campaigns, gameSessions } = await import("../src/server/db/schema");
const { eq, and } = await import("drizzle-orm");
const { createDemoWorld } = await import("../src/server/services/seed");
const { createWorld } = await import("../src/server/services/worlds");
const { getBatch } = await import("../src/server/services/proposals");
const { createSession, startSession, updateSession, endSession } = await import("../src/server/services/sessions");
const { generateContent, processSessionNotes, advanceWorld, suggestConsequences, loreAction, worldFoundation } = await import("../src/server/ai/tasks/world-tasks");
const { assistantTurn } = await import("../src/server/ai/tasks/assistant");
const { needSomethingNow, prepareSession, runContinuity } = await import("../src/server/ai/tasks/dm-tools");
const { getAIProvider } = await import("../src/server/ai/provider");
const { suggestForField, suggestPeoples } = await import("../src/server/ai/tasks/creator");
const { addCorePeoples, addHomebrewPeoples } = await import("../src/server/services/peoples");
const { setCampaignTime } = await import("../src/server/services/clock");
const { durationToMinutes, DEFAULT_CALENDAR } = await import("../src/lib/calendar");

const provider = await getAIProvider();
if (!provider.live) {
  console.error("No live AI provider: set ANTHROPIC_API_KEY.");
  process.exit(1);
}
console.log(`Provider: ${provider.name} (${provider.model})`);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "worldloom-live-"));
const handle = await createDb({ dataDir: path.join(dir, "db"), migrate: true });
const db = handle.db;
const [user] = await db.insert(users).values({ email: "live@example.com", name: "Live DM", passwordHash: "x" }).returning();
const { worldId, campaignId } = await createDemoWorld(db, user!.id);
const actor = { type: "user" as const, userId: user!.id };
const byName = async (name: string) => (await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.name, name))))[0]!;

const results: Record<string, unknown> = {};
async function step(name: string, fn: () => Promise<unknown>) {
  if (only && !only.includes(name)) return;
  const t0 = Date.now();
  process.stdout.write(`- ${name} … `);
  try {
    const r = await fn();
    results[name] = { ok: true, ms: Date.now() - t0, result: r };
    console.log(`ok (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (err) {
    results[name] = { ok: false, ms: Date.now() - t0, error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err) };
    console.log(`FAILED: ${err instanceof Error ? err.message : err}`);
  }
}
const batchSummary = async (res: { batchId: string; accepted: number; dropped: string[]; summary: string; provider: string; fellBack: boolean }) => {
  const batch = await getBatch(db, worldId, res.batchId);
  const kinds: Record<string, number> = {};
  for (const i of batch?.items ?? []) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
  console.log(`    ${res.fellBack ? "FELL BACK to offline" : res.provider}: ${res.accepted} proposals ${JSON.stringify(kinds)}${res.dropped.length ? `, dropped ${res.dropped.length}` : ""}`);
  if (res.dropped.length) console.log(`    dropped: ${res.dropped.slice(0, 6).join(" | ")}`);
  return { ...res, items: batch?.items.map((i) => ({ kind: i.kind, rationale: i.rationale, payload: i.payload })) };
};
const chat = async (message: string, extra: { roleplayEntityId?: string; focusEntityId?: string } = {}) => {
  let text = "";
  const errors: string[] = [];
  let conversationId: string | null = null;
  for await (const e of assistantTurn(db, { worldId, campaignId, userId: user!.id, message, ...extra })) {
    if (e.type === "text") text += e.delta;
    if (e.type === "error") errors.push(e.message);
    if (e.type === "meta") conversationId = e.conversationId;
  }
  console.log(`    ${text.slice(0, 160).replace(/\s+/g, " ")}${text.length > 160 ? "…" : ""}`);
  if (errors.length) console.log(`    errors: ${errors.join(" | ")}`);
  return { text, errors, conversationId };
};

const cal = DEFAULT_CALENDAR;

await step("generate", async () => batchSummary(await generateContent({ db, worldId, campaignId, userId: user!.id, request: "A small fishing village on the Vell river with a secret connected to the plague", type: "settlement" })));
await step("generate_rumours", async () => batchSummary(await generateContent({ db, worldId, campaignId, userId: user!.id, request: "Rumours circulating in Stonehaven right now, based on actual recent events. Mix true, half-true and false.", type: "rumour", count: 4 })));
await step("session", async () => {
  // Play the demo's planned session, as a DM would.
  const [planned] = await db.select().from(gameSessions).where(and(eq(gameSessions.campaignId, campaignId), eq(gameSessions.status, "planned")));
  const s = planned ?? (await createSession(db, worldId, campaignId, actor, { title: "Into Stonehaven" }));
  await startSession(db, worldId, campaignId, actor, s.id);
  await updateSession(db, worldId, campaignId, s.id, {
    notes: [
      "- **18:00** Met Lady Marr at the Drowned Lantern. She finally showed up and gave them the prince's signet ring, says it was found in Lord Vael's study.",
      "- **18:40** Bram punched Captain Varo after Varo accused him of being a Black Hand spy. Varo now hates the party.",
      "Hollis Pell sold them a map of the old smuggling tunnels under the council hall for 30 gp.",
      "Kestra overheard two Cult of Ash agents talking about an expedition to the Sunken Vault next week.",
      "The party agreed to escort Sister Wenna's herb wagon to Riverfall in 3 days.",
      "They met a nervous dockhand called @Pip Hollow who saw a black-sailed ship unloading crates at night.",
    ].join("\n"),
  });
  // The evening's play took about two hours of in-world time.
  const [camp] = await db.select({ at: campaigns.currentAt }).from(campaigns).where(eq(campaigns.id, campaignId));
  await setCampaignTime(db, worldId, campaignId, actor, Number(camp!.at) + 120, "The evening at the Drowned Lantern");
  await endSession(db, worldId, campaignId, actor, s.id);
  return batchSummary(await processSessionNotes({ db, worldId, campaignId, userId: user!.id, sessionId: s.id }));
});
await step("advance_week", async () => batchSummary(await advanceWorld({ db, worldId, campaignId, userId: user!.id, minutes: durationToMinutes(cal, 7, "days"), note: "The party travels to Riverfall." })));
await step("advance_world_level", async () => batchSummary(await advanceWorld({ db, worldId, campaignId: null, userId: user!.id, minutes: durationToMinutes(cal, 30, "days") })));
await step("consequences", async () => batchSummary(await suggestConsequences({ db, worldId, campaignId, userId: user!.id, action: "The party publicly accused Lord Vael of murdering the prince in front of the Stonehaven council." })));
await step("lore_expand", async () => batchSummary(await loreAction({ db, worldId, campaignId, userId: user!.id, entityId: (await byName("Lady Marr")).id, action: "expand" })));
await step("lore_connect", async () => batchSummary(await loreAction({ db, worldId, campaignId, userId: user!.id, entityId: (await byName("Hollis Pell")).id, action: "connect" })));
await step("ask_forgotten", async () => chat("What plot threads have I forgotten?"));
await step("ask_vael", async () => chat("Who might want Lord Vael dead, and why?"));
await step("ask_create", async () => chat("Create a tavern in Riverfall run by someone with ties to the Grey Wardens"));
await step("roleplay_varo_known", async () => chat("Captain, what do you really think happened to the prince?", { roleplayEntityId: (await byName("Captain Varo")).id }));
await step("roleplay_varo_unknown", async () => chat("What is the Cult of Ash digging for in the Wastes?", { roleplayEntityId: (await byName("Captain Varo")).id }));
await step("need_npc", async () => needSomethingNow(db, { worldId, campaignId, kind: "npc", hint: "a suspicious harbourmaster" }));
await step("need_tavern", async () => needSomethingNow(db, { worldId, campaignId, kind: "tavern" }));
await step("need_complication", async () => needSomethingNow(db, { worldId, campaignId, kind: "complication" }));
await step("prepare", async () => prepareSession(db, { worldId, campaignId, userId: user!.id }));
await step("continuity_deep", async () => {
  const r = await runContinuity(db, { worldId, campaignId, deep: true });
  console.log(`    ${r.provider}: ${r.issues.length} issues (${r.issues.filter((i) => i.kind === "ai").length} from AI)`);
  return r;
});
await step("foundation", async () => {
  const w = await createWorld(db, { ...actor, userId: user!.id }, { name: "The Drowned Isles", genre: "Nautical fantasy", tone: "Hopeful but dangerous", magicLevel: "High", techLevel: "Age of sail", description: "" });
  const res = await worldFoundation({ db, worldId: w.id, campaignId: null, userId: user!.id, answers: { themes: "Exploration, broken empires, sea gods", conflict: "Rival trading companies fight over newly risen islands", inspirations: "Earthsea, age of sail", regions: "An archipelago and a sunken continent", notes: "" } });
  const batch = await getBatch(db, w.id, res.batchId);
  const kinds: Record<string, number> = {};
  for (const i of batch?.items ?? []) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
  console.log(`    ${res.fellBack ? "FELL BACK" : res.provider}: ${res.accepted} proposals ${JSON.stringify(kinds)}${res.dropped.length ? `, dropped ${res.dropped.length}` : ""}`);
  return { ...res, items: batch?.items.map((i) => ({ kind: i.kind, payload: i.payload })) };
});

await step("creator_suggest", async () => {
  const draft = { name: "Brassmoor", genre: "Steampunk", tone: "Smoke, soot and stubborn hope", magicLevel: "High", techLevel: "Industrial", description: "Free cities run on aether engines while the old guild-mages lose their grip.", profile: { magicSources: ["Machines and alchemy"], magicAttitude: "Licensed and regulated" } };
  const out: Record<string, string[]> = {};
  for (const f of ["conflict", "regions", "startingArea"] as const) out[f] = (await suggestForField(f, draft)).suggestions;
  console.log(`    ${JSON.stringify(out).slice(0, 300)}`);
  return out;
});
await step("creator_homebrew", async () => {
  const r = await suggestPeoples({ draft: { name: "Brassmoor", genre: "Steampunk", tone: "Smoke and hope", magicLevel: "High", techLevel: "Industrial", description: "Free cities run on aether engines while the old guild-mages lose their grip.", races: ["Human (common)", "Gnome (common)", "Dwarf (common)"], classes: ["Fighter (common)", "Wizard (uncommon)"] }, existing: ["Human", "Gnome", "Dwarf", "Fighter", "Wizard"] });
  console.log(`    ${r.provider}: ${r.items.map((i) => `${i.name} (${i.kind}, ${i.prevalence})`).join(", ")}`);
  return r;
});
await step("foundation_profile", async () => {
  const w = await createWorld(db, { ...actor, userId: user!.id }, {
    name: "Brassmoor",
    genre: "Steampunk",
    tone: "Smoke, soot and stubborn hope",
    magicLevel: "High",
    techLevel: "Industrial",
    description: "Free cities run on aether engines while the old guild-mages lose their grip.",
    profile: { magicSources: ["Machines and alchemy", "Arcane study"], magicAttitude: "Licensed and regulated", worldShape: "Several continents", climates: ["Temperate", "Mountains", "Seas and coasts"], governments: ["City-states", "Merchant oligarchy"], nationCount: 3, factionCount: 4, religionStyle: "Dead or silent gods", historyHooks: ["A revolution", "A cataclysm"], themes: "Progress and what it destroys", conflict: "The Aether Guilds and the free cities race to control the last aether wells.", startingArea: "Cinderport, a smog-choked harbour city", detailStart: true, avoid: "Spiders" },
  });
  await addCorePeoples(db, w.id, actor, { races: { Human: "Common", Gnome: "Common", Dwarf: "Common", Halfling: "Uncommon", Elf: "Rare", Tiefling: "Uncommon" }, classes: { Fighter: "Common", Rogue: "Common", Wizard: "Uncommon", Cleric: "Rare" } });
  await addHomebrewPeoples(db, w.id, actor, [
    { kind: "class", name: "Artificer", prevalence: "Common", summary: "Engineers who bind magic into devices.", reason: "Industry.", fields: {} },
    { kind: "race", name: "Clockwork Folk", prevalence: "Uncommon", summary: "Constructs with a spark of soul.", reason: "Industry.", fields: {} },
  ]);
  const res = await worldFoundation({ db, worldId: w.id, campaignId: null, userId: user!.id });
  const batch = await getBatch(db, w.id, res.batchId);
  const kinds: Record<string, number> = {};
  for (const i of batch?.items ?? []) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
  const created = (batch?.items ?? []).filter((i) => i.kind === "create_entity").map((i) => i.payload as { entity: { type: string; name: string; fields: Record<string, unknown> } });
  const withDemo = created.filter((e) => e.entity.fields?.demographics);
  const npcs = created.filter((e) => e.entity.type === "npc");
  console.log(`    ${res.fellBack ? "FELL BACK" : res.provider}: ${res.accepted} proposals ${JSON.stringify(kinds)}${res.dropped.length ? `, dropped ${res.dropped.length}` : ""}`);
  console.log(`    nations: ${created.filter((e) => e.entity.type === "nation").length}, factions: ${created.filter((e) => e.entity.type === "faction").length}, deities: ${created.filter((e) => e.entity.type === "deity").length}, places with demographics: ${withDemo.length}`);
  console.log(`    demographics e.g.: ${withDemo.slice(0, 2).map((e) => `${e.entity.name}: ${e.entity.fields.demographics}`).join(" | ")}`);
  console.log(`    NPCs: ${npcs.map((n) => `${n.entity.name} (${n.entity.fields.species ?? "?"}${n.entity.fields.className ? `, ${n.entity.fields.className}` : ""})`).join(", ")}`);
  return { ...res, items: batch?.items.map((i) => ({ kind: i.kind, payload: i.payload })) };
});

await step("spark", async () => {
  const { pitchWorlds, draftSection } = await import("../src/server/ai/tasks/spark");
  const { createWorldFromDraft } = await import("../src/server/services/spark-world");
  const { SECTIONS } = await import("../src/lib/spark");
  const dials = { tone: 1, realism: 1, novelty: 1, scale: 0 };
  const t0 = Date.now();
  const p = await pitchWorlds({ seed: "a city built on the back of a sleeping titan", dials });
  console.log(`    pitches (${p.provider}, ${((Date.now() - t0) / 1000).toFixed(1)}s): ${p.pitches.map((x) => `${x.name} — ${x.logline}`).join(" | ")}`);
  const blend = await pitchWorlds({ seed: "", dials, blend: [p.pitches[0]!, p.pitches[1]!] });
  console.log(`    blend: ${blend.pitches[0]?.name} — ${blend.pitches[0]?.logline}`);
  const pitch = p.pitches[0]!;
  const sections: Record<string, unknown> = {};
  const timings: string[] = [];
  for (const s of SECTIONS) {
    const t = Date.now();
    const r = await draftSection({ key: s.key, pitch, dials, sections: sections as never, mode: "new" });
    sections[s.key] = r.data;
    timings.push(`${s.key} ${r.provider} ${((Date.now() - t) / 1000).toFixed(0)}s`);
  }
  console.log(`    sections: ${timings.join(", ")}`);
  const t1 = Date.now();
  const steered = await draftSection({ key: "powers", pitch, dials, sections: sections as never, previous: sections.powers as never, notes: ["Add a secret society"], mode: "steer" });
  console.log(`    steer powers (${((Date.now() - t1) / 1000).toFixed(0)}s): factions now ${(steered.data as { factions: { name: string; kind: string }[] }).factions.map((f) => `${f.name} (${f.kind})`).join(", ")}`);
  sections.powers = steered.data;
  const res = await createWorldFromDraft(db, { ...actor, userId: user!.id }, { seed: "titan", dials, pitch, sections: sections as never });
  console.log(`    world: applied ${res.applied}, failed ${res.failed.length}${res.failed.length ? ` (${res.failed.slice(0, 3).map((f) => f.error).join(" | ")})` : ""}`);
  return { pitches: p.pitches, blend: blend.pitches, sections, res };
});

const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
results.meta = { model: provider.model, campaignNow: c?.currentAt };
fs.writeFileSync(out, JSON.stringify(results, null, 2));
const failed = Object.entries(results).filter(([k, v]) => k !== "meta" && !(v as { ok: boolean }).ok);
console.log(`\n${Object.keys(results).length - 1 - failed.length} passed, ${failed.length} failed. Full output: ${out}`);
await handle.close();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
