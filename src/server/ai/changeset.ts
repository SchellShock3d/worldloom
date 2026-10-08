/**
 * The change-set format: what both the live model and the offline engine
 * return for state-changing tasks. It is deliberately simple JSON (strict-mode
 * friendly: every key required, absent values null) and is converted into
 * validated proposal drafts. Unknown ids are dropped here, so a hallucinated
 * reference can never reach the database.
 */
import { z } from "zod";
import { inArray, and, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, consequences, clues, relationships } from "@/server/db/schema";
import { getEntityType, ENTITY_TYPE_MAP } from "@/lib/entity-types";
import { durationToMinutes, type CalendarDefinition } from "@/lib/calendar";
import type { ProposalDraft } from "@/lib/proposals";
import type { EntityRefValue } from "@/lib/proposals";

export const aiRef = z.object({
  id: z.string().nullable().describe("UUID of an existing entity from the context ({id:...}), or null"),
  ref: z.string().nullable().describe("Temporary key of an entity created in this same response, or null"),
  name: z.string().describe("Display name, for the DM"),
});
export type AiRef = z.infer<typeof aiRef>;

const visibilityValues = ["dm_only", "secret", "partially_known", "discovered", "public"] as const;

export const aiNewEntity = z.object({
  ref: z.string().describe("Unique temporary key, e.g. 'npc-1'"),
  type: z.string().describe("Entity type key, e.g. npc, settlement, faction, tavern, shop, religion, deity, item, magic_item, dungeon, lore, quest, world_thread, creature, culture, language, region, nation, location, landmark, organization, mystery"),
  name: z.string(),
  summary: z.string().describe("One or two sentences"),
  body: z.string().describe("Markdown article. Wrap DM-only secrets in a block starting with ':::dm' on its own line and ending with ':::' on its own line."),
  status: z.string().nullable(),
  location: aiRef.nullable().describe("Where it is located"),
  fields: z.array(z.object({ key: z.string(), value: z.string() })).describe("Type-specific details using the field keys listed for that type"),
  tags: z.array(z.string()),
  aliases: z.array(z.string()),
  visibility: z.enum(visibilityValues),
  importance: z.number().describe("0 normal, 1 important, 2 major"),
  rationale: z.string(),
});

export const aiRelationship = z.object({
  source: aiRef,
  target: aiRef,
  type: z.string().describe("e.g. member_of, leads, rules, controls, allied_with, enemy_of, at_war_with, parent_of, sibling_of, loves, hates, serves, employs, works_at, owns, worships, worshipped_by, involves, drives, threatens, seeks, guards, related_to"),
  description: z.string(),
  rationale: z.string(),
});

export const aiEntityUpdate = z.object({
  target: aiRef,
  summary: z.string().nullable(),
  appendBody: z.string().nullable().describe("Markdown to append to the article"),
  status: z.string().nullable(),
  location: aiRef.nullable(),
  rationale: z.string(),
});

export const aiEvent = z.object({
  ref: z.string().nullable(),
  title: z.string(),
  summary: z.string(),
  kind: z.enum(["historical", "campaign", "world", "character", "faction"]),
  offsetDays: z.number().describe("When it happens relative to the current in-world date, in days (0 = today, negative = past)"),
  yearsAgo: z.number().nullable().describe("For deep history only: years before the current date; otherwise null"),
  location: aiRef.nullable(),
  involved: z.array(aiRef),
  visibility: z.enum(visibilityValues),
  rationale: z.string(),
});

export const aiThreadUpdate = z.object({
  thread: aiRef,
  progressDelta: z.number().describe("-100..100"),
  status: z.enum(["dormant", "active", "escalating", "resolved", "failed", "paused"]).nullable(),
  nextMilestone: z.string().nullable(),
  rationale: z.string(),
});

export const aiRumour = z.object({
  title: z.string(),
  claim: z.string().describe("What people say"),
  truth: z.string().describe("What is actually true (DM only)"),
  accuracy: z.number().describe("0-100"),
  distortion: z.string(),
  originEvent: aiRef.nullable(),
  circulatesIn: z.array(aiRef),
  spreadBy: z.array(aiRef),
  rationale: z.string(),
});

