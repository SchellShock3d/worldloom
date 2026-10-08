/** Prepare Next Session, "I need something now", and AI continuity review. */
import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/server/db/client";
import { entities, randomTableEntries, randomTables } from "@/server/db/schema";
import { formatDate, resolve, timeOfDay } from "@/lib/calendar";
import { mentionToken } from "@/lib/mentions";
import { truncate } from "@/lib/utils";
import { getEntityType } from "@/lib/entity-types";
import { getAIProvider } from "../provider";
import { buildDmContext, loadWorldBundle } from "../context";
import { COPILOT_IDENTITY, typeReference } from "../prompts";
import { aiRef } from "../changeset";
import { Rng, hashSeed } from "../offline/rng";
import * as B from "../offline/banks";
import { nameGenerator } from "../offline/generate";
import { forgottenThreads, unfinishedBusiness, continuityIssues, type Insight } from "@/server/services/insights";
import { listQuests, listMysteries, listThreads } from "@/server/services/quests";
import { listConsequences } from "@/server/services/play";
import { listTimeline } from "@/server/services/timeline";
import { getLocationChain } from "@/server/services/entities";

// ---------------------------------------------------------------------------
// Prepare next session
// ---------------------------------------------------------------------------

export const briefingSchema = z.object({
  markdown: z.string().describe("The full DM briefing in markdown with the requested sections"),
  scenes: z.array(z.object({ name: z.string(), description: z.string(), location: aiRef.nullable(), present: z.array(aiRef) })),
  encounters: z.array(z.object({ name: z.string(), description: z.string(), location: aiRef.nullable() })),
});
export type Briefing = { markdown: string; scenes: { name: string; description: string; locationId: string | null; presentIds: string[] }[]; encounters: { name: string; description: string; locationId: string | null }[]; provider: string };

export async function prepareSession(db: DB, opts: { worldId: string; campaignId: string; userId: string; focus?: string }): Promise<Briefing> {
  const provider = await getAIProvider();
  const bundle = await loadWorldBundle(db, opts.worldId, opts.campaignId);
  const camp = bundle.campaign!;
  const [forgotten, ub] = await Promise.all([forgottenThreads(db, opts.worldId, camp.id, bundle.calendar), unfinishedBusiness(db, opts.worldId, camp.id)]);

  if (provider.live) {
    const ctx = await buildDmContext(db, { worldId: opts.worldId, campaignId: camp.id, query: opts.focus ?? "", budgetChars: 34000, maxEntities: 20 });
    try {
      const out = await provider.structured({
        name: "briefing",
        schema: briefingSchema,
        system: COPILOT_IDENTITY,
        maxTokens: 10000,
        messages: [
          {
            role: "user",
            content: `${ctx.text}\n\n# Forgotten threads\n${forgotten.map((f) => `- ${f.title}. ${f.detail}`).join("\n") || "(none)"}\n\n# Unfinished business\n${ub.map((u) => `- ${u.name}: ${u.reasons.join("; ")}`).join("\n") || "(none)"}\n\n---\n# Task\nWrite a DM briefing to prepare the NEXT session${opts.focus ? ` (DM focus: ${opts.focus})` : ""}. Sections (markdown ## headings): Current situation (location, date, party status), Relevant NPCs, Active quests, Unresolved mysteries, Unresolved promises, Nearby world threads, Faction activity, Potential consequences, Likely player directions, Useful encounters, Potential scenes, Relevant lore, Potential revelations. Be specific and grounded in the records; bullets are fine. When naming an existing entity, link it as @[Name](entity:<uuid>). Also return 2–5 ready-to-use scenes and 1–3 encounters.`,
          },
        ],
      });
      const resolveRef = (r: z.infer<typeof aiRef> | null) => (r?.id && /^[0-9a-f-]{36}$/i.test(r.id) ? r.id : null);
      const ids = new Set<string>();
      out.scenes.forEach((s) => (resolveRef(s.location) && ids.add(resolveRef(s.location)!), s.present.forEach((p) => resolveRef(p) && ids.add(resolveRef(p)!))));
      out.encounters.forEach((e) => resolveRef(e.location) && ids.add(resolveRef(e.location)!));
      const valid = ids.size ? new Set((await db.select({ id: entities.id }).from(entities).where(and(eq(entities.worldId, opts.worldId), inArray(entities.id, [...ids])))).map((r) => r.id)) : new Set<string>();
      const ok = (id: string | null) => (id && valid.has(id) ? id : null);
      return {
        markdown: out.markdown,
        scenes: out.scenes.map((s) => ({ name: s.name, description: s.description, locationId: ok(resolveRef(s.location)), presentIds: s.present.map((p) => ok(resolveRef(p))).filter((x): x is string => !!x) })),
        encounters: out.encounters.map((e) => ({ name: e.name, description: e.description, locationId: ok(resolveRef(e.location)) })),
        provider: provider.name,
      };
    } catch (err) {
      console.error("[ai] briefing failed, using offline briefing", err);
    }
  }
  return offlineBriefing(db, opts.worldId, camp.id, bundle, forgotten, ub);
}

