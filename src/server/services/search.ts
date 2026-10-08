/**
 * Global search: Postgres full-text search (weighted: name/aliases > summary >
 * article > DM notes) blended with trigram similarity for typo tolerance and
 * prefix matching for type-ahead. Searches entities, sessions, notes,
 * campaigns and maps.
 */
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { rowsOf } from "@/server/db/client";
import { campaigns, gameSessions, maps, notes } from "@/server/db/schema";

export interface SearchResult {
  kind: "entity" | "session" | "note" | "campaign" | "map";
  id: string;
  title: string;
  subtitle: string;
  snippet: string;
  type?: string;
  campaignId?: string | null;
  score: number;
}

function prefixQuery(q: string) {
  const terms = q
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.slice(0, 8);
  if (!terms?.length) return null;
  return terms.map((t) => `${t}:*`).join(" & ");
}

export async function searchWorld(
  db: DB,
  worldId: string,
  q: string,
  opts: { campaignId?: string | null; types?: string[]; limit?: number; kinds?: SearchResult["kind"][] } = {},
): Promise<SearchResult[]> {
  const query = q.trim();
  if (!query) return [];
  const limit = opts.limit ?? 30;
  const prefix = prefixQuery(query);
  const kinds = opts.kinds ?? ["entity", "session", "note", "campaign", "map"];
  const results: SearchResult[] = [];

  if (kinds.includes("entity")) {
    const campaignFilter = opts.campaignId ? sql`(e.campaign_id is null or e.campaign_id = ${opts.campaignId})` : sql`true`;
    const typeFilter = opts.types?.length ? sql`e.type in (${sql.join(opts.types.map((t) => sql`${t}`), sql`, `)})` : sql`true`;
    const tsq = prefix
      ? sql`(websearch_to_tsquery('english', ${query}) || to_tsquery('simple', ${prefix}))`
      : sql`websearch_to_tsquery('english', ${query})`;
    const res = await db.execute(sql`
      select e.id, e.name, e.type, e.summary, e.campaign_id, e.status,
        ts_rank_cd(e.search_vector, ${tsq}) * 2
          + greatest(similarity(e.name, ${query}), coalesce((select max(similarity(a, ${query})) from unnest(e.aliases) a), 0)) * 1.5
          + case when lower(e.name) = lower(${query}) then 3 when e.name ilike ${query + "%"} then 1 else 0 end
          + e.importance * 0.1 as score,
        ts_headline('english', coalesce(nullif(e.summary, ''), left(regexp_replace(e.body, '@\\[([^\\]]+)\\]\\(entity:[^)]+\\)', '\\1', 'g'), 1500)), ${tsq},
          'MaxWords=22, MinWords=8, StartSel=⟦, StopSel=⟧, HighlightAll=false') as snippet
      from entities e
      where e.world_id = ${worldId}
        and e.canon_status <> 'archived'
        and ${campaignFilter}
        and ${typeFilter}
        and (e.search_vector @@ ${tsq} or e.name % ${query} or e.name ilike ${"%" + query + "%"} or ${query} ilike any(e.aliases))
      order by score desc
      limit ${limit}
    `);
    for (const r of rowsOf<{ id: string; name: string; type: string; summary: string; campaign_id: string | null; status: string | null; score: number; snippet: string }>(res)) {
      results.push({
        kind: "entity",
        id: r.id,
        title: r.name,
        subtitle: r.type,
        type: r.type,
        snippet: r.snippet ?? r.summary,
        campaignId: r.campaign_id,
        score: Number(r.score),
      });
    }
  }

  const like = `%${query}%`;
  if (kinds.includes("session")) {
    const rows = await db
      .select({ id: gameSessions.id, number: gameSessions.number, title: gameSessions.title, notes: gameSessions.notes, recap: gameSessions.recap, campaignId: campaigns.id, campaignName: campaigns.name })
      .from(gameSessions)
      .innerJoin(campaigns, eq(campaigns.id, gameSessions.campaignId))
      .where(
        and(
          eq(campaigns.worldId, worldId),
          opts.campaignId ? eq(campaigns.id, opts.campaignId) : undefined,
          or(ilike(gameSessions.title, like), ilike(gameSessions.notes, like), ilike(gameSessions.recap, like)),
        ),
      )
      .orderBy(desc(gameSessions.number))
      .limit(10);
    for (const r of rows) {
      const text = [r.recap, r.notes].find((t) => t.toLowerCase().includes(query.toLowerCase())) ?? r.recap;
      results.push({
        kind: "session",
        id: r.id,
        title: `Session ${r.number}${r.title ? `: ${r.title}` : ""}`,
        subtitle: r.campaignName,
        snippet: excerpt(text, query),
        campaignId: r.campaignId,
        score: r.title.toLowerCase().includes(query.toLowerCase()) ? 1.2 : 0.6,
      });
    }
  }

  if (kinds.includes("note")) {
    const rows = await db
      .select({ id: notes.id, title: notes.title, body: notes.body, campaignId: notes.campaignId })
      .from(notes)
      .where(and(eq(notes.worldId, worldId), or(ilike(notes.title, like), ilike(notes.body, like))))
      .limit(8);
    for (const r of rows)
      results.push({ kind: "note", id: r.id, title: r.title || "Untitled note", subtitle: "Note", snippet: excerpt(r.body, query), campaignId: r.campaignId, score: 0.5 });
  }

  if (kinds.includes("campaign")) {
    const rows = await db
      .select({ id: campaigns.id, name: campaigns.name, premise: campaigns.premise })
      .from(campaigns)
      .where(and(eq(campaigns.worldId, worldId), or(ilike(campaigns.name, like), ilike(campaigns.premise, like))))
      .limit(5);
    for (const r of rows) results.push({ kind: "campaign", id: r.id, title: r.name, subtitle: "Campaign", snippet: excerpt(r.premise, query), campaignId: r.id, score: 1 });
  }

  if (kinds.includes("map")) {
    const rows = await db
      .select({ id: maps.id, name: maps.name, description: maps.description })
      .from(maps)
      .where(and(eq(maps.worldId, worldId), or(ilike(maps.name, like), ilike(maps.description, like))))
      .limit(5);
    for (const r of rows) results.push({ kind: "map", id: r.id, title: r.name, subtitle: "Map", snippet: excerpt(r.description, query), score: 0.9 });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function excerpt(text: string, q: string, radius = 80) {
  if (!text) return "";
  const plain = text.replace(/@\[([^\]]+)\]\(entity:[^)]+\)/g, "$1").replace(/[#*_>`]/g, "");
  const i = plain.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return plain.slice(0, radius * 2).trim() + (plain.length > radius * 2 ? "…" : "");
  const start = Math.max(0, i - radius);
  const end = Math.min(plain.length, i + q.length + radius);
  const before = plain.slice(start, i);
  const hit = plain.slice(i, i + q.length);
  const after = plain.slice(i + q.length, end);
  return `${start > 0 ? "…" : ""}${before}⟦${hit}⟧${after}${end < plain.length ? "…" : ""}`.replace(/\s+/g, " ");
}