export const aiFact = z.object({
  holder: aiRef.nullable().describe("Who knows/believes this; null for an objective world truth"),
  subject: aiRef.nullable(),
  statement: z.string(),
  truthStatus: z.enum(["true", "false", "partial", "unknown"]),
  confidence: z.number(),
  rationale: z.string(),
});

export const aiQuestUpdate = z.object({
  quest: aiRef,
  status: z.enum(["unknown", "available", "active", "completed", "failed", "abandoned", "hidden"]).nullable(),
  completedObjectives: z.array(z.string()),
  failedObjectives: z.array(z.string()),
  newObjectives: z.array(z.string()),
  rationale: z.string(),
});

export const aiCampaignState = z.object({
  entity: aiRef,
  status: z.string().nullable().describe("New status in this campaign, e.g. dead, missing, imprisoned"),
  location: aiRef.nullable(),
  reputationDelta: z.number().nullable().describe("Change in attitude toward the party, -100..100"),
  attitude: z.string().nullable(),
  playersDiscovered: z.boolean().describe("The players learned about this entity"),
  rationale: z.string(),
});

export const aiMetricChange = z.object({
  entity: aiRef,
  label: z.string().describe("e.g. Influence, Safety, Food prices, Morale, Wealth, Military strength"),
  delta: z.number(),
  rationale: z.string(),
});

export const aiConsequence = z.object({
  kind: z.enum(["consequence", "promise", "reaction"]),
  title: z.string(),
  description: z.string(),
  cause: z.string(),
  actor: aiRef.nullable(),
  severity: z.number().describe("1-5"),
  dueInDays: z.number().nullable(),
  rationale: z.string(),
});

export const aiConsequenceUpdate = z.object({
  consequenceId: z.string(),
  status: z.enum(["pending", "foreshadowed", "triggered", "resolved", "discarded"]),
  rationale: z.string(),
});

export const aiClueUpdate = z.object({ clueId: z.string(), discovered: z.boolean(), rationale: z.string() });

export const changeSetSchema = z.object({
  summary: z.string().describe("Two or three sentences for the DM describing the proposals"),
  recap: z.string().nullable(),
  newEntities: z.array(aiNewEntity),
  relationships: z.array(aiRelationship),
  entityUpdates: z.array(aiEntityUpdate),
  events: z.array(aiEvent),
  threadUpdates: z.array(aiThreadUpdate),
  rumours: z.array(aiRumour),
  facts: z.array(aiFact),
  questUpdates: z.array(aiQuestUpdate),
  campaignStates: z.array(aiCampaignState),
  metricChanges: z.array(aiMetricChange),
  consequences: z.array(aiConsequence),
  consequenceUpdates: z.array(aiConsequenceUpdate),
  clueUpdates: z.array(aiClueUpdate),
  inventoryAdd: z.array(z.string()),
  inventoryRemove: z.array(z.string()),
});
export type ChangeSet = z.infer<typeof changeSetSchema>;

export function emptyChangeSet(summary = ""): ChangeSet {
  return {
    summary,
    recap: null,
    newEntities: [],
    relationships: [],
    entityUpdates: [],
    events: [],
    threadUpdates: [],
    rumours: [],
    facts: [],
    questUpdates: [],
    campaignStates: [],
    metricChanges: [],
    consequences: [],
    consequenceUpdates: [],
    clueUpdates: [],
    inventoryAdd: [],
    inventoryRemove: [],
  };
}