async function offlineBriefing(db: DB, worldId: string, campaignId: string, bundle: Awaited<ReturnType<typeof loadWorldBundle>>, forgotten: Insight[], ub: Awaited<ReturnType<typeof unfinishedBusiness>>): Promise<Briefing> {
  const camp = bundle.campaign!;
  const L = (e: { id: string; name: string }) => mentionToken(e.name, e.id);
  const md: string[] = [];
  const chain = await getLocationChain(db, worldId, camp.currentLocationId);
  const here = chain[chain.length - 1];
  const pcs = await db.select().from(entities).where(and(eq(entities.campaignId, campaignId), eq(entities.type, "pc")));
  md.push("## Current situation");
  md.push(`- **When:** ${formatDate(bundle.calendar, bundle.now, { weekday: true })}, ${timeOfDay(bundle.calendar, bundle.now)}${resolve(bundle.calendar, bundle.now).season ? ` (${resolve(bundle.calendar, bundle.now).season})` : ""}`);
  md.push(`- **Where:** ${chain.length ? chain.map(L).join(" › ") : "not set (set the party's location on the campaign page)"}`);
  if (camp.currentWeather) md.push(`- **Weather:** ${camp.currentWeather}`);
  if (pcs.length) md.push(`- **Party:** ${pcs.map((p) => `${L(p)}${p.status && p.status !== "active" ? ` (${p.status})` : ""}`).join(", ")}`);

  const npcsHere = here
    ? await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.type, "npc"), or(eq(entities.locationId, here.id), inArray(entities.locationId, (await db.select({ id: entities.id }).from(entities).where(eq(entities.locationId, here.id))).map((x) => x.id).concat([here.id])))))
    : [];
  md.push("", "## Relevant NPCs");
  const npcLines = [...npcsHere.slice(0, 8).map((n) => `- ${L(n)}${n.summary ? `: ${n.summary}` : ""}`), ...ub.slice(0, 6).map((u) => `- ${L(u)}: ${u.reasons.join("; ")}`)];
  md.push(...(npcLines.length ? npcLines : ["- No NPCs recorded at the current location."]));

  const qs = await listQuests(db, worldId, campaignId, ["active", "available"]);
  md.push("", "## Active quests");
  md.push(...(qs.length ? qs.slice(0, 8).map((q) => `- ${L(q)} (${q.status})${q.objectives.filter((o) => o.status === "open").length ? `: next — ${q.objectives.find((o) => o.status === "open")!.text}` : ""}`) : ["- None active."]));

  const ms = (await listMysteries(db, worldId, campaignId)).filter((m) => m.mystery.status !== "solved");
  md.push("", "## Unresolved mysteries");
  md.push(...(ms.length ? ms.map((m) => `- ${L(m)}: ${m.clues.filter((c) => c.discovered && !c.isRedHerring).length}/${m.clues.filter((c) => !c.isRedHerring).length} clues found. ${m.mystery.question}`) : ["- None."]));

  const cons = await listConsequences(db, worldId, campaignId, ["pending", "foreshadowed"]);
  md.push("", "## Unresolved promises");
  const promises = cons.filter((c) => c.c.kind === "promise");
  md.push(...(promises.length ? promises.map(({ c, actorName }) => `- ${actorName ?? "Someone"}: ${c.title}${c.dueAt !== null ? ` (due ${formatDate(bundle.calendar, c.dueAt)}${c.dueAt < bundle.now ? ", overdue" : ""})` : ""}`) : ["- None."]));

  const threads = await listThreads(db, worldId, { statuses: ["active", "escalating"] });
  const chainIds = new Set(chain.map((c) => c.id));
  const nearby = threads.filter((t) => (t.locationId && chainIds.has(t.locationId)) || t.actors.some((a) => chainIds.has(a.id)));
  md.push("", "## Nearby world threads");
  md.push(...((nearby.length ? nearby : threads.slice(0, 3)).map((t) => `- ${L(t)}: ${t.thread.status}, ${t.thread.progress}%${t.thread.nextMilestone ? `; next: ${t.thread.nextMilestone}` : ""}`) || []));
  if (!threads.length) md.push("- No world threads yet.");

  const factionEvents = await listTimeline(db, worldId, { campaignId, kinds: ["faction", "world"], to: bundle.now, order: "desc", limit: 5 });
  md.push("", "## Faction activity");
  md.push(...(factionEvents.length ? factionEvents.map((e) => `- ${formatDate(bundle.calendar, e.startAt)}: ${L(e)}`) : ["- Nothing recent on record."]));

  md.push("", "## Potential consequences");
  const other = cons.filter((c) => c.c.kind !== "promise");
  md.push(...(other.length ? other.slice(0, 6).map(({ c, actorName }) => `- ${c.title}${actorName ? ` (${actorName})` : ""}`) : ["- None pending."]));

  md.push("", "## Likely player directions");
  const dirs = qs.filter((q) => q.status === "active").slice(0, 4).map((q) => `- Pursue ${L(q)}`);
  md.push(...(dirs.length ? dirs : ["- Follow up on whatever hook you plant next; nothing is pulling them yet."]));

  md.push("", "## Worth resurfacing");
  md.push(...(forgotten.length ? forgotten.slice(0, 6).map((f) => `- ${f.title}`) : ["- Nothing looks forgotten."]));

  const encounterSeeds = await db
    .select({ text: randomTableEntries.text })
    .from(randomTableEntries)
    .innerJoin(randomTables, eq(randomTables.id, randomTableEntries.tableId))
    .where(and(eq(randomTables.worldId, worldId), ilike(randomTables.category, "encounters")));
  const rng = new Rng(hashSeed(campaignId, bundle.now));
  const encounters = rng.sample(encounterSeeds.map((e) => e.text), 2).map((t) => ({ name: truncate(t, 50), description: t, locationId: here?.id ?? null }));
  md.push("", "## Useful encounters");
  md.push(...(encounters.length ? encounters.map((e) => `- ${e.description}`) : ["- Add an encounter table on the Generators page."]));

  const scenes = [
    ...qs.filter((q) => q.status === "active").slice(0, 2).map((q) => ({ name: `Lead: ${q.name}`, description: `A scene that moves “${q.name}” forward.${q.objectives.find((o) => o.status === "open") ? ` Next step: ${q.objectives.find((o) => o.status === "open")!.text}.` : ""}`, locationId: here?.id ?? null, presentIds: q.giverId ? [q.giverId] : [] })),
    ...nearby.slice(0, 1).map((t) => ({ name: `Signs of ${t.name}`, description: `The party sees evidence that “${t.name}” is moving (${t.thread.progress}%).`, locationId: here?.id ?? null, presentIds: [] })),
  ];
  md.push("", "## Potential scenes");
  md.push(...(scenes.length ? scenes.map((s) => `- **${s.name}**: ${s.description}`) : ["- Start with a scene at the party's current location."]));

  if (here) {
    const lore = await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.type, "lore"), or(eq(entities.locationId, here.id), ilike(entities.body, `%${here.id}%`)))).limit(4);
    md.push("", "## Relevant lore");
    md.push(...(lore.length ? lore.map((l) => `- ${L(l)}${l.summary ? `: ${l.summary}` : ""}`) : [`- Nothing written about ${here.name} yet.`]));
  }

  const secrets = here ? await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.locationId, here.id), eq(entities.visibility, "secret"))).limit(5) : [];
  const hidden = ms.flatMap((m) => m.clues.filter((c) => !c.discovered && !c.isRedHerring).slice(0, 1).map((c) => `- Clue for ${L(m)}: ${c.description}`));
  md.push("", "## Potential revelations");
  md.push(...([...secrets.map((s) => `- ${L(s)} could be discovered here.`), ...hidden].slice(0, 6).length ? [...secrets.map((s) => `- ${L(s)} could be discovered here.`), ...hidden].slice(0, 6) : ["- No secrets queued. Mark entities as secret to plan reveals."]));

  return { markdown: md.join("\n"), scenes, encounters, provider: "offline" };
}

