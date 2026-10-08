/** State-changing AI tasks. Every one ends in a proposal batch. */
import { and, desc, eq, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, gameSessions, travelPlans } from "@/server/db/schema";
import { describeDuration, formatDate } from "@/lib/calendar";
import { getEntityType } from "@/lib/entity-types";
import { mentionsToPlain } from "@/lib/mentions";
import { buildDmContext, loadWorldBundle, entityCard } from "../context";
import { typeReference } from "../prompts";
import { emptyChangeSet } from "../changeset";
import { offlineGenerate, detectType } from "../offline/generate";
import { offlineProcessSession } from "../offline/session";
import { offlineAdvance } from "../offline/advance";
import { Rng, hashSeed } from "../offline/rng";
import { runChangeSetTask, type ChangeSetTaskResult } from "./run";

interface Base {
  db: DB;
  worldId: string;
  campaignId: string | null;
  userId: string;
}

// ---------------------------------------------------------------------------
// Generate (create a town, NPC, religion, faction, tavern, shop, dungeon, rumours, quests, history…)
// ---------------------------------------------------------------------------

export async function generateContent(b: Base & { request: string; type?: string | null; count?: number; locationId?: string | null; focusIds?: string[] }): Promise<ChangeSetTaskResult> {
  const ctx = await buildDmContext(b.db, { worldId: b.worldId, campaignId: b.campaignId, query: b.request, focusIds: [...(b.focusIds ?? []), ...(b.locationId ? [b.locationId] : [])], budgetChars: 24000 });
  const type = b.type ?? detectType(b.request);
  return runChangeSetTask({
    ...b,
    source: "generate",
    title: truncateTitle(b.request),
    context: ctx.text,
    now: ctx.bundle.now,
    calendar: ctx.bundle.calendar,
    instructions: `The DM asks: “${b.request}”${type ? ` (likely type: ${type})` : ""}${b.count ? ` — create ${b.count}` : ""}.
Create what was asked, woven into the existing world: tie new things to existing places, factions, threads and NPCs with relationships wherever it makes sense, and avoid duplicating anything that already exists.
Use newEntities for entities (with type-specific fields), relationships to connect them, rumours for rumours, events for historical events. Leave other arrays empty unless clearly useful.

Entity types and fields:
${typeReference()}`,
    offline: () => offlineGenerate(b.db, { worldId: b.worldId, campaignId: b.campaignId, request: b.request, type, count: b.count, locationId: b.locationId }),
  });
}

