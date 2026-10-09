/**
 * Build out: load what already surrounds an entry (so Claude builds around it), and turn a
 * reviewed build-out into linked entries. The DM approved the draft section by section, so it's
 * recorded as an approved proposal batch with full revision history, like the world creator.
 */
import { and, eq, inArray, ne, or } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, relationships, type Entity } from "@/server/db/schema";
import { applyProposals, createBatch, getBatch } from "./proposals";
import { loadWorldBundle } from "@/server/ai/context";
import { changeSetToDrafts, emptyChangeSet, type AiRef } from "@/server/ai/changeset";
import { ENTITY_TYPE_MAP, getEntityType } from "@/lib/entity-types";
import { RELATIONSHIP_TYPES, normalizeRelationshipType } from "@/lib/relationship-types";
import { emptyFieldFills, planFor, type BuildSectionData } from "@/lib/build-out";
import { normalizeDmBlocks } from "@/lib/mentions";
import type { ProposalDraft } from "@/lib/proposals";

export interface Surrounding {
  id: string;
  name: string;
  type: string;
  summary: string;
  how: string;
}

/** What's already in or tied to an entry: its contents (two levels down) and its relationships. */
export async function surroundings(db: DB, worldId: string, focus: Entity): Promise<Surrounding[]> {
  const out = new Map<string, Surrounding>();
  const live = and(eq(entities.worldId, worldId), ne(entities.canonStatus, "archived"));
  const kids = await db.select({ id: entities.id, name: entities.name, type: entities.type, summary: entities.summary }).from(entities).where(and(live, eq(entities.locationId, focus.id))).limit(80);
  for (const k of kids) out.set(k.id, { ...k, how: `in ${focus.name}` });
  if (kids.length) {
    const grand = await db
      .select({ id: entities.id, name: entities.name, type: entities.type, summary: entities.summary, parent: entities.locationId })
      .from(entities)
      .where(and(live, inArray(entities.locationId, kids.map((k) => k.id))))
      .limit(120);
    const names = new Map(kids.map((k) => [k.id, k.name]));
    for (const g of grand) if (!out.has(g.id)) out.set(g.id, { id: g.id, name: g.name, type: g.type, summary: g.summary, how: `in ${names.get(g.parent!) ?? focus.name}` });
  }
  const rels = await db
    .select({ type: relationships.type, sourceId: relationships.sourceId, targetId: relationships.targetId })
    .from(relationships)
    .where(and(eq(relationships.worldId, worldId), or(eq(relationships.sourceId, focus.id), eq(relationships.targetId, focus.id))))
    .limit(80);
  const otherIds = [...new Set(rels.map((r) => (r.sourceId === focus.id ? r.targetId : r.sourceId)))].filter((id) => !out.has(id));
  if (otherIds.length) {
    const others = await db.select({ id: entities.id, name: entities.name, type: entities.type, summary: entities.summary }).from(entities).where(and(live, inArray(entities.id, otherIds)));
    for (const o of others) {
      const r = rels.find((x) => x.sourceId === o.id || x.targetId === o.id)!;
      const verb = r.type.replace(/_/g, " ");
      out.set(o.id, { ...o, how: r.sourceId === focus.id ? `${focus.name} ${verb} it` : `${verb} ${focus.name}` });
    }
  }
  return [...out.values()];
}

export interface ApplyBuildInput {
  entityId: string;
  /** Written sections, by key. */
  sections: Record<string, BuildSectionData>;
  /** New entries are visible to players (public) or not yet (secret). */
  reveal: boolean;
  provider?: string;
}

const PLACE_TYPES = new Set(Object.values(ENTITY_TYPE_MAP).filter((t) => t.isPlace).map((t) => t.key));
const TYPE_ALIASES: Record<string, string> = {
  district: "location",
  quarter: "location",
  ward: "location",
  temple: "location",
  shrine: "location",
  building: "location",
  room: "location",
  area: "location",
  town: "settlement",
  city: "settlement",
  village: "settlement",
  inn: "tavern",
  store: "shop",
  guild: "faction",
  cult: "faction",
  house: "faction",
  order: "organization",
  church: "religion",
  god: "deity",
  monster: "creature",
  beast: "creature",
  artifact: "magic_item",
  relic: "magic_item",
  person: "npc",
  character: "npc",
  thread: "world_thread",
  problem: "world_thread",
  threat: "world_thread",
};