// ---------------------------------------------------------------------------
// I need something now
// ---------------------------------------------------------------------------

export const EMERGENCY_KINDS = ["npc", "encounter", "name", "rumour", "shop", "tavern", "clue", "complication", "treasure", "location"] as const;
export type EmergencyKind = (typeof EMERGENCY_KINDS)[number];

export const emergencySchema = z.object({
  title: z.string(),
  text: z.string().describe("Short, table-ready markdown: 2–6 lines"),
  entityType: z.string().nullable().describe("If this can be saved as an entity, its type key (npc, shop, tavern, location, item, magic_item, rumour); else null"),
  summary: z.string(),
  fields: z.array(z.object({ key: z.string(), value: z.string() })),
});

export interface EmergencyResult {
  kind: EmergencyKind;
  title: string;
  text: string;
  entityType: string | null;
  summary: string;
  fields: Record<string, string>;
  locationId: string | null;
  provider: string;
}

export async function needSomethingNow(db: DB, opts: { worldId: string; campaignId: string | null; kind: EmergencyKind; hint?: string }): Promise<EmergencyResult> {
  const provider = await getAIProvider();
  const bundle = await loadWorldBundle(db, opts.worldId, opts.campaignId);
  const locationId = bundle.campaign?.currentLocationId ?? null;
  if (provider.live) {
    try {
      const ctx = await buildDmContext(db, { worldId: opts.worldId, campaignId: opts.campaignId, query: opts.hint ?? "", budgetChars: 9000, maxEntities: 8, sections: { threads: true, sessions: false, timeline: false, quests: true, consequences: false, mysteries: opts.kind === "clue", truths: false, rumours: opts.kind === "rumour" } });
      const out = await provider.structured({
        name: "quick",
        schema: emergencySchema,
        fast: true,
        maxTokens: 1500,
        system: `${COPILOT_IDENTITY}\nYou're generating something the DM needs RIGHT NOW at the table. Be quick, concrete and usable immediately. Fit the current scene, location and world.`,
        messages: [{ role: "user", content: `${ctx.text}\n\n# Task\nGive me one ${opts.kind}${opts.hint ? ` (${opts.hint})` : ""}. Type reference: ${typeReference(["npc", "shop", "tavern", "location", "item", "magic_item"])}` }],
      });
      return { kind: opts.kind, title: out.title, text: out.text, entityType: out.entityType && getEntityType(out.entityType).description !== "Unknown type" ? out.entityType : null, summary: out.summary, fields: Object.fromEntries(out.fields.map((f) => [f.key, f.value])), locationId, provider: provider.name };
    } catch (err) {
      console.error("[ai] quick generation failed, using offline", err);
    }
  }
  return offlineEmergency(db, opts, locationId);
}