function truncateTitle(s: string) {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > 80 ? t.slice(0, 77) + "…" : t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------------------
// End-of-session processing
// ---------------------------------------------------------------------------

export async function processSessionNotes(b: Base & { sessionId: string }): Promise<ChangeSetTaskResult> {
  if (!b.campaignId) throw new Error("Session processing needs a campaign.");
  const [session] = await b.db.select().from(gameSessions).where(and(eq(gameSessions.id, b.sessionId), eq(gameSessions.campaignId, b.campaignId)));
  if (!session) throw new Error("Session not found");
  if (!session.notes.trim()) throw new Error("This session has no notes to process yet.");
  const notesPlain = mentionsToPlain(session.notes);
  const focus = [...session.notes.matchAll(/\(entity:([0-9a-f-]{36})\)/g)].map((m) => m[1]!);
  const ctx = await buildDmContext(b.db, { worldId: b.worldId, campaignId: b.campaignId, query: notesPlain.slice(0, 4000), focusIds: focus.slice(0, 20), budgetChars: 26000, maxEntities: 24 });
  return runChangeSetTask({
    ...b,
    source: "session",
    title: `Session ${session.number}${session.title ? `: ${session.title}` : ""} — proposed updates`,
    sessionId: session.id,
    context: ctx.text,
    now: ctx.bundle.now,
    calendar: ctx.bundle.calendar,
    instructions: `These are the DM's raw notes from session ${session.number}. Analyse them and PROPOSE updates to the world. Do not invent events that aren't in the notes; you may infer obvious consequences.

Session notes:
"""
${notesPlain.slice(0, 16000)}
"""

Produce:
- recap: a readable recap of the session (markdown, past tense, 1–4 short paragraphs or bullets) suitable to read aloud next time.
- events: notable things that happened (kind "campaign", offsetDays 0 or small negative), with involved entities and location.
- campaignStates: NPC/faction status changes in THIS campaign (dead, missing, imprisoned…), location changes, reputation changes toward the party, and entities the players discovered.
- relationships: new relationships revealed or formed.
- questUpdates: quests started, progressed (objectives done/failed/new), completed or failed.
- metricChanges: faction influence or place safety shifts caused by the party.
- facts: new knowledge — what specific NPCs now know (holder = that NPC), what the party learned (holder = a PC if clear), or world truths revealed.
- consequences: promises NPCs made (kind "promise", with dueInDays), reactions the world owes the party (kind "reaction"), and likely consequences of player decisions (kind "consequence").
- consequenceUpdates: existing pending consequences ({consequence:<id>} in context) that resolved or triggered.
- clueUpdates: existing clues ({clue:<id>} in context) the players found.
- threadUpdates: world threads the party advanced or set back.
- newEntities: important new NPCs/places introduced in the notes that don't exist yet.
- inventoryAdd / inventoryRemove: notable party items gained or lost.`,
    offline: () => offlineProcessSession(b.db, { worldId: b.worldId, campaignId: b.campaignId!, notes: session.notes, sessionNumber: session.number }),
  });
}

// ---------------------------------------------------------------------------
// Advance World
// ---------------------------------------------------------------------------

/** Journeys underway that reach their destination by `toAt`, in arrival order. */
async function arrivingJourneys(db: DB, worldId: string, campaignId: string, toAt: number) {
  const trips = await db
    .select({ id: travelPlans.id, name: travelPlans.name, destinationId: travelPlans.destinationId, departedAt: travelPlans.departedAt, estimatedMinutes: travelPlans.estimatedMinutes, dest: entities.name })
    .from(travelPlans)
    .leftJoin(entities, and(eq(entities.id, travelPlans.destinationId), eq(entities.worldId, worldId)))
    .where(and(eq(travelPlans.campaignId, campaignId), eq(travelPlans.worldId, worldId), eq(travelPlans.status, "underway"), sql`${travelPlans.departedAt} + coalesce(${travelPlans.estimatedMinutes}, 0) <= ${toAt}`));
  return trips
    .sort((a, b) => (a.departedAt ?? 0) + (a.estimatedMinutes ?? 0) - ((b.departedAt ?? 0) + (b.estimatedMinutes ?? 0)))
    .map((t) => ({ travelId: t.id, destinationId: t.destinationId && t.dest ? t.destinationId : null, name: t.dest ?? (t.name || "journey's end") }));
}

export async function advanceWorld(b: Base & { minutes: number; note?: string }): Promise<ChangeSetTaskResult> {
  if (!Number.isFinite(b.minutes) || b.minutes <= 0) throw new Error("Choose an amount of time to advance.");
  const bundle = await loadWorldBundle(b.db, b.worldId, b.campaignId);
  const fromAt = bundle.now;
  const toAt = fromAt + b.minutes;
  const span = describeDuration(bundle.calendar, b.minutes);
  const ctx = await buildDmContext(b.db, { worldId: b.worldId, campaignId: b.campaignId, query: b.note ?? "", budgetChars: 28000, maxEntities: 14 });
  const arrivals = b.campaignId ? await arrivingJourneys(b.db, b.worldId, b.campaignId, toAt) : [];
  return runChangeSetTask({
    ...b,
    source: "advance",
    title: `Advance world: ${span}`,
    context: ctx.text,
    now: fromAt,
    calendar: bundle.calendar,
    fromAt,
    toAt,
    leadingDrafts: [
      {
        kind: "advance_clock",
        rationale: `${formatDate(bundle.calendar, fromAt)} → ${formatDate(bundle.calendar, toAt)}${arrivals.length ? `; journeys end: ${arrivals.map((x) => x.name).join(", ")}` : ""}`,
        payload: { fromAt, toAt, ...(arrivals.length && { arrivals }) },
      },
    ],
    instructions: `ADVANCE WORLD: ${span} pass, from ${formatDate(bundle.calendar, fromAt)} to ${formatDate(bundle.calendar, toAt)} (${Math.round(b.minutes / (bundle.calendar.hoursPerDay * bundle.calendar.minutesPerHour))} days).${b.note ? `\nDM note: ${b.note}` : ""}

Examine the world threads, faction goals and current plans, NPC goals, scheduled/upcoming events, pending consequences and promises, travel, and recent campaign actions. Propose the developments that would LOGICALLY occur in this span, whether or not the party is present. Be proportionate to the time: a day brings small shifts; a month can bring turning points.
The dead stay dead: characters whose status is dead (in canon or in this campaign), and factions that are destroyed or disbanded, cannot act, travel, lead or take part in new events. A thread or consequence that depended on them stalls or passes to someone else, and you must say who.

Use:
- threadUpdates: progress for each thread that moves (respect momentum; escalate or resolve when warranted).
- events: concrete developments with offsetDays between 0 and ${Math.max(0, Math.floor(b.minutes / (bundle.calendar.hoursPerDay * bundle.calendar.minutesPerHour)))}, kind "world" or "faction" (or "campaign" if tied to the party).
- metricChanges: shifts in faction influence, place safety, prices, morale (label them clearly).
- entityUpdates: NPCs moving, status changes in world canon (e.g. an NPC falls ill), places changing.
- rumours: how news spreads; different places may hear different, distorted versions (vary accuracy).
- consequenceUpdates: pending consequences/promises that land or lapse in this span.
- consequences: new pending reactions set in motion.
- facts: who now knows what (e.g. an NPC learning of an event).
Keep it understandable: 3–12 proposals for short spans, up to ~20 for long spans. No invisible mass changes.`,
    offline: () => offlineAdvance(b.db, { worldId: b.worldId, campaignId: b.campaignId, fromAt, toAt, calendar: bundle.calendar }),
  });
}

// ---------------------------------------------------------------------------
// Cause & effect: consequences of a player action
// ---------------------------------------------------------------------------

export async function suggestConsequences(b: Base & { action: string; focusIds?: string[] }): Promise<ChangeSetTaskResult> {
  const ctx = await buildDmContext(b.db, { worldId: b.worldId, campaignId: b.campaignId, query: b.action, focusIds: b.focusIds, budgetChars: 24000 });
  return runChangeSetTask({
    ...b,
    source: "consequences",
    title: `Consequences: ${truncateTitle(b.action)}`,
    context: ctx.text,
    now: ctx.bundle.now,
    calendar: ctx.bundle.calendar,
    instructions: `The players did this: “${b.action}”.
Suggest the logical consequences based on the existing world state: who reacts, what power shifts, what opportunities or threats open. Prefer 3–7 grounded consequences.
Use consequences (pending outcomes with sensible dueInDays and an actor), metricChanges (influence/safety/prosperity), threadUpdates, campaignStates (reputation shifts), events only for immediate effects, and rumours for how word spreads.`,
    offline: async () => {
      const rng = new Rng(hashSeed(b.action));
      const cs = emptyChangeSet();
      const named = ctx.refs.slice(0, 6);
      const npcs = named.filter((r) => ["npc", "faction", "organization", "settlement"].includes(r.type));
      for (const n of npcs.slice(0, 3)) {
        cs.consequences.push({
          kind: n.type === "npc" ? "reaction" : "consequence",
          title: `${n.name} responds to the party's actions`,
          description: `Following “${b.action}”, ${n.name} ${rng.pick(["seeks the party out", "makes a move of their own", "quietly adjusts their plans", "demands an explanation"])}.`,
          cause: b.action,
          actor: { id: n.id, ref: null, name: n.name },
          severity: rng.int(2, 4),
          dueInDays: rng.int(2, 14),
          rationale: `${n.name} is connected to what happened.`,
        });
      }
      const factions = named.filter((r) => r.type === "faction");
      if (factions[0]) cs.metricChanges.push({ entity: { id: factions[0].id, ref: null, name: factions[0].name }, label: "Influence", delta: -rng.int(3, 10), rationale: "The party's action weakens their position." });
      cs.rumours.push({ title: "Word gets around", claim: `People are talking about how ${b.action.toLowerCase()}.`, truth: b.action, accuracy: rng.int(40, 80), distortion: "Details get embellished.", originEvent: null, circulatesIn: [], spreadBy: [], rationale: "News travels." });
      cs.summary = npcs.length
        ? `Rule-based suggestions for ${npcs.map((n) => n.name).join(", ")}. Connect an AI model for richer cause-and-effect reasoning.`
        : "Mention the people, factions or places involved (by name) for more specific consequences.";
      return cs;
    },
  });
}

// ---------------------------------------------------------------------------
// Lore tools on a single entity: expand, summarize, connect, motivations
// ---------------------------------------------------------------------------

export type LoreAction = "expand" | "summarize" | "connect" | "motivations" | "secrets";

export async function loreAction(b: Base & { entityId: string; action: LoreAction; guidance?: string }): Promise<ChangeSetTaskResult> {
  const [e] = await b.db.select().from(entities).where(and(eq(entities.id, b.entityId), eq(entities.worldId, b.worldId)));
  if (!e) throw new Error("Entity not found");
  const def = getEntityType(e.type);
  const ctx = await buildDmContext(b.db, { worldId: b.worldId, campaignId: b.campaignId, focusIds: [e.id], query: `${e.name} ${e.summary}`, budgetChars: 22000 });
  const instructions: Record<LoreAction, string> = {
    expand: `Expand the article for ${e.name} {id:${e.id}}: add rich, specific, playable detail consistent with everything known. Use one entityUpdates item with appendBody (markdown, 2–5 paragraphs or sections; secrets in a :::dm block). Suggest up to 3 relationships to existing entities if clearly implied.`,
    summarize: `Write a crisp 1–2 sentence summary of ${e.name} {id:${e.id}} from everything known. Use one entityUpdates item with summary only.`,
    connect: `Suggest meaningful connections between ${e.name} {id:${e.id}} and EXISTING entities in the context (3–8 relationships). Each needs a specific description. Do not create new entities.`,
    motivations: `Generate motivations, goals and fears for ${e.name} {id:${e.id}} that fit their situation, relationships and the active world threads. Use one entityUpdates item with appendBody containing a "## Motivations" section, and up to 2 facts about what they know or want.`,
    secrets: `Invent 1–3 secrets for ${e.name} {id:${e.id}} that connect to existing threads, factions or mysteries. Use entityUpdates.appendBody inside a :::dm block, and facts (world truths, holder null) for the secrets.`,
  };
  return runChangeSetTask({
    ...b,
    source: "generate",
    title: `${b.action[0]!.toUpperCase()}${b.action.slice(1)}: ${e.name}`,
    context: `${ctx.text}\n\n# Focus\n${await entityCard(b.db, b.worldId, e, { campaignId: b.campaignId, bodyChars: 3000, relLimit: 20 })}`,
    now: ctx.bundle.now,
    calendar: ctx.bundle.calendar,
    instructions: `${instructions[b.action]}${b.guidance ? `\nDM guidance: ${b.guidance}` : ""}\nType reference: ${typeReference([def.key])}`,
    offline: async () => {
      const cs = emptyChangeSet();
      const rng = new Rng(hashSeed(e.id, b.action));
      const target = { id: e.id, ref: null, name: e.name };
      if (b.action === "summarize") {
        const plain = mentionsToPlain(e.body).replace(/:::dm[\s\S]*?:::/g, "").replace(/[#*_>]/g, "").trim();
        const first = plain.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
        cs.entityUpdates.push({ target, summary: first || `${def.label}${e.locationId ? " of note" : ""}.`, appendBody: null, status: null, location: null, rationale: "Condensed from the article." });
      } else if (b.action === "connect") {
        const others = ctx.refs.filter((r) => r.id !== e.id).slice(0, 5);
        for (const o of others) {
          const type = o.type === "faction" ? (e.type === "npc" ? "member_of" : "related_to") : o.type === "settlement" || o.type === "location" ? "related_to" : o.type === "npc" && e.type === "npc" ? rng.pick(["friend_of", "rival_of", "related_to"]) : "related_to";
          cs.relationships.push({ source: target, target: { id: o.id, ref: null, name: o.name }, type, description: "Suggested from shared context; refine it.", rationale: `${o.name} appears in related records.` });
        }
      } else {
        const B = await import("../offline/banks");
        const text =
          b.action === "motivations"
            ? `## Motivations\n- Wants to ${rng.pick(B.MOTIVATIONS)}.\n- Fears ${rng.pick(B.FEARS)}.`
            : b.action === "secrets"
              ? `:::dm\n${e.name} ${rng.pick(B.SECRETS)}.\n:::`
              : `## Details\n${rng.pick(B.PERSONALITY)}. ${rng.pick(B.APPEARANCE)}.\n\n:::dm\n${rng.pick(B.SECRETS)}.\n:::`;
        cs.entityUpdates.push({ target, summary: null, appendBody: text, status: null, location: null, rationale: "Offline suggestion from Worldloom's tables." });
      }
      cs.summary = "Offline suggestions. Connect an AI model for context-aware writing.";
      return cs;
    },
  });
}

// ---------------------------------------------------------------------------
// Onboarding: proposed world foundation
// ---------------------------------------------------------------------------

export async function worldFoundation(b: Base & { answers: { themes: string; conflict: string; inspirations: string; regions: string; notes: string } }): Promise<ChangeSetTaskResult> {
  const bundle = await loadWorldBundle(b.db, b.worldId, null);
  const w = bundle.world;
  const ctx = `# World: ${w.name}\nGenre: ${w.genre} · Tone: ${w.tone} · Magic: ${w.magicLevel} · Technology: ${w.techLevel}\n${w.description}\nCurrent date: ${formatDate(bundle.calendar, bundle.now)}`;
  return runChangeSetTask({
    ...b,
    campaignId: null,
    source: "onboarding",
    title: `Foundation for ${w.name}`,
    context: ctx,
    now: bundle.now,
    calendar: bundle.calendar,
    maxTokens: 16000,
    instructions: `Build a PROPOSED foundation for this new world from the DM's answers:
- Themes: ${b.answers.themes || "(none given)"}
- Central conflict: ${b.answers.conflict || "(none given)"}
- Inspirations: ${b.answers.inspirations || "(none given)"}
- Regions / geography wanted: ${b.answers.regions || "(none given)"}
- Other notes: ${b.answers.notes || "(none)"}

Create, as newEntities: a short world-overview lore page (type lore, importance 2), 1 continent, 3–5 major regions (located in the continent), 2–4 starting nations (located in regions), 2–3 religions each with a deity, 3–5 major factions with clear goals, and 2–3 world_thread entities representing the ongoing conflicts. Add 4–6 historical events (events with yearsAgo) that explain how the world got here. Connect everything with relationships (nations at war/allied, factions controlling regions, deities worshipped by religions, factions driving threads). Keep names original and evocative; avoid famous published settings.

Entity types and fields:
${typeReference(["lore", "continent", "region", "nation", "religion", "deity", "faction", "world_thread", "settlement"])}`,
    offline: async () => offlineFoundation(b.db, b.worldId, b.answers),
  });
}

async function offlineFoundation(db: DB, worldId: string, answers: { themes: string; conflict: string }) {
  const rng = new Rng(hashSeed(worldId, answers.themes, answers.conflict));
  const cs = emptyChangeSet();
  const cont = { ref: "continent", name: rng.pick(["Aldmere", "Varenthe", "Osk", "Calduin", "Seravel"]) };
  cs.newEntities.push(ent("lore", "overview", "The World at a Glance", `An overview of the world and its conflicts.`, `${answers.themes ? `Themes: ${answers.themes}.` : ""}\n\n${answers.conflict ? `The great conflict: ${answers.conflict}.` : ""}`, null, 2));
  cs.newEntities.push(ent("continent", cont.ref, cont.name, "The known world.", "", null, 1));
  const regions = rng.sample(["The Ashen Reach", "Greywater Fens", "The Sunlit Marches", "Hollowpeak", "The Saltwind Coast", "Thornwood"], 3);
  regions.forEach((r, i) => cs.newEntities.push(ent("region", `region-${i}`, r, `A region of ${cont.name}.`, "", { id: null, ref: cont.ref, name: cont.name })));
  const nations = rng.sample(["Kingdom of Vael", "Free Cities of Orm", "The Iron Concord", "Principality of Lisse"], 2);
  nations.forEach((n, i) => cs.newEntities.push(ent("nation", `nation-${i}`, n, `A power in ${regions[i]}.`, "", { id: null, ref: `region-${i}`, name: regions[i]! })));
  cs.relationships.push({ source: { id: null, ref: "nation-0", name: nations[0]! }, target: { id: null, ref: "nation-1", name: nations[1]! }, type: rng.pick(["rival_of", "at_war_with", "allied_with"]), description: "An old and uneasy relationship.", rationale: "Neighbouring powers." });
  const deity = rng.pick(["Auriel", "Morvath", "Selith", "Kaelor"]);
  cs.newEntities.push(ent("deity", "deity-0", deity, "The most widely worshipped god.", "", null));
  cs.newEntities.push(ent("religion", "religion-0", `The Faith of ${deity}`, `The dominant church.`, "", null));
  cs.relationships.push({ source: { id: null, ref: "deity-0", name: deity }, target: { id: null, ref: "religion-0", name: `The Faith of ${deity}` }, type: "worshipped_by", description: "", rationale: "" });
  const factions = rng.sample(["The Ashen Hand", "The Lantern Society", "The Merchant Combine", "The Order of the Thorn"], 3);
  factions.forEach((f, i) => cs.newEntities.push(ent("faction", `faction-${i}`, f, `A faction with ambitions across ${cont.name}.`, "", null, 1)));
  const threadName = answers.conflict ? answers.conflict.slice(0, 60) : `${factions[0]} reaches for power`;
  cs.newEntities.push(ent("world_thread", "thread-0", threadName, "The central conflict of the age.", "", null, 2));
  cs.relationships.push({ source: { id: null, ref: "faction-0", name: factions[0]! }, target: { id: null, ref: "thread-0", name: threadName }, type: "drives", description: "", rationale: "" });
  cs.events.push({ ref: null, title: "The Founding", summary: `The first of the great powers rose in ${regions[0]}.`, kind: "historical", offsetDays: 0, yearsAgo: 400, location: { id: null, ref: "region-0", name: regions[0]! }, involved: [], visibility: "public", rationale: "" });
  cs.events.push({ ref: null, title: "The Sundering War", summary: `${nations[0]} and ${nations[1]} fought for a generation.`, kind: "historical", offsetDays: 0, yearsAgo: 120, location: null, involved: [], visibility: "public", rationale: "" });
  cs.summary = "A starter foundation from Worldloom's offline generator. Rename and reshape anything; connect an AI model for a foundation built from your answers.";
  return cs;

  function ent(type: string, ref: string, name: string, summary: string, body: string, location: { id: null; ref: string; name: string } | null, importance = 0) {
    return { ref, type, name, summary, body, status: null, location, fields: [], tags: [], aliases: [], visibility: "public" as const, importance, rationale: "Part of the starting foundation." };
  }
}

/** Recent session numbers and their ids, for prep tools. */
export async function lastSessions(db: DB, campaignId: string, n = 3) {
  return db.select().from(gameSessions).where(eq(gameSessions.campaignId, campaignId)).orderBy(desc(gameSessions.number)).limit(n);
}