export function entryType(t: string): string | null {
  const k = t.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (ENTITY_TYPE_MAP[k] && !ENTITY_TYPE_MAP[k]!.campaignScoped && !["quest", "mystery", "pc", "rumour", "event"].includes(k)) return k;
  return TYPE_ALIASES[k] ?? null;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ");

/** "owned_by", "led_by", "child_of"…: the reverse of a known relationship, so the link is flipped. */
const INVERSES = new Map(RELATIONSHIP_TYPES.filter((t) => !t.symmetric).map((t) => [normalizeRelationshipType(t.inverse), t.key]));
export function orientLink(type: string): { type: string; flip: boolean } {
  const k = normalizeRelationshipType(type) || "related_to";
  if (RELATIONSHIP_TYPES.some((t) => t.key === k)) return { type: k, flip: false };
  const inv = INVERSES.get(k);
  return inv ? { type: inv, flip: true } : { type: k, flip: false };
}

export async function applyBuildOut(db: DB, worldId: string, userId: string, input: ApplyBuildInput) {
  const [focus] = await db.select().from(entities).where(and(eq(entities.id, input.entityId), eq(entities.worldId, worldId)));
  if (!focus) throw new Error("That entry no longer exists.");
  const plan = planFor(focus.type);
  const order = plan.sections.map((s) => s.key).filter((k) => input.sections[k]);
  if (!order.length) throw new Error("Nothing has been written yet.");
  const focusDef = getEntityType(focus.type);

  // Everything already in the world, so a name Claude reused points at the existing entry
  // instead of creating a duplicate.
  const existing = await db.select({ id: entities.id, name: entities.name, aliases: entities.aliases }).from(entities).where(and(eq(entities.worldId, worldId), ne(entities.canonStatus, "archived")));
  const existingByName = new Map<string, { id: string; name: string }>();
  for (const e of existing) {
    for (const n of [e.name, ...e.aliases]) if (!existingByName.has(norm(n))) existingByName.set(norm(n), { id: e.id, name: e.name });
  }

  const cs = emptyChangeSet(`Build out ${focus.name}`);
  const refs = new Map<string, AiRef>([[norm(focus.name), { id: focus.id, ref: null, name: focus.name }]]);
  for (const a of focus.aliases) refs.set(norm(a), { id: focus.id, ref: null, name: focus.name });
  const used = new Set<string>();
  const created: { section: string; entry: BuildSectionData["entries"][number]; ref: AiRef; type: string }[] = [];

  // 1. New entries (skipping any that already exist, and repeats within the build).
  for (const key of order) {
    const def = plan.sections.find((s) => s.key === key)!;
    for (const entry of input.sections[key]!.entries) {
      const name = entry.name.trim();
      if (!name) continue;
      const n = norm(name);
      const hit = existingByName.get(n);
      if (hit) {
        if (!refs.has(n)) refs.set(n, { id: hit.id, ref: null, name: hit.name });
        continue;
      }
      if (refs.has(n)) continue;
      const type = entryType(entry.type) ?? entryType(def.types[0] ?? "") ?? "lore";
      let ref = `${type}-${n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x"}`;
      while (used.has(ref)) ref += "-2";
      used.add(ref);
      const r: AiRef = { id: null, ref, name };
      refs.set(n, r);
      created.push({ section: key, entry, ref: r, type });
    }
  }

  const find = (name: string): AiRef | null => {
    if (!name?.trim()) return null;
    const n = norm(name);
    const direct = refs.get(n) ?? (existingByName.get(n) ? { id: existingByName.get(n)!.id, ref: null, name: existingByName.get(n)!.name } : null);
    if (direct) return direct;
    // "the Lantern" for "The Drowned Lantern": only when exactly one entry in the build matches.
    if (n.length < 5) return null;
    const hits = [...refs].filter(([k]) => k.includes(n) || n.includes(k));
    return hits.length === 1 ? hits[0]![1] : null;
  };
  const focusRef: AiRef = { id: focus.id, ref: null, name: focus.name };
  const focusIsPlace = PLACE_TYPES.has(focus.type);
  const visibility = input.reveal ? "public" : "secret";

  for (const { entry, ref, type } of created) {
    const def = getEntityType(type);
    const isPlace = PLACE_TYPES.has(type);
    const placed = ["npc", "creature", "item", "magic_item", "organization", "faction"].includes(type) || isPlace;
    let location = entry.within ? find(entry.within) : null;
    if (location?.ref === ref.ref) location = null;
    if (!location && placed) location = focusIsPlace ? focusRef : focus.locationId && ["npc", "location", "shop", "tavern", "item", "magic_item"].includes(type) ? { id: focus.locationId, ref: null, name: "" } : null;
    const allowed = new Set(def.fields.map((f) => f.key));
    const fields = entry.fields.filter((f) => f.value?.trim() && (allowed.has(f.key) || !def.fields.length)).map((f) => ({ key: f.key, value: f.value.trim() }));
    if (type === "npc" && entry.secret && allowed.has("secrets") && !fields.some((f) => f.key === "secrets")) fields.push({ key: "secrets", value: entry.secret.trim() });
    cs.newEntities.push({
      ref: ref.ref!,
      type,
      name: ref.name,
      summary: entry.summary.trim(),
      body: [entry.details.trim(), entry.secret.trim() ? `:::dm\n${entry.secret.trim()}\n:::` : ""].filter(Boolean).join("\n\n"),
      status: type === "npc" ? "alive" : null,
      location,
      fields,
      tags: [],
      aliases: [],
      visibility: type === "world_thread" ? "dm_only" : visibility,
      importance: 0,
      rationale: `Built out from ${focus.name}.`,
    });
  }

  // 2. Relationships: from new entries, and from the focus itself.
  const seenRel = new Set<string>();
  const rel = (from: AiRef | null, to: AiRef | null, type: string, description: string, where?: AiRef | null) => {
    if (!from || !to) return;
    const { type: k, flip } = orientLink(type);
    if (/^(located_in|in|inside|lives_in|found_in|part_of)$/.test(k)) return;
    // "Related to the town it's in" says nothing the location doesn't.
    if (k === "related_to" && where && (where.id ?? where.ref) === (to.id ?? to.ref)) return;
    const [source, target] = flip ? [to, from] : [from, to];
    const s = source.id ?? source.ref;
    const t = target.id ?? target.ref;
    if (!s || !t || s === t) return;
    const key = `${s}|${k}|${t}`;
    if (seenRel.has(key)) return;
    seenRel.add(key);
    cs.relationships.push({ source, target, type: k, description: description.trim().slice(0, 500), rationale: `Built out from ${focus.name}.` });
  };
  for (const { entry, ref } of created) {
    const where = cs.newEntities.find((e) => e.ref === ref.ref)?.location ?? null;
    for (const l of entry.links) rel(ref, find(l.to), l.type, l.why, where);
  }
  for (const key of order) for (const l of input.sections[key]!.links) rel(focusRef, find(l.to), l.type, l.why);

  // 3. Rumours circulate where the focus is.
  const where = focusIsPlace ? [focusRef] : focus.locationId ? [{ id: focus.locationId, ref: null, name: "" }] : [];
  for (const key of order) {
    for (const r of input.sections[key]!.rumours) {
      if (!r.claim.trim()) continue;
      cs.rumours.push({ title: r.claim.slice(0, 80), claim: r.claim.trim(), truth: r.truth.trim(), accuracy: 50, distortion: "", originEvent: null, circulatesIn: where, spreadBy: [], rationale: `Built out from ${focus.name}.` });
    }
  }

  const bundle = await loadWorldBundle(db, worldId, null);
  const { drafts, dropped } = await changeSetToDrafts(db, cs, { worldId, campaignId: null, now: bundle.now, calendar: bundle.calendar });

  // 4. The focus entry: its article grows section by section, and empty fields are filled in.
  const article: string[] = [];
  const hooks: string[] = [];
  for (const key of order) {
    const def = plan.sections.find((s) => s.key === key)!;
    const d = input.sections[key]!;
    if (d.article.trim()) article.push(key === "about" ? d.article.trim() : `## ${def.title}\n\n${d.article.trim()}`);
    hooks.push(...d.hooks.map((h) => h.trim()).filter(Boolean));
  }
  if (hooks.length) article.push(`:::dm\n**Adventure hooks**\n\n${hooks.map((h) => `- ${h}`).join("\n")}\n:::`);
  const allowed = focusDef.fields.filter((f) => f.kind !== "abilities" && f.kind !== "inventory").map((f) => f.key);
  const fills = emptyFieldFills(order.flatMap((k) => input.sections[k]!.fields), focus.fields, allowed);
  if (article.length || fills.length) {
    const update: ProposalDraft = {
      kind: "update_entity",
      rationale: "Built out with Claude.",
      payload: {
        target: { id: focus.id, name: focus.name },
        ...(article.length ? { appendBody: normalizeDmBlocks(article.join("\n\n")) } : {}),
        ...(fills.length ? { fields: Object.fromEntries(fills.map((f) => [f.key, f.value])) } : {}),
      } as never,
    };
    drafts.push(update);
  }
  if (!drafts.length) throw new Error("There's nothing new to add: everything in this build-out already exists.");

  const { batch } = await createBatch(db, { worldId, source: "generate", title: `Build out: ${focus.name}`, summary: `Written with Claude section by section and approved there.`, provider: input.provider ?? "anthropic", createdBy: userId }, drafts);
  const items = (await getBatch(db, worldId, batch.id))?.items ?? [];
  const applied = await applyProposals(db, worldId, batch.id, items.map((i) => i.id), userId);
  if (dropped.length) console.warn("[build-out] dropped", dropped);
  return { batchId: batch.id, applied: applied.applied, failed: applied.failed, created: created.length };
}