async function offlineEmergency(db: DB, opts: { worldId: string; campaignId: string | null; kind: EmergencyKind; hint?: string }, locationId: string | null): Promise<EmergencyResult> {
  const rng = new Rng(hashSeed(opts.kind, Date.now()));
  const name = await nameGenerator(db, opts.worldId, rng);
  const table = async (cat: string) =>
    (
      await db
        .select({ text: randomTableEntries.text, weight: randomTableEntries.weight })
        .from(randomTableEntries)
        .innerJoin(randomTables, eq(randomTables.id, randomTableEntries.tableId))
        .where(and(eq(randomTables.worldId, opts.worldId), eq(randomTables.category, cat), locationId ? or(isNull(randomTables.locationId), eq(randomTables.locationId, locationId)) : isNull(randomTables.locationId)))
    ).map((r) => ({ value: r.text, weight: r.weight }));
  const roll = async (cat: string, fallback: string[]) => {
    const t = await table(cat);
    return t.length ? rng.weighted(t) : rng.pick(fallback);
  };
  const base = { kind: opts.kind, locationId, provider: "offline", fields: {} as Record<string, string> };
  switch (opts.kind) {
    case "npc": {
      const n = name();
      const occ = rng.pick(B.OCCUPATIONS);
      const fields = { occupation: occ, species: rng.pick(B.SPECIES), personality: rng.pick(B.PERSONALITY), mannerisms: rng.pick(B.MANNERISMS), motivations: rng.pick(B.MOTIVATIONS), appearance: rng.pick(B.APPEARANCE), secrets: rng.pick(B.SECRETS) };
      return { ...base, title: n, entityType: "npc", summary: `${fields.species} ${occ}`, fields, text: `**${n}**, ${fields.species} ${occ}\n- ${fields.appearance}\n- ${fields.personality}; ${fields.mannerisms}\n- Wants to ${fields.motivations}\n- _Secret:_ ${fields.secrets}` };
    }
    case "name":
      return { ...base, title: "Names", entityType: null, summary: "", text: Array.from({ length: 6 }, () => `- ${name()}`).join("\n") };
    case "encounter": {
      const e = await roll("encounters", ["Bandits block the road."]);
      return { ...base, title: "Encounter", entityType: null, summary: e, text: `${e}\n- Twist: ${rng.pick(B.COMPLICATIONS)}` };
    }
    case "rumour": {
      const r = await roll("rumours", ["Something stirs in the hills."]);
      return { ...base, title: "Rumour", entityType: "rumour", summary: r, text: `“${r}”\n- True? ${rng.pick(["Mostly", "Partly", "Not at all", "Worse than they say"])}` };
    }
    case "complication": {
      const c = await roll("complications", B.COMPLICATIONS);
      return { ...base, title: "Complication", entityType: null, summary: c, text: c };
    }
    case "treasure": {
      const t = await roll("treasure", ["A purse of old coins"]);
      const extra = await roll("loot", ["A tarnished locket"]);
      return { ...base, title: "Treasure", entityType: "item", summary: t, text: `- ${t}\n- ${extra}`, fields: { category: "Treasure" } };
    }
    case "clue": {
      const ms = opts.campaignId ? (await listMysteries(db, opts.worldId, opts.campaignId)).filter((m) => m.mystery.status !== "solved") : [];
      const m = ms[0];
      const next = m?.clues.find((c) => !c.discovered && !c.isRedHerring);
      if (m && next) return { ...base, title: `Clue: ${m.name}`, entityType: null, summary: next.description, text: `Plant this next clue for ${mentionToken(m.name, m.id)}:\n- ${next.description}` };
      return { ...base, title: "Clue", entityType: null, summary: "", text: `- ${rng.pick(["A torn letter with half a name", "Muddy boot prints leading the wrong way", "A ledger entry dated tomorrow", "A servant who saw too much"])}` };
    }
    case "shop": {
      const st = rng.pick(B.SHOP_TYPES);
      const owner = name();
      const shopName = `${owner.split(" ")[1]} ${rng.pick(B.SHOP_NAMES)}`;
      return { ...base, title: shopName, entityType: "shop", summary: `A ${st} run by ${owner}.`, fields: { shopType: st, pricing: rng.pick(["Cheap", "Fair", "Expensive"]) }, text: `**${shopName}**, ${st}\n- Run by ${owner}: ${rng.pick(B.PERSONALITY)}\n- Stock: ${(B.SHOP_INVENTORY[st] ?? B.SHOP_INVENTORY["general goods"]!).map(([n, p]) => `${n} (${p})`).join(", ")}` };
    }
    case "tavern": {
      const tname = `The ${rng.pick(B.TAVERN_FIRST)} ${rng.pick(B.TAVERN_SECOND)}`;
      const patron = await roll("patrons", ["A grizzled mercenary"]);
      return { ...base, title: tname, entityType: "tavern", summary: rng.pick(B.TAVERN_AMBIENCE), fields: { ambience: rng.pick(B.TAVERN_AMBIENCE), quality: rng.pick(["Poor", "Modest", "Comfortable"]) }, text: `**${tname}**\n- ${rng.pick(B.TAVERN_AMBIENCE)}\n- Keeper: ${name()}\n- Notable patron: ${patron}\n- On the menu: ${rng.sample(B.MENU_ITEMS, 2).map(([n, p]) => `${n} (${p})`).join(", ")}` };
    }
    case "location": {
      const loc = rng.pick(["an overgrown shrine", "a collapsed watchtower", "a ferry crossing", "a burned farmhouse", "a hermit's cave", "a crossroads gibbet"]);
      return { ...base, title: loc.replace(/^an? /, "").replace(/^\w/, (c) => c.toUpperCase()), entityType: "location", summary: `${loc[0]!.toUpperCase()}${loc.slice(1)}.`, text: `${loc[0]!.toUpperCase()}${loc.slice(1)}.\n- Sense: ${rng.pick(["smell of wet ash", "crows watching", "a bell ringing faintly", "fresh hoofprints"])}\n- Hook: ${rng.pick(B.COMPLICATIONS)}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Continuity (AI review on top of deterministic checks)
// ---------------------------------------------------------------------------

const continuitySchema = z.object({
  issues: z.array(z.object({ title: z.string(), detail: z.string(), severity: z.enum(["info", "warn", "high"]), entities: z.array(aiRef) })),
});

export async function runContinuity(db: DB, opts: { worldId: string; campaignId: string | null; deep?: boolean }): Promise<{ issues: Insight[]; provider: string }> {
  const bundle = await loadWorldBundle(db, opts.worldId, opts.campaignId);
  const issues = await continuityIssues(db, opts.worldId, opts.campaignId, bundle.calendar);
  const provider = await getAIProvider();
  if (!opts.deep || !provider.live) return { issues, provider: "offline" };
  try {
    const ctx = await buildDmContext(db, { worldId: opts.worldId, campaignId: opts.campaignId, budgetChars: 34000, maxEntities: 24 });
    const out = await provider.structured({
      name: "continuity",
      schema: continuitySchema,
      system: COPILOT_IDENTITY,
      maxTokens: 6000,
      messages: [
        {
          role: "user",
          content: `${ctx.text}\n\n# Already detected\n${issues.map((i) => `- ${i.title}`).join("\n") || "(none)"}\n\n# Task\nReview these records for continuity problems not already detected: dead characters appearing later, conflicting dates, impossible travel times, duplicate entities, contradictory lore, NPCs knowing things they shouldn't, wrong relationships, timeline conflicts, promised events never resolved. Only report genuine, specific problems; it's fine to return none. Do not change anything.`,
        },
      ],
    });
    const ids = out.issues.flatMap((i) => i.entities.map((e) => e.id).filter((x): x is string => !!x && /^[0-9a-f-]{36}$/i.test(x)));
    const known = ids.length ? await db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(and(eq(entities.worldId, opts.worldId), inArray(entities.id, ids))) : [];
    for (const [i, x] of out.issues.entries()) {
      issues.push({
        id: `ai-${i}`,
        kind: "ai",
        severity: x.severity,
        title: x.title,
        detail: x.detail,
        entityIds: x.entities.map((e) => known.find((k) => k.id === e.id)).filter((k): k is NonNullable<typeof k> => !!k),
      });
    }
    return { issues, provider: provider.name };
  } catch (err) {
    console.error("[ai] continuity review failed", err);
    return { issues, provider: "offline" };
  }
}

