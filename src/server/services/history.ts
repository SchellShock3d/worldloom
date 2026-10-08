import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, mentions, revisions, type MentionSourceKind } from "@/server/db/schema";
import { extractMentionIds, type NameIndexEntry } from "@/lib/mentions";

/** Who is making a change. AI changes always carry the approving user and proposal. */
export interface Actor {
  type: "user" | "ai" | "system";
  userId: string | null;
  proposalId?: string | null;
}

export const userActor = (userId: string): Actor => ({ type: "user", userId });

export interface RevisionInput {
  worldId: string;
  campaignId?: string | null;
  targetKind: string;
  targetId: string;
  targetLabel: string;
  action: "create" | "update" | "delete" | "advance";
  summary?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export async function recordRevision(db: DB, actor: Actor, r: RevisionInput) {
  await db.insert(revisions).values({
    worldId: r.worldId,
    campaignId: r.campaignId ?? null,
    targetKind: r.targetKind,
    targetId: r.targetId,
    targetLabel: r.targetLabel,
    action: r.action,
    actorType: actor.type,
    actorUserId: actor.userId,
    proposalId: actor.proposalId ?? null,
    summary: r.summary ?? "",
    before: r.before ?? null,
    after: r.after ?? null,
  });
}

/** Shallow diff: only keys whose JSON value changed. */
export function diffRecords(before: Record<string, unknown>, after: Record<string, unknown>, keys?: string[]) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const ks = keys ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  for (const k of ks) {
    if (k === "updatedAt" || k === "createdAt" || k === "searchVector") continue;
    if (!(k in after)) continue;
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) {
      b[k] = before[k] ?? null;
      a[k] = after[k] ?? null;
    }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}

/** Re-index the mentions found in one source document (or several fields of it). */
export async function syncMentions(db: DB, worldId: string, sourceKind: MentionSourceKind, sourceId: string, ...docs: (string | null | undefined)[]) {
  const ids = Array.from(new Set(docs.flatMap((d) => extractMentionIds(d))));
  await db.delete(mentions).where(and(eq(mentions.sourceKind, sourceKind), eq(mentions.sourceId, sourceId)));
  if (!ids.length) return;
  const valid = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), inArray(entities.id, ids)));
  const rows = valid.filter((v) => !(sourceKind === "entity" && v.id === sourceId)).map((v) => ({ worldId, sourceKind, sourceId, entityId: v.id }));
  if (rows.length) await db.insert(mentions).values(rows).onConflictDoNothing();
}

/** Names and aliases of every entity visible in a world/campaign, for @mention resolution. */
export async function getNameIndex(db: DB, worldId: string, campaignId?: string | null): Promise<NameIndexEntry[]> {
  const rows = await db
    .select({ id: entities.id, name: entities.name, aliases: entities.aliases })
    .from(entities)
    .where(
      and(
        eq(entities.worldId, worldId),
        campaignId ? sql`(${entities.campaignId} is null or ${entities.campaignId} = ${campaignId})` : sql`${entities.campaignId} is null`,
        sql`${entities.canonStatus} <> 'archived'`,
      ),
    );
  const out: NameIndexEntry[] = [];
  for (const r of rows) {
    out.push({ id: r.id, name: r.name });
    for (const a of r.aliases) if (a.trim()) out.push({ id: r.id, name: a });
  }
  return out;
}
