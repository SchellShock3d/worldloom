/**
 * Context pipeline: User request + world + campaign + scene + relevant
 * entities/relationships/sessions/events/threads/knowledge, selected by
 * relevance and packed into a character budget. The database is the memory;
 * chat history is not.
 *
 *   ContextRetriever      → which entities matter for this request
 *   WorldContextBuilder   → world header, threads, recent history
 *   CampaignContextBuilder→ party, scene, quests, sessions, consequences
 *   NpcContextBuilder     → a single character's knowledge boundary
 */
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import {
  campaignEntityStates,
  campaigns,
  calendars,
  entities,
  facts,
  gameSessions,
  rumours,
  sceneEntities,
  scenes,
  worlds,
  type Campaign,
  type Entity,
  type World,
} from "@/server/db/schema";
import { DEFAULT_CALENDAR, formatDate, timeOfDay, resolve, type CalendarDefinition } from "@/lib/calendar";
import { fieldToText, getEntityType } from "@/lib/entity-types";
import { mentionsToPlain, toPlayerMarkdown } from "@/lib/mentions";
import { truncate } from "@/lib/utils";
import { searchWorld } from "@/server/services/search";
import { getNameIndex } from "@/server/services/history";
import { listRelationshipsFor } from "@/server/services/relationships";
import { listThreads, listQuests, listMysteries } from "@/server/services/quests";
import { listTimeline } from "@/server/services/timeline";
import { listConsequences } from "@/server/services/play";
import { getKnowledgeBoundary } from "@/server/services/knowledge";

export interface ContextRef {
  id: string;
  name: string;
  type: string;
}

export interface WorldBundle {
  world: World;
  calendar: CalendarDefinition;
  campaign: Campaign | null;
  now: number;
}

export async function loadWorldBundle(db: DB, worldId: string, campaignId?: string | null): Promise<WorldBundle> {
  const [row] = await db
    .select({ world: worlds, calendar: calendars.definition })
    .from(worlds)
    .leftJoin(calendars, eq(calendars.id, worlds.calendarId))
    .where(eq(worlds.id, worldId));
  if (!row) throw new Error("World not found");
  let campaign: Campaign | null = null;
  if (campaignId) {
    const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.worldId, worldId)));
    campaign = c ?? null;
  }
  return { world: row.world, calendar: row.calendar ?? DEFAULT_CALENDAR, campaign, now: campaign?.currentAt ?? row.world.currentAt };
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/** Entities named in free text (no @ needed), longest names first. */
export async function findNamedEntities(db: DB, worldId: string, text: string, campaignId?: string | null, limit = 12): Promise<string[]> {
  if (!text.trim()) return [];
  const index = await getNameIndex(db, worldId, campaignId);
  const lower = text.toLowerCase();
  const hits: { id: string; pos: number; len: number }[] = [];
  for (const e of index) {
    const n = e.name.toLowerCase().trim();
    if (n.length < 3) continue;
    let i = lower.indexOf(n);
    while (i >= 0) {
      const before = i === 0 ? " " : lower[i - 1]!;
      const after = lower[i + n.length] ?? " ";
      if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) {
        hits.push({ id: e.id, pos: i, len: n.length });
        break;
      }
      i = lower.indexOf(n, i + 1);
    }
  }
  hits.sort((a, b) => b.len - a.len);
  const out: string[] = [];
  for (const h of hits) if (!out.includes(h.id)) out.push(h.id);
  return out.slice(0, limit);
}

export interface RetrieveOptions {
  query?: string;
  focusIds?: string[];
  campaignId?: string | null;
  maxEntities?: number;
  expand?: boolean;
}

/**
 * Pick the entities most relevant to a request: explicit focus, entities named
 * in the request, active-scene participants, full-text matches, then one hop of
 * relationships/locations around those seeds.
 */