export interface ConvertContext {
  worldId: string;
  campaignId: string | null;
  sessionId?: string | null;
  now: number;
  calendar: CalendarDefinition;
  /** Default canon status for created entities (AI content defaults to proposed→ on approval becomes canon). */
  campaignScopedEvents?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turn a change set into proposal drafts, discarding anything that points at
 * entities that don't exist (or refs that were never defined).
 */
export async function changeSetToDrafts(db: DB, cs: ChangeSet, ctx: ConvertContext): Promise<{ drafts: ProposalDraft[]; dropped: string[] }> {
  const dropped: string[] = [];
  // Collect referenced ids and check them in one query.
  const ids = new Set<string>();
  const collect = (r: AiRef | null | undefined) => {
    if (r?.id && UUID.test(r.id)) ids.add(r.id.toLowerCase());
  };
  cs.newEntities.forEach((e) => collect(e.location));
  cs.relationships.forEach((r) => (collect(r.source), collect(r.target)));
  cs.entityUpdates.forEach((u) => (collect(u.target), collect(u.location)));
  cs.events.forEach((e) => (collect(e.location), e.involved.forEach(collect)));
  cs.threadUpdates.forEach((t) => collect(t.thread));
  cs.rumours.forEach((r) => (collect(r.originEvent), r.circulatesIn.forEach(collect), r.spreadBy.forEach(collect)));
  cs.facts.forEach((f) => (collect(f.holder), collect(f.subject)));
  cs.questUpdates.forEach((q) => collect(q.quest));
  cs.campaignStates.forEach((s) => (collect(s.entity), collect(s.location)));
  cs.metricChanges.forEach((m) => collect(m.entity));
  cs.consequences.forEach((c) => collect(c.actor));
  const known = new Map<string, { type: string; name: string }>();
  if (ids.size) {
    const rows = await db.select({ id: entities.id, type: entities.type, name: entities.name }).from(entities).where(and(eq(entities.worldId, ctx.worldId), inArray(entities.id, [...ids])));
    rows.forEach((r) => known.set(r.id, { type: r.type, name: r.name }));
  }
  const refs = new Set(cs.newEntities.map((e) => e.ref));
  cs.events.forEach((e) => e.ref && refs.add(e.ref));

  /** Resolve an AI ref; returns undefined if invalid. */
  const r = (x: AiRef | null | undefined): EntityRefValue | null | undefined => {
    if (!x) return null;
    if (x.id && UUID.test(x.id) && known.has(x.id.toLowerCase())) return { id: x.id.toLowerCase(), name: known.get(x.id.toLowerCase())!.name };
    if (x.ref && refs.has(x.ref)) return { ref: x.ref, name: x.name };
    return undefined;
  };
  const must = (x: AiRef | null | undefined, what: string) => {
    const v = r(x);
    if (!v) dropped.push(`${what}: unknown reference “${x?.name ?? "?"}”`);
    return v ?? null;
  };
  const optional = (x: AiRef | null | undefined) => r(x) ?? null;
  const list = (xs: AiRef[]) => xs.map((x) => r(x)).filter((x): x is EntityRefValue => !!x);
  const dayOffset = (days: number) => ctx.now + durationToMinutes(ctx.calendar, days, "days");

  const drafts: ProposalDraft[] = [];

  for (const e of cs.newEntities) {
    const typeKey = ENTITY_TYPE_MAP[e.type] ? e.type : guessType(e.type);
    if (!typeKey) {
      dropped.push(`Unknown type "${e.type}" for ${e.name}`);
      continue;
    }
    const def = getEntityType(typeKey);
    const fields: Record<string, unknown> = {};
    for (const f of e.fields) fields[f.key] = f.value;
    const loc = optional(e.location);
    drafts.push({
      kind: "create_entity",
      rationale: e.rationale,
      payload: {
        ref: e.ref,
        entity: {
          type: typeKey,
          name: e.name,
          summary: e.summary,
          body: e.body,
          status: e.status && def.statuses?.includes(e.status) ? e.status : null,
          // Location refs to other new entities can't be stored on create; they're linked after approval via a follow-up update.
          locationId: loc?.id ?? null,
          fields,
          tags: e.tags.slice(0, 10),
          aliases: e.aliases.slice(0, 10),
          visibility: e.visibility,
          importance: Math.max(0, Math.min(2, Math.round(e.importance))),
          campaignId: def.campaignScoped || typeKey === "quest" || typeKey === "mystery" ? ctx.campaignId : null,
          ...(def.extension === "thread" ? { thread: { status: "active", progress: 0, urgency: 3, momentum: 10 } } : {}),
          ...(def.extension === "quest" ? { quest: { status: "available" } } : {}),
          ...(def.extension === "mystery" ? { mystery: { question: e.summary, truth: "", status: "open" } } : {}),
          ...(def.extension === "rumour" ? { rumour: { claim: e.summary || e.name, accuracy: 50 } } : {}),
          ...(def.extension === "event" ? { event: { startAt: ctx.now, kind: "world", precision: "day", origin: "ai" } } : {}),
        },
      },
    });
    if (loc?.ref) {
      drafts.push({ kind: "update_entity", rationale: `Place ${e.name} inside ${loc.name ?? "its location"}`, payload: { target: { ref: e.ref, name: e.name }, location: loc } });
    }
  }

  for (const ev of cs.events) {
    const startAt = ev.yearsAgo ? ctx.now - durationToMinutes(ctx.calendar, ev.yearsAgo, "years") : dayOffset(ev.offsetDays);
    drafts.push({
      kind: "create_event",
      rationale: ev.rationale,
      payload: {
        ref: ev.ref ?? undefined,
        title: ev.title,
        summary: ev.summary,
        kind: ev.kind,
        startAt: Math.round(startAt),
        location: optional(ev.location),
        involved: list(ev.involved),
        visibility: ev.visibility,
        campaignScoped: ev.kind === "campaign" && !!ctx.campaignId,
      },
    });
  }

  for (const rel of cs.relationships) {
    const source = must(rel.source, "Relationship");
    const target = must(rel.target, "Relationship");
    if (!source || !target) continue;
    drafts.push({ kind: "create_relationship", rationale: rel.rationale, payload: { source, target, type: rel.type, description: rel.description } });
  }

  for (const u of cs.entityUpdates) {
    const target = must(u.target, "Update");
    if (!target) continue;
    const payload: Record<string, unknown> = { target };
    if (u.summary) payload.summary = u.summary;
    if (u.appendBody) payload.appendBody = u.appendBody;
    if (u.status) payload.status = u.status;
    if (u.location) {
      const l = optional(u.location);
      if (l) payload.location = l;
    }
    if (Object.keys(payload).length === 1) continue;
    drafts.push({ kind: "update_entity", rationale: u.rationale, payload: payload as never });
  }

  for (const t of cs.threadUpdates) {
    const thread = must(t.thread, "Thread");
    if (!thread) continue;
    if (thread.id && known.get(thread.id)?.type !== "world_thread") {
      dropped.push(`${thread.name} is not a world thread`);
      continue;
    }
    drafts.push({
      kind: "update_thread",
      rationale: t.rationale,
      payload: { thread, progressDelta: Math.max(-100, Math.min(100, Math.round(t.progressDelta))), ...(t.status && { status: t.status }), ...(t.nextMilestone && { nextMilestone: t.nextMilestone }) },
    });
  }

  for (const rm of cs.rumours) {
    drafts.push({
      kind: "create_rumour",
      rationale: rm.rationale,
      payload: {
        title: rm.title,
        claim: rm.claim,
        truth: rm.truth,
        accuracy: Math.max(0, Math.min(100, Math.round(rm.accuracy))),
        distortion: rm.distortion,
        originEvent: optional(rm.originEvent),
        circulatesIn: list(rm.circulatesIn),
        spreadBy: list(rm.spreadBy),
      },
    });
  }

  for (const f of cs.facts) {
    const holder = f.holder ? r(f.holder) : null;
    if (f.holder && !holder) {
      dropped.push(`Knowledge holder “${f.holder.name}” not found`);
      continue;
    }
    drafts.push({
      kind: "create_fact",
      rationale: f.rationale,
      payload: { holder, subject: optional(f.subject), statement: f.statement, truthStatus: f.truthStatus, confidence: Math.max(0, Math.min(100, Math.round(f.confidence))), campaignScoped: !!ctx.campaignId && !!holder },
    });
  }

  for (const q of cs.questUpdates) {
    const quest = must(q.quest, "Quest");
    if (!quest) continue;
    drafts.push({
      kind: "quest_update",
      rationale: q.rationale,
      payload: {
        quest,
        ...(q.status && { status: q.status }),
        objectives: [...q.completedObjectives.map((text) => ({ text, status: "done" as const })), ...q.failedObjectives.map((text) => ({ text, status: "failed" as const }))],
        addObjectives: q.newObjectives,
      },
    });
  }

  if (ctx.campaignId) {
    for (const s of cs.campaignStates) {
      const entity = must(s.entity, "Campaign state");
      if (!entity) continue;
      const payload: Record<string, unknown> = { entity };
      if (s.status) payload.status = s.status;
      if (s.location) {
        const l = optional(s.location);
        if (l) payload.location = l;
      }
      if (s.reputationDelta) payload.reputationDelta = Math.max(-100, Math.min(100, Math.round(s.reputationDelta)));
      if (s.attitude) payload.attitude = s.attitude;
      if (s.playersDiscovered) payload.knowledge = "discovered";
      if (Object.keys(payload).length === 1) continue;
      drafts.push({ kind: "campaign_state", rationale: s.rationale, payload: payload as never });
    }
  }

  for (const m of cs.metricChanges) {
    const entity = must(m.entity, "World state");
    if (!entity || !m.delta) continue;
    drafts.push({ kind: "metric_change", rationale: m.rationale, payload: { entity, label: m.label, delta: Math.max(-100, Math.min(100, Math.round(m.delta))), reason: m.rationale.slice(0, 200) } });
  }

  for (const c of cs.consequences) {
    drafts.push({
      kind: "create_consequence",
      rationale: c.rationale,
      payload: {
        kind: c.kind,
        title: c.title,
        description: c.description,
        cause: c.cause,
        actor: optional(c.actor),
        severity: Math.max(1, Math.min(5, Math.round(c.severity))),
        dueAt: c.dueInDays !== null ? dayOffset(c.dueInDays) : null,
      },
    });
  }

  if (cs.consequenceUpdates.length) {
    const cids = cs.consequenceUpdates.map((c) => c.consequenceId).filter((x) => UUID.test(x));
    const valid = cids.length ? new Set((await db.select({ id: consequences.id }).from(consequences).where(and(eq(consequences.worldId, ctx.worldId), inArray(consequences.id, cids)))).map((x) => x.id)) : new Set<string>();
    for (const c of cs.consequenceUpdates) {
      if (!valid.has(c.consequenceId)) {
        dropped.push("Unknown consequence id");
        continue;
      }
      drafts.push({ kind: "consequence_update", rationale: c.rationale, payload: { consequenceId: c.consequenceId, status: c.status } });
    }
  }

  if (cs.clueUpdates.length) {
    const cids = cs.clueUpdates.map((c) => c.clueId).filter((x) => UUID.test(x));
    const valid = cids.length ? new Set((await db.select({ id: clues.id }).from(clues).where(and(eq(clues.worldId, ctx.worldId), inArray(clues.id, cids)))).map((x) => x.id)) : new Set<string>();
    for (const c of cs.clueUpdates) {
      if (!valid.has(c.clueId)) continue;
      drafts.push({ kind: "clue_update", rationale: c.rationale, payload: { clueId: c.clueId, discovered: c.discovered } });
    }
  }

  if (ctx.campaignId && (cs.inventoryAdd.length || cs.inventoryRemove.length)) {
    drafts.push({ kind: "party_inventory", rationale: "Items gained or lost", payload: { add: cs.inventoryAdd, remove: cs.inventoryRemove } });
  }
  if (ctx.sessionId && cs.recap) {
    drafts.unshift({ kind: "session_recap", rationale: "Summary of the session notes", payload: { sessionId: ctx.sessionId, recap: cs.recap } });
  }
  return { drafts, dropped };
}

function guessType(t: string): string | null {
  const s = t.toLowerCase().replace(/[^a-z]/g, "");
  const map: Record<string, string> = {
    character: "npc",
    person: "npc",
    town: "settlement",
    city: "settlement",
    village: "settlement",
    inn: "tavern",
    store: "shop",
    god: "deity",
    church: "religion",
    cult: "faction",
    guild: "faction",
    monster: "creature",
    beast: "creature",
    kingdom: "nation",
    empire: "nation",
    artifact: "magic_item",
    magicitem: "magic_item",
    worldthread: "world_thread",
    thread: "world_thread",
    history: "lore",
    article: "lore",
    place: "location",
  };
  return map[s] ?? (ENTITY_TYPE_MAP[s] ? s : null);
}

/** Relationship ids for an entity pair (used by offline engine to avoid dupes). */
export async function relationshipExists(db: DB, a: string, b: string, type: string) {
  const [r] = await db.select({ id: relationships.id }).from(relationships).where(and(eq(relationships.sourceId, a), eq(relationships.targetId, b), eq(relationships.type, type))).limit(1);
  return !!r;
}
