/**
 * Thin spots: the parts of a world that are only sketched in. Towns with nobody to meet, factions
 * with no members, gods nobody worships, important entries that are a single sentence. Each one
 * points at the build-out sections that would fill it in. Deterministic and cheap: no AI.
 */
import { and, eq, isNull, ne } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { campaigns, entities, mentions, relationships, worlds } from "@/server/db/schema";
import { planFor } from "@/lib/build-out";

export interface ThinSpot {
  /** Stable id (kind + entry), used to dismiss it. */
  id: string;
  kind: string;
  title: string;
  detail: string;
  entity: { id: string; name: string; type: string };
  /** Build-out sections that fill it in. */
  parts: string[];
  weight: number;
  nearParty: boolean;
}

const SKIP_STUB = new Set(["race", "class", "quest", "mystery", "rumour", "event", "world_thread", "pc", "lore", "language"]);

export async function findThinSpots(db: DB, worldId: string, opts: { campaignId?: string | null; includeDismissed?: boolean } = {}): Promise<{ spots: ThinSpot[]; dismissed: number }> {
  const rows = await db
    .select({ id: entities.id, name: entities.name, type: entities.type, summary: entities.summary, body: entities.body, fields: entities.fields, locationId: entities.locationId, importance: entities.importance })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), ne(entities.canonStatus, "archived"), isNull(entities.campaignId)));
  const rels = await db.select({ s: relationships.sourceId, t: relationships.targetId, type: relationships.type }).from(relationships).where(eq(relationships.worldId, worldId));
  const ment = await db.select({ id: mentions.entityId }).from(mentions).where(eq(mentions.worldId, worldId));
  const [world] = await db.select({ settings: worlds.settings }).from(worlds).where(eq(worlds.id, worldId));
  const dismissedIds = new Set(world?.settings.thinSpotsDismissed ?? []);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const children = new Map<string, typeof rows>();
  for (const r of rows) if (r.locationId) children.set(r.locationId, [...(children.get(r.locationId) ?? []), r]);
  const within = (id: string, depth = 3): typeof rows => {
    const out: typeof rows = [];
    let frontier = [id];
    for (let d = 0; d < depth && frontier.length; d++) {
      const next: string[] = [];
      for (const f of frontier) for (const c of children.get(f) ?? []) (out.push(c), next.push(c.id));
      frontier = next;
    }
    return out;
  };
  const relsOf = new Map<string, { other: string; type: string; out: boolean }[]>();
  for (const r of rels) {
    relsOf.set(r.s, [...(relsOf.get(r.s) ?? []), { other: r.t, type: r.type, out: true }]);
    relsOf.set(r.t, [...(relsOf.get(r.t) ?? []), { other: r.s, type: r.type, out: false }]);
  }
  const mentionCount = new Map<string, number>();
  for (const m of ment) mentionCount.set(m.id, (mentionCount.get(m.id) ?? 0) + 1);
  const linked = (id: string, types: string[], otherType?: string[]) => (relsOf.get(id) ?? []).some((r) => types.includes(r.type) && (!otherType || otherType.includes(byId.get(r.other)?.type ?? "")));

  // The party's surroundings matter most.
  const near = new Set<string>();
  if (opts.campaignId) {
    const [c] = await db.select({ loc: campaigns.currentLocationId }).from(campaigns).where(eq(campaigns.id, opts.campaignId));
    for (let cur = c?.loc ?? null, i = 0; cur && i < 8; i++) {
      near.add(cur);
      cur = byId.get(cur)?.locationId ?? null;
    }
  }

  const spots: ThinSpot[] = [];
  const add = (e: (typeof rows)[number], kind: string, title: string, detail: string, parts: string[], base: number) => {
    const plan = planFor(e.type);
    const valid = parts.filter((p) => plan.sections.some((s) => s.key === p));
    const degree = (relsOf.get(e.id)?.length ?? 0) + (mentionCount.get(e.id) ?? 0) + (children.get(e.id)?.length ?? 0);
    spots.push({ id: `${kind}:${e.id}`, kind, title, detail, entity: { id: e.id, name: e.name, type: e.type }, parts: valid.length ? valid : plan.sections.map((s) => s.key), weight: base + e.importance * 3 + Math.min(5, degree) + (near.has(e.id) ? 8 : 0), nearParty: near.has(e.id) });
  };
  const has = (v: unknown) => (typeof v === "string" ? !!v.trim() : Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null);
  // How much is actually written about it: the article plus any filled-in text fields.
  const substance = (e: (typeof rows)[number]) => e.body.replace(/:::dm[\s\S]*?:::/g, "").trim().length + Object.values(e.fields as Record<string, unknown>).reduce<number>((n, v) => n + (typeof v === "string" ? v.trim().length : 0), 0);
  const thinText = (e: (typeof rows)[number]) => substance(e) < 160;
  // Nations often hold cities politically rather than geographically ("Highcourt, capital of Valeria").
  const coreName = (n: string) => n.replace(/^(the\s+)?((kingdom|empire|republic|realm|principality|duchy|free cities|league|union|dominion|confederacy|theocracy)\s+of\s+)?(the\s+)?/i, "").trim().toLowerCase();
  const placesOfNation = (e: (typeof rows)[number]) => {
    const n = coreName(e.name);
    if (n.length < 3) return 0;
    return rows.filter((x) => x.type === "settlement" && `${x.name} ${x.summary} ${x.body} ${String((x.fields as Record<string, unknown>).government ?? "")}`.toLowerCase().includes(n)).length + (relsOf.get(e.id) ?? []).filter((r) => ["controls", "rules"].includes(r.type) && ["settlement", "region"].includes(byId.get(r.other)?.type ?? "")).length;
  };

  for (const e of rows) {
    const inside = within(e.id);
    const count = (types: string[]) => inside.filter((x) => types.includes(x.type)).length;
    const flagged = spots.length;
    switch (e.type) {
      case "settlement": {
        if (!count(["npc"])) add(e, "no-people", `Nobody to meet in ${e.name}`, "No characters live or work here yet.", ["people", "power"], 6);
        if (!count(["tavern", "shop"]) && !inside.some((x) => x.type === "location" && /temple|shrine|market|inn/i.test(`${x.name} ${String((x.fields as Record<string, unknown>).kind ?? "")}`))) add(e, "nowhere-to-go", `Nowhere to go in ${e.name}`, "No taverns, shops or temples yet.", ["haunts"], 5);
        break;
      }
      case "region":
      case "continent":
        if (!count(["settlement"])) add(e, "no-towns", `No towns in ${e.name}`, "Nobody lives here yet, as far as your world knows.", ["settlements"], 4);
        else if (!count(["landmark", "dungeon"])) add(e, "no-wilds", `Nothing to explore in ${e.name}`, "No landmarks, ruins or dungeons yet.", ["wilds", "dangers"], 2);
        break;
      case "nation":
        if (!linked(e.id, ["rules"]) && !has((e.fields as Record<string, unknown>).ruler)) add(e, "no-ruler", `Nobody rules ${e.name}`, "It has no ruler or court yet.", ["court"], 4);
        if (!count(["settlement"]) && !placesOfNation(e)) add(e, "no-cities", `${e.name} has no cities`, "No capital or towns belong to it yet.", ["places"], 3);
        break;
      case "faction":
      case "organization":
        if (!linked(e.id, ["leads", "member_of", "serves"], ["npc", "pc"])) add(e, "no-members", `${e.name} has no members`, "Nobody leads it or works for it yet.", ["leaders", "members"], 4);
        break;
      case "religion":
        if (!linked(e.id, ["worshipped_by", "worships"], ["deity"])) add(e, "no-gods", `${e.name} has no gods`, "No deity is tied to this faith.", ["divine"], 3);
        if (!linked(e.id, ["leads", "member_of", "serves"], ["npc"])) add(e, "no-clergy", `${e.name} has no clergy`, "No priests or holy orders yet.", ["clergy"], 3);
        break;
      case "deity":
        if (!linked(e.id, ["worshipped_by", "worships"])) add(e, "no-worship", `Nobody worships ${e.name}`, "No faith, cult or follower is tied to this god.", ["worship"], 3);
        break;
      case "dungeon":
        if (!inside.length) add(e, "empty-site", `${e.name} is empty`, "No areas, inhabitants or treasure yet.", ["areas", "inhabitants", "treasure"], 4);
        break;
    }
    if (spots.length > flagged || SKIP_STUB.has(e.type)) continue;
    const degree = (relsOf.get(e.id)?.length ?? 0) + (mentionCount.get(e.id) ?? 0);
    if (thinText(e) && (e.importance >= 1 || degree >= 3 || near.has(e.id))) {
      add(e, "sketch", `${e.name} is only a sketch`, `${degree >= 3 ? `It comes up ${degree} times` : "It's marked important"}, but ${e.body.trim() ? "there's only a line or two" : "there's no article"} about it.`, [], 3);
    } else if (["npc", "faction", "organization", "deity", "religion"].includes(e.type) && !degree && !e.locationId && !(children.get(e.id)?.length)) {
      const parts = e.type === "npc" ? ["circle"] : e.type === "deity" ? ["worship", "servants"] : e.type === "religion" ? ["divine", "clergy"] : ["ties"];
      add(e, "unconnected", `${e.name} isn't connected to anything`, "No relationships, no place, and nothing mentions it.", parts, 1);
    }
  }

  const visible = opts.includeDismissed ? spots : spots.filter((s) => !dismissedIds.has(s.id));
  visible.sort((a, b) => b.weight - a.weight || a.entity.name.localeCompare(b.entity.name));
  return { spots: visible, dismissed: spots.filter((s) => dismissedIds.has(s.id)).length };
}

export async function setThinSpotDismissed(db: DB, worldId: string, id: string | null, dismissed: boolean) {
  const [w] = await db.select({ settings: worlds.settings }).from(worlds).where(eq(worlds.id, worldId));
  if (!w) throw new Error("World not found");
  const current = new Set(w.settings.thinSpotsDismissed ?? []);
  if (id === null) current.clear();
  else if (dismissed) current.add(id);
  else current.delete(id);
  await db.update(worlds).set({ settings: { ...w.settings, thinSpotsDismissed: [...current].slice(-500) } }).where(eq(worlds.id, worldId));
}