export async function retrieveEntities(db: DB, worldId: string, opts: RetrieveOptions): Promise<Entity[]> {
  const max = opts.maxEntities ?? 20;
  const score = new Map<string, number>();
  const bump = (id: string, s: number) => score.set(id, (score.get(id) ?? 0) + s);

  for (const id of opts.focusIds ?? []) bump(id, 100);
  if (opts.query) {
    for (const [i, id] of (await findNamedEntities(db, worldId, opts.query, opts.campaignId)).entries()) bump(id, 60 - i);
    const fts = await searchWorld(db, worldId, opts.query, { campaignId: opts.campaignId, kinds: ["entity"], limit: 10 });
    for (const r of fts) bump(r.id, 10 + r.score * 8);
  }
  if (opts.campaignId) {
    const [c] = await db.select({ sceneId: campaigns.activeSceneId, locationId: campaigns.currentLocationId }).from(campaigns).where(eq(campaigns.id, opts.campaignId));
    if (c?.locationId) bump(c.locationId, 25);
    if (c?.sceneId) {
      const present = await db.select({ id: sceneEntities.entityId }).from(sceneEntities).where(eq(sceneEntities.sceneId, c.sceneId));
      for (const p of present) bump(p.id, 30);
    }
  }

  const seeds = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.ceil(max / 2)).map(([id]) => id);
  if (opts.expand !== false && seeds.length) {
    const rels = await db.execute(sql`
      select case when source_id = any(${toPgArray(seeds)}::uuid[]) then target_id else source_id end as id, coalesce(strength, 2) as strength
      from relationships
      where world_id = ${worldId} and (source_id = any(${toPgArray(seeds)}::uuid[]) or target_id = any(${toPgArray(seeds)}::uuid[]))
      limit 200
    `);
    for (const r of rowsOfAny<{ id: string; strength: number }>(rels)) bump(r.id, 4 + Number(r.strength));
    const locs = await db.select({ id: entities.id, loc: entities.locationId }).from(entities).where(inArray(entities.id, seeds));
    for (const l of locs) if (l.loc) bump(l.loc, 6);
  }

  const ids = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, max * 2);
  if (!ids.length) return [];
  const rows = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.worldId, worldId),
        inArray(entities.id, ids),
        ne(entities.canonStatus, "archived"),
        opts.campaignId ? or(isNull(entities.campaignId), eq(entities.campaignId, opts.campaignId)) : isNull(entities.campaignId),
      ),
    );
  return rows.sort((a, b) => (score.get(b.id) ?? 0) + b.importance * 2 - ((score.get(a.id) ?? 0) + a.importance * 2)).slice(0, max);
}

function toPgArray(ids: string[]) {
  return `{${ids.join(",")}}`;
}

