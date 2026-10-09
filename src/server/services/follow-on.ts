/**
 * Follow-on changes: when something big changes about an entry (someone dies, a town is
 * destroyed, a ruler moves, an entry is archived), the rest of the world may need to catch up.
 * This finds recent changes like that and what they touch, so Claude can propose the knock-on
 * updates. Changes Claude made as follow-ons are never followed up again (no loops).
 */
import { and, desc, eq, gt, inArray, ne, or } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { campaigns, entities, proposalBatches, proposals, relationships, revisions, worlds } from "@/server/db/schema";
import { getEntityType } from "@/lib/entity-types";

export interface FollowOnChange {
  revisionId: string;
  entity: { id: string; name: string; type: string };
  campaign: { id: string; name: string } | null;
  /** "Lady Marr is now dead (was alive)". */
  description: string;
  at: Date;
  touches: { id: string; name: string; type: string }[];
}

const WINDOW_DAYS = 14;

export async function pendingFollowOns(db: DB, worldId: string, opts: { entityId?: string; limit?: number } = {}): Promise<FollowOnChange[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000);
  const rows = await db
    .select({ id: revisions.id, targetKind: revisions.targetKind, targetId: revisions.targetId, campaignId: revisions.campaignId, before: revisions.before, after: revisions.after, createdAt: revisions.createdAt, source: proposalBatches.source })
    .from(revisions)
    .leftJoin(proposals, eq(proposals.id, revisions.proposalId))
    .leftJoin(proposalBatches, eq(proposalBatches.id, proposals.batchId))
    .where(and(eq(revisions.worldId, worldId), inArray(revisions.targetKind, ["entity", "campaign_state"]), eq(revisions.action, "update"), gt(revisions.createdAt, since), ...(opts.entityId ? [eq(revisions.targetId, opts.entityId)] : [])))
    .orderBy(desc(revisions.createdAt))
    .limit(opts.entityId ? 20 : 200);
  const [world] = await db.select({ settings: worlds.settings }).from(worlds).where(eq(worlds.id, worldId));
  const handled = new Set(world?.settings.followOnHandled ?? []);

  const significant = rows.filter((r) => !QUIET_SOURCES.has(r.source ?? "") && !handled.has(r.id) && isSignificant(r.before, r.after));
  // One per entry: its latest big change.
  const latest = new Map<string, (typeof significant)[number]>();
  for (const r of significant) if (!latest.has(r.targetId)) latest.set(r.targetId, r);
  const picked = [...latest.values()].slice(0, opts.limit ?? 5);
  if (!picked.length) return [];

  const ids = picked.map((r) => r.targetId);
  const ents = await db.select({ id: entities.id, name: entities.name, type: entities.type, canonStatus: entities.canonStatus }).from(entities).where(and(eq(entities.worldId, worldId), inArray(entities.id, ids)));
  const placeIds = picked.flatMap((r) => [r.before?.locationId, r.after?.locationId]).filter((x): x is string => typeof x === "string");
  const places = placeIds.length ? await db.select({ id: entities.id, name: entities.name }).from(entities).where(inArray(entities.id, placeIds)) : [];
  const campIds = picked.map((r) => r.campaignId).filter((x): x is string => !!x);
  const camps = campIds.length ? await db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(inArray(campaigns.id, campIds)) : [];

  const out: FollowOnChange[] = [];
  for (const r of picked) {
    const e = ents.find((x) => x.id === r.targetId);
    if (!e) continue;
    const touches = await touchesOf(db, worldId, e.id);
    if (!touches.length) continue;
    const camp = r.targetKind === "campaign_state" ? (camps.find((c) => c.id === r.campaignId) ?? null) : null;
    out.push({ revisionId: r.id, entity: { id: e.id, name: e.name, type: e.type }, campaign: camp, description: describeChange(e.name, e.type, r.before ?? {}, r.after ?? {}, places, camp?.name ?? null), at: r.createdAt, touches });
  }
  return out;
}

/** Statuses something starts out with: setting one for the first time isn't news. */
const ORDINARY = new Set(["alive", "active", "stable", "thriving", "prospering", "peaceful", "open", "healthy", "available", "common", "calm", "intact", "standing"]);

function isSignificant(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return false;
  if ("status" in after && after.status && after.status !== before.status && (before.status || !ORDINARY.has(String(after.status).toLowerCase()))) return true;
  // A move, not something being placed for the first time.
  if ("locationId" in after && before.locationId && after.locationId !== before.locationId) return true;
  if (after.canonStatus === "archived" && before.canonStatus !== "archived") return true;
  return false;
}

/** Changes made while creating content (the world creator, build-outs, generators) aren't news either. */
const QUIET_SOURCES = new Set(["follow_on", "onboarding", "generate"]);

export function describeChange(name: string, type: string, before: Record<string, unknown>, after: Record<string, unknown>, places: { id: string; name: string }[], campaign: string | null): string {
  const where = campaign ? ` in ${campaign}` : "";
  const placeName = (id: unknown) => (typeof id === "string" ? (places.find((p) => p.id === id)?.name ?? "somewhere else") : "nowhere in particular");
  const parts: string[] = [];
  if (after.canonStatus === "archived") parts.push(`${name} was removed from the world (archived)`);
  if ("status" in after && after.status !== before.status && after.status) parts.push(`${name} is now ${String(after.status)}${where}${before.status ? ` (was ${String(before.status)})` : ""}`);
  if ("locationId" in after && after.locationId !== before.locationId) parts.push(`${name} ${getEntityType(type).isPlace ? "now lies within" : "moved to"} ${placeName(after.locationId)}${where}${before.locationId ? ` (from ${placeName(before.locationId)})` : ""}`);
  return parts.join("; ");
}

/** The entries a change to this one ripples into: relationships and contents. */
export async function touchesOf(db: DB, worldId: string, entityId: string) {
  const rels = await db
    .select({ s: relationships.sourceId, t: relationships.targetId })
    .from(relationships)
    .where(and(eq(relationships.worldId, worldId), or(eq(relationships.sourceId, entityId), eq(relationships.targetId, entityId))))
    .limit(60);
  const relIds = [...new Set(rels.map((r) => (r.s === entityId ? r.t : r.s)))];
  const inside = await db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(and(eq(entities.worldId, worldId), eq(entities.locationId, entityId), ne(entities.canonStatus, "archived"))).limit(30);
  const related = relIds.length ? await db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(and(inArray(entities.id, relIds), ne(entities.canonStatus, "archived"))) : [];
  const seen = new Set<string>();
  return [...related, ...inside].filter((x) => x.id !== entityId && !seen.has(x.id) && (seen.add(x.id), true));
}

export async function markFollowOnHandled(db: DB, worldId: string, revisionId: string) {
  const [w] = await db.select({ settings: worlds.settings }).from(worlds).where(eq(worlds.id, worldId));
  if (!w) return;
  const list = [...(w.settings.followOnHandled ?? []).filter((x) => x !== revisionId), revisionId].slice(-300);
  await db.update(worlds).set({ settings: { ...w.settings, followOnHandled: list } }).where(eq(worlds.id, worldId));
}
