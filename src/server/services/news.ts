/**
 * World News: a briefing of significant recent happenings in the living world,
 * assembled from canon data (events, thread stages reached, rumours started)
 * within an in-world time window. Nothing here is generated or invented.
 */
import { and, desc, eq, gte, inArray, isNull, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, rumours, threadStages, worldThreads } from "@/server/db/schema";
import { listTimeline } from "./timeline";

export const NEWS_CATEGORIES = [
  { key: "war", label: "War & conflict", words: ["war", "battle", "siege", "invade", "invasion", "army", "armies", "raid", "skirmish", "attack", "ambush", "captured", "captures", "falls", "fort"] },
  { key: "death", label: "Deaths", words: ["died", "dies", "dead", "death", "killed", "kills", "murder", "assassin", "slain", "executed", "funeral"] },
  { key: "missing", label: "Disappearances", words: ["missing", "vanish", "disappear", "abducted", "kidnap", "lost", "taken"] },
  { key: "politics", label: "Politics", words: ["king", "queen", "crown", "council", "regent", "throne", "coronation", "treaty", "law", "decree", "election", "court", "prince", "lord", "lady", "noble", "rule"] },
  { key: "trade", label: "Trade", words: ["trade", "price", "prices", "merchant", "caravan", "grain", "market", "tariff", "shortage", "harvest", "granar", "coin", "guild", "shipping", "road"] },
  { key: "faith", label: "Faith", words: ["temple", "faith", "priest", "god", "goddess", "cult", "heresy", "shrine", "pilgrim", "prophecy", "omen", "holy"] },
  { key: "disaster", label: "Disasters", words: ["plague", "fever", "sickness", "flood", "fire", "storm", "earthquake", "drought", "famine", "blight", "eruption"] },
  { key: "discovery", label: "Discoveries", words: ["discover", "found", "unearth", "ruin", "artifact", "relic", "map", "expedition", "clue", "secret"] },
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number]["key"] | "faction" | "rumour" | "other";

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  ...(Object.fromEntries(NEWS_CATEGORIES.map((c) => [c.key, c.label])) as Record<(typeof NEWS_CATEGORIES)[number]["key"], string>),
  faction: "Faction moves",
  rumour: "Rumours",
  other: "Other news",
};

export function categorize(text: string, hint?: string): NewsCategory {
  const t = ` ${text.toLowerCase()} `;
  let best: { key: NewsCategory; score: number } = { key: hint === "faction" ? "faction" : "other", score: 0 };
  for (const c of NEWS_CATEGORIES) {
    let score = 0;
    for (const w of c.words) if (t.includes(w)) score += w.length > 4 ? 2 : 1;
    if (score > best.score) best = { key: c.key, score };
  }
  return best.key;
}

export interface NewsItem {
  id: string;
  /** the entity to open */
  entityId: string;
  source: "event" | "rumour" | "thread";
  category: NewsCategory;
  title: string;
  summary: string;
  at: number;
  location: { id: string; name: string } | null;
  people: { id: string; name: string; type: string }[];
  visibleToPlayers: boolean;
  /** rumours: how true it is (DM only) */
  accuracy?: number;
  /** thread stage reached */
  thread?: { name: string; stage: string; progress: number };
  origin?: string;
}

const PLAYER_VISIBLE = ["public", "discovered", "partially_known"] as const;

export async function worldNews(
  db: DB,
  worldId: string,
  opts: { campaignId: string | null; from: number; to: number; playersOnly?: boolean },
): Promise<NewsItem[]> {
  const items: NewsItem[] = [];

  // 1. Events in the window (not ancient history).
  const evs = await listTimeline(db, worldId, { campaignId: opts.campaignId, from: opts.from, to: opts.to, visibleOnly: opts.playersOnly, limit: 300 });
  for (const e of evs) {
    if (e.kind === "historical" && e.origin === "manual" && e.importance < 1) continue;
    if (e.canonStatus === "draft" || e.canonStatus === "proposed") continue;
    items.push({
      id: `ev-${e.id}`,
      entityId: e.id,
      source: "event",
      category: categorize(`${e.name} ${e.summary}`, e.kind),
      title: e.name,
      summary: e.summary,
      at: e.startAt,
      location: e.location,
      people: e.participants.slice(0, 4),
      visibleToPlayers: (PLAYER_VISIBLE as readonly string[]).includes(e.visibility),
      origin: e.origin,
    });
  }

  // 2. Rumours that started circulating in the window.
  const scope = opts.campaignId ? or(isNull(entities.campaignId), eq(entities.campaignId, opts.campaignId)) : isNull(entities.campaignId);
  const rums = await db
    .select({ id: entities.id, name: entities.name, summary: entities.summary, visibility: entities.visibility, locationId: entities.locationId, r: rumours })
    .from(rumours)
    .innerJoin(entities, eq(entities.id, rumours.entityId))
    .where(
      and(
        eq(entities.worldId, worldId),
        scope,
        ne(entities.canonStatus, "archived"),
        isNotNull(rumours.startedAt),
        gte(rumours.startedAt, opts.from),
        lte(rumours.startedAt, opts.to),
        opts.playersOnly ? inArray(entities.visibility, [...PLAYER_VISIBLE]) : undefined,
      ),
    )
    .orderBy(desc(rumours.startedAt))
    .limit(100);
  const locIds = rums.map((r) => r.locationId).filter((x): x is string => !!x);
  const locs = locIds.length ? await db.select({ id: entities.id, name: entities.name }).from(entities).where(inArray(entities.id, locIds)) : [];
  for (const r of rums) {
    items.push({
      id: `ru-${r.id}`,
      entityId: r.id,
      source: "rumour",
      category: "rumour",
      title: r.r.claim || r.name,
      summary: r.summary && r.summary !== r.r.claim ? r.summary : "",
      at: r.r.startedAt!,
      location: locs.find((l) => l.id === r.locationId) ?? null,
      people: [],
      // Players hear rumours whose entity is visible; the truth/accuracy stays with the DM.
      visibleToPlayers: (PLAYER_VISIBLE as readonly string[]).includes(r.visibility),
      accuracy: opts.playersOnly ? undefined : r.r.accuracy,
    });
  }

  // 3. World thread stages reached in the window (DM-facing: threads are the machinery).
  if (!opts.playersOnly) {
    const stages = await db
      .select({ threadId: threadStages.threadId, title: threadStages.title, description: threadStages.description, reachedAt: threadStages.reachedAt, position: threadStages.position, name: entities.name, progress: worldThreads.progress })
      .from(threadStages)
      .innerJoin(worldThreads, eq(worldThreads.entityId, threadStages.threadId))
      .innerJoin(entities, eq(entities.id, threadStages.threadId))
      .where(and(eq(entities.worldId, worldId), ne(entities.canonStatus, "archived"), isNotNull(threadStages.reachedAt), gte(threadStages.reachedAt, opts.from), lte(threadStages.reachedAt, opts.to), sql`${threadStages.position} > 0`));
    for (const s of stages) {
      items.push({
        id: `th-${s.threadId}-${s.position}`,
        entityId: s.threadId,
        source: "thread",
        category: categorize(`${s.name} ${s.title} ${s.description}`),
        title: `${s.name}: ${s.title}`,
        summary: s.description,
        at: s.reachedAt!,
        location: null,
        people: [],
        visibleToPlayers: false,
        thread: { name: s.name, stage: s.title, progress: s.progress },
      });
    }
  }

  return items.sort((a, b) => b.at - a.at);
}