function rowsOfAny<T>(r: unknown): T[] {
  return (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

export function idTag(e: { id: string }) {
  return `{id:${e.id}}`;
}

/** A compact card describing one entity, for the model. */
export async function entityCard(
  db: DB,
  worldId: string,
  e: Entity,
  opts: { campaignId?: string | null; playerSafe?: boolean; relLimit?: number; bodyChars?: number; calendar?: CalendarDefinition } = {},
): Promise<string> {
  const def = getEntityType(e.type);
  const lines: string[] = [];
  let status = e.status;
  let locationId = e.locationId;
  let overlay: string[] = [];
  if (opts.campaignId) {
    const [st] = await db
      .select()
      .from(campaignEntityStates)
      .where(and(eq(campaignEntityStates.campaignId, opts.campaignId), eq(campaignEntityStates.entityId, e.id)));
    if (st) {
      if (st.status) status = `${st.status} (in this campaign; canon: ${e.status ?? "—"})`;
      if (st.locationId) locationId = st.locationId;
      if (st.reputation !== null) overlay.push(`reputation with party ${st.reputation > 0 ? "+" : ""}${st.reputation}`);
      if (st.attitude) overlay.push(`attitude: ${st.attitude}`);
      overlay.push(`players' knowledge: ${st.knowledge}`);
    }
  }
  lines.push(`### [${def.label}] ${e.name} ${idTag(e)}`);
  const meta: string[] = [];
  if (status) meta.push(`status: ${status}`);
  if (locationId) {
    const [loc] = await db.select({ name: entities.name, id: entities.id }).from(entities).where(and(eq(entities.id, locationId), eq(entities.worldId, worldId)));
    if (loc) meta.push(`located in: ${loc.name} ${idTag(loc)}`);
  }
  if (e.aliases.length) meta.push(`aka ${e.aliases.join(", ")}`);
  if (!opts.playerSafe) meta.push(`visibility: ${e.visibility}`);
  if (e.canonStatus !== "canon") meta.push(`canon: ${e.canonStatus}`);
  if (meta.length) lines.push(meta.join(" · "));
  if (overlay.length && !opts.playerSafe) lines.push(overlay.join(" · "));
  if (e.summary) lines.push(e.summary);

  for (const f of def.fields) {
    if (opts.playerSafe && f.section === "dm") continue;
    const v = e.fields[f.key];
    if (v === undefined || v === null || v === "") continue;
    lines.push(`- ${f.label}${f.section === "dm" ? " (DM only)" : ""}: ${truncate(fieldToText(f, v).replace(/\s+/g, " "), 300)}`);
  }
  const body = opts.playerSafe ? toPlayerMarkdown(e.body) : e.body;
  if (body.trim()) lines.push(truncate(mentionsToPlain(body).replace(/\n{2,}/g, "\n"), opts.bodyChars ?? 700));
  if (!opts.playerSafe && e.dmNotes.trim()) lines.push(`DM notes: ${truncate(mentionsToPlain(e.dmNotes), 400)}`);

  const rels = await listRelationshipsFor(db, worldId, e.id, opts.campaignId);
  const relShown = rels.filter((r) => !opts.playerSafe || r.visibility !== "dm_only").slice(0, opts.relLimit ?? 8);
  if (relShown.length) {
    lines.push(
      `Relationships: ${relShown
        .map((r) => `${r.label} ${r.other.name} ${idTag(r.other)}${r.description ? ` (${truncate(r.description, 60)})` : ""}`)
        .join("; ")}`,
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const CREATIVITY = {
  grounded: "Creative latitude: grounded. Stay close to established facts; prefer small, plausible developments over dramatic twists.",
  balanced: "Creative latitude: balanced. Mix expected developments with the occasional surprise, always consistent with canon.",
  inventive: "Creative latitude: inventive. Bold, surprising ideas are welcome, as long as they stay consistent with canon.",
} as const;

export function worldHeader(b: WorldBundle) {
  const w = b.world;
  const r = resolve(b.calendar, b.now);
  return [
    `# World: ${w.name}`,
    `Genre: ${w.genre}${w.tone ? ` · Tone: ${w.tone}` : ""} · Magic: ${w.magicLevel} · Technology: ${w.techLevel}`,
    w.description ? truncate(w.description, 800) : "",
    `Current in-world date: ${formatDate(b.calendar, b.now, { weekday: true, precision: "minute" })} (${timeOfDay(b.calendar, b.now)}${r.season ? `, ${r.season}` : ""}). Absolute time value: ${b.now}.`,
    `Calendar: ${b.calendar.months.length} months, ${b.calendar.weekdays.length}-day weeks, ${b.calendar.hoursPerDay} hours/day, ${b.calendar.minutesPerHour} minutes/hour. One day = ${b.calendar.hoursPerDay * b.calendar.minutesPerHour} time units.`,
    w.settings.houseRules ? `House rules / style notes: ${truncate(w.settings.houseRules, 500)}` : "",
    CREATIVITY[w.settings.aiCreativity ?? "balanced"],
  ]
    .filter(Boolean)
    .join("\n");
}

export async function campaignSection(db: DB, b: WorldBundle): Promise<string> {
  const c = b.campaign;
  if (!c) return "";
  const parts: string[] = [`# Campaign: ${c.name}`];
  if (c.premise) parts.push(truncate(c.premise, 700));
  if (c.currentLocationId) {
    const [loc] = await db.select({ id: entities.id, name: entities.name }).from(entities).where(eq(entities.id, c.currentLocationId));
    if (loc) parts.push(`Party is currently at: ${loc.name} ${idTag(loc)}`);
  }
  if (c.currentWeather) parts.push(`Weather: ${c.currentWeather}`);
  const pcs = await db.select().from(entities).where(and(eq(entities.campaignId, c.id), eq(entities.type, "pc")));
  if (pcs.length) {
    parts.push(
      `Party (${c.partyName}): ${pcs
        .map((p) => {
          const f = p.fields as Record<string, unknown>;
          return `${p.name} ${idTag(p)} — ${[f.species, f.className, f.level ? `level ${f.level}` : null].filter(Boolean).join(" ")}${p.status && p.status !== "active" ? ` (${p.status})` : ""}${f.playerName ? `, played by ${f.playerName}` : ""}`;
        })
        .join("; ")}`,
    );
  }
  if (c.partyInventory.trim()) parts.push(`Party inventory: ${truncate(c.partyInventory.replace(/\n/g, "; "), 400)}`);
  if (c.activeSceneId) {
    const [s] = await db.select().from(scenes).where(and(eq(scenes.id, c.activeSceneId), eq(scenes.campaignId, c.id)));
    if (s) {
      const present = await db
        .select({ id: entities.id, name: entities.name, type: entities.type })
        .from(sceneEntities)
        .innerJoin(entities, eq(entities.id, sceneEntities.entityId))
        .where(and(eq(sceneEntities.sceneId, s.id), eq(entities.worldId, c.worldId)));
      parts.push(
        `Active scene: “${s.name}”${s.mood ? ` · mood: ${s.mood}` : ""}${s.lighting ? ` · lighting: ${s.lighting}` : ""}${s.weather ? ` · weather: ${s.weather}` : ""}\n${truncate(mentionsToPlain(s.description), 400)}${
          present.length ? `\nPresent: ${present.map((p) => `${p.name} ${idTag(p)}`).join(", ")}` : ""
        }`,
      );
    }
  }
  return parts.join("\n");
}

export async function threadsSection(db: DB, worldId: string, limit = 10) {
  const threads = (await listThreads(db, worldId, { statuses: ["active", "escalating", "dormant", "paused"] })).slice(0, limit);
  if (!threads.length) return "";
  return [
    "# World threads (ongoing processes)",
    ...threads.map((t) => {
      const stage = t.stages[t.thread.stageIndex];
      return `- ${t.name} ${idTag(t)} — ${t.thread.status}, progress ${t.thread.progress}%, urgency ${t.thread.urgency}/5, momentum ${t.thread.momentum}/week${stage ? `, stage: ${stage.title}` : ""}${t.thread.nextMilestone ? `, next: ${t.thread.nextMilestone}` : ""}${
        t.actors.length ? `, actors: ${t.actors.map((a) => `${a.name} ${idTag(a)}`).join(", ")}` : ""
      }${t.thread.goals ? `\n  goals: ${truncate(t.thread.goals, 200)}` : ""}${t.thread.possibleOutcomes ? `\n  possible outcomes: ${truncate(t.thread.possibleOutcomes, 200)}` : ""}`;
    }),
  ].join("\n");
}

export async function recentSessionsSection(db: DB, campaignId: string, limit = 3) {
  const ss = await db.select().from(gameSessions).where(eq(gameSessions.campaignId, campaignId)).orderBy(desc(gameSessions.number)).limit(limit);
  const usable = ss.filter((s) => s.recap.trim() || s.notes.trim());
  if (!usable.length) return "";
  return [
    "# Recent sessions",
    ...usable.map((s) => `## Session ${s.number}${s.title ? `: ${s.title}` : ""}\n${truncate(mentionsToPlain(s.recap.trim() || s.notes), 900)}`),
  ].join("\n");
}

export async function timelineSection(db: DB, b: WorldBundle, limit = 10) {
  const past = await listTimeline(db, b.world.id, { campaignId: b.campaign?.id ?? null, to: b.now, order: "desc", limit });
  const future = await listTimeline(db, b.world.id, { campaignId: b.campaign?.id ?? null, from: b.now + 1, order: "asc", limit: 5 });
  if (!past.length && !future.length) return "";
  const fmt = (e: (typeof past)[number]) =>
    `- ${formatDate(b.calendar, e.startAt, { precision: e.precision })}: ${e.name} ${idTag(e)}${e.location ? ` at ${e.location.name}` : ""}${e.participants.length ? ` (involving ${e.participants.map((p) => p.name).join(", ")})` : ""}${e.summary ? ` — ${truncate(e.summary, 160)}` : ""}`;
  return [
    "# Timeline",
    past.length ? "Recent events:" : "",
    ...past.map(fmt),
    future.length ? "Scheduled / upcoming:" : "",
    ...future.map(fmt),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function questsSection(db: DB, worldId: string, campaignId: string) {
  const qs = await listQuests(db, worldId, campaignId, ["active", "available"]);
  if (!qs.length) return "";
  return [
    "# Quests",
    ...qs.slice(0, 12).map(
      (q) =>
        `- ${q.name} ${idTag(q)} — ${q.status}${q.giverName ? `, from ${q.giverName}` : ""}${q.summary ? `: ${truncate(q.summary, 140)}` : ""}${
          q.objectives.length ? `\n  objectives: ${q.objectives.map((o) => `[${o.status === "done" ? "x" : o.status === "failed" ? "failed" : " "}] ${o.text}`).join("; ")}` : ""
        }`,
    ),
  ].join("\n");
}

export async function consequencesSection(db: DB, b: WorldBundle) {
  if (!b.campaign) return "";
  const cs = await listConsequences(db, b.world.id, b.campaign.id, ["pending", "foreshadowed"]);
  if (!cs.length) return "";
  return [
    "# Pending consequences, promises and reactions",
    ...cs.slice(0, 12).map(
      ({ c, actorName }) =>
        `- {consequence:${c.id}} [${c.kind}] ${c.title}${actorName ? ` (actor: ${actorName})` : ""} — ${c.status}, severity ${c.severity}/5${c.dueAt !== null ? `, due ${formatDate(b.calendar, c.dueAt)}${c.dueAt < b.now ? " (OVERDUE)" : ""}` : ""}${c.description ? `: ${truncate(mentionsToPlain(c.description), 160)}` : ""}`,
    ),
  ].join("\n");
}

export async function mysteriesSection(db: DB, worldId: string, campaignId: string) {
  const ms = await listMysteries(db, worldId, campaignId);
  const open = ms.filter((m) => m.mystery.status !== "solved" && m.mystery.status !== "abandoned");
  if (!open.length) return "";
  return [
    "# Open mysteries",
    ...open.slice(0, 6).map(
      (m) =>
        `- ${m.name} ${idTag(m)}: ${m.mystery.question}\n  truth (DM only): ${truncate(m.mystery.truth, 200)}\n  clues: ${m.clues
          .map((c) => `{clue:${c.id}} ${c.discovered ? "[found]" : "[hidden]"}${c.isRedHerring ? " [red herring]" : ""} ${truncate(c.description, 80)}`)
          .join("; ")}`,
    ),
  ].join("\n");
}

export async function truthsSection(db: DB, worldId: string, subjectIds: string[]) {
  if (!subjectIds.length) return "";
  const rows = await db
    .select({ statement: facts.statement, holderId: facts.holderId, subjectId: facts.subjectId, truthStatus: facts.truthStatus, holderName: entities.name })
    .from(facts)
    .leftJoin(entities, eq(entities.id, facts.holderId))
    .where(and(eq(facts.worldId, worldId), or(inArray(facts.subjectId, subjectIds), inArray(facts.holderId, subjectIds))))
    .orderBy(asc(facts.createdAt))
    .limit(30);
  if (!rows.length) return "";
  return [
    "# Knowledge ledger",
    ...rows.map((r) => (r.holderId ? `- ${r.holderName} ${r.truthStatus === "false" ? "wrongly believes" : r.truthStatus === "partial" ? "partly knows" : "knows"}: ${r.statement}` : `- WORLD TRUTH: ${r.statement}`)),
  ].join("\n");
}

export async function rumoursSection(db: DB, worldId: string, limit = 6) {
  const rows = await db
    .select({ id: entities.id, name: entities.name, claim: rumours.claim, accuracy: rumours.accuracy })
    .from(rumours)
    .innerJoin(entities, eq(entities.id, rumours.entityId))
    .where(and(eq(entities.worldId, worldId), ne(entities.canonStatus, "archived"), inArray(entities.status, ["circulating", "fading"])))
    .orderBy(desc(entities.updatedAt))
    .limit(limit);
  if (!rows.length) return "";
  return ["# Rumours circulating", ...rows.map((r) => `- “${truncate(r.claim, 160)}” (accuracy ${r.accuracy}%) ${idTag(r)}`)].join("\n");
}

// ---------------------------------------------------------------------------
// Full DM context
// ---------------------------------------------------------------------------

export interface BuildContextOptions {
  worldId: string;
  campaignId?: string | null;
  query?: string;
  focusIds?: string[];
  budgetChars?: number;
  maxEntities?: number;
  sections?: { threads?: boolean; sessions?: boolean; timeline?: boolean; quests?: boolean; consequences?: boolean; mysteries?: boolean; truths?: boolean; rumours?: boolean };
}

export interface BuiltContext {
  text: string;
  refs: ContextRef[];
  bundle: WorldBundle;
}

export async function buildDmContext(db: DB, opts: BuildContextOptions): Promise<BuiltContext> {
  const budget = opts.budgetChars ?? 30000;
  const s = { threads: true, sessions: true, timeline: true, quests: true, consequences: true, mysteries: true, truths: true, rumours: true, ...opts.sections };
  const bundle = await loadWorldBundle(db, opts.worldId, opts.campaignId);
  const cid = bundle.campaign?.id ?? null;
  const ents = await retrieveEntities(db, opts.worldId, { query: opts.query, focusIds: opts.focusIds, campaignId: cid, maxEntities: opts.maxEntities ?? 18 });

  const sections: string[] = [worldHeader(bundle)];
  if (bundle.campaign) sections.push(await campaignSection(db, bundle));
  let used = sections.join("\n\n").length;
  const add = (text: string) => {
    if (!text) return;
    if (used + text.length > budget) {
      const room = budget - used - 40;
      if (room > 400) {
        sections.push(text.slice(0, room) + "\n…(truncated)");
        used = budget;
      }
      return;
    }
    sections.push(text);
    used += text.length + 2;
  };

  // Relevant entities first: they are what the request is about.
  const cards: string[] = [];
  for (const e of ents) cards.push(await entityCard(db, opts.worldId, e, { campaignId: cid, calendar: bundle.calendar }));
  if (cards.length) add(`# Relevant entities\n${cards.join("\n\n")}`);
  if (s.truths) add(await truthsSection(db, opts.worldId, ents.slice(0, 8).map((e) => e.id)));
  if (s.threads) add(await threadsSection(db, opts.worldId));
  if (cid && s.quests) add(await questsSection(db, opts.worldId, cid));
  if (cid && s.sessions) add(await recentSessionsSection(db, cid));
  if (s.consequences) add(await consequencesSection(db, bundle));
  if (cid && s.mysteries) add(await mysteriesSection(db, opts.worldId, cid));
  if (s.timeline) add(await timelineSection(db, bundle));
  if (s.rumours) add(await rumoursSection(db, opts.worldId));

  return { text: sections.join("\n\n"), refs: ents.map((e) => ({ id: e.id, name: e.name, type: e.type })), bundle };
}

// ---------------------------------------------------------------------------
// NPC roleplay context (knowledge boundary)
// ---------------------------------------------------------------------------

export async function buildNpcContext(db: DB, worldId: string, npcId: string, campaignId?: string | null) {
  const bundle = await loadWorldBundle(db, worldId, campaignId);
  const [npc] = await db.select().from(entities).where(and(eq(entities.id, npcId), eq(entities.worldId, worldId)));
  if (!npc) throw new Error("Character not found");
  const parts: string[] = [];
  parts.push(`You are roleplaying ${npc.name}. Everything below is what ${npc.name} knows. They know nothing else about hidden events, secrets, or other characters' private plans.`);
  parts.push(`It is ${formatDate(bundle.calendar, bundle.now, { weekday: true })}, ${timeOfDay(bundle.calendar, bundle.now)}.${bundle.campaign?.currentWeather ? ` Weather: ${bundle.campaign.currentWeather}.` : ""}`);
  // Their own card, including their own secrets.
  parts.push(await entityCard(db, worldId, npc, { campaignId: bundle.campaign?.id, bodyChars: 1200, relLimit: 12 }));
  const { own, viaGroups } = await getKnowledgeBoundary(db, worldId, npcId, bundle.campaign?.id);
  const knows = own.map((f) => `${f.fact.statement}${f.fact.truthStatus === "false" ? " (they believe this; it may not be true)" : f.fact.truthStatus === "partial" ? " (partial picture)" : ""}${f.fact.confidence < 50 ? " (unsure)" : ""}`);
  const circles = viaGroups.map((f) => `(${f.holderName}) ${f.fact.statement}`);
  if (knows.length) parts.push(`# What ${npc.name} knows or believes\n${knows.map((k) => `- ${k}`).join("\n")}`);
  if (circles.length) parts.push(`# Known within their circles\n${circles.map((k) => `- ${k}`).join("\n")}`);
  // Common knowledge around them: public entities in their location chain and public rumours there.
  if (npc.locationId) {
    const around = await db
      .select()
      .from(entities)
      .where(and(eq(entities.worldId, worldId), or(eq(entities.locationId, npc.locationId), eq(entities.id, npc.locationId)), inArray(entities.visibility, ["public", "discovered"])))
      .limit(10);
    const cards: string[] = [];
    for (const e of around) if (e.id !== npc.id) cards.push(await entityCard(db, worldId, e, { playerSafe: true, relLimit: 3, bodyChars: 250 }));
    if (cards.length) parts.push(`# Common knowledge about their surroundings\n${cards.join("\n\n")}`);
  }
  const publicEvents = await listTimeline(db, worldId, { campaignId: bundle.campaign?.id ?? null, to: bundle.now, order: "desc", limit: 6, visibleOnly: true });
  const news = publicEvents.map((e) => `${e.name}${e.summary ? `: ${truncate(e.summary, 120)}` : ""}`);
  if (news.length) parts.push(`# Public news they'd have heard\n${news.map((n) => `- ${n}`).join("\n")}`);
  return { text: parts.join("\n\n"), npc, bundle, knows, circles, news };
}
