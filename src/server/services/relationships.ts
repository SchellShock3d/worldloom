import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DB } from "@/server/db/client";
import { entities, relationships, type Relationship } from "@/server/db/schema";
import { normalizeRelationshipType, relationshipLabel, RELATIONSHIP_TYPE_MAP } from "@/lib/relationship-types";
import { relationshipInput, type RelationshipInput, parsePatch } from "@/lib/validation";
import { diffRecords, recordRevision, type Actor } from "./history";

export class RelationshipError extends Error {}

export async function createRelationship(db: DB, worldId: string, actor: Actor, raw: RelationshipInput): Promise<Relationship> {
  const input = relationshipInput.parse(raw);
  if (input.sourceId === input.targetId) throw new RelationshipError("An entity can't have a relationship with itself.");
  const ends = await db
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), inArray(entities.id, [input.sourceId, input.targetId])));
  if (ends.length !== 2) throw new RelationshipError("Both entities must exist in this world.");
  const type = normalizeRelationshipType(input.type);
  if (!type) throw new RelationshipError("Relationship type is required.");

  // Avoid exact duplicates (including the mirrored form of symmetric types).
  const symmetric = RELATIONSHIP_TYPE_MAP[type]?.symmetric;
  const [dupe] = await db
    .select({ id: relationships.id })
    .from(relationships)
    .where(
      and(
        eq(relationships.worldId, worldId),
        eq(relationships.type, type),
        input.campaignId ? eq(relationships.campaignId, input.campaignId) : isNull(relationships.campaignId),
        symmetric
          ? or(
              and(eq(relationships.sourceId, input.sourceId), eq(relationships.targetId, input.targetId)),
              and(eq(relationships.sourceId, input.targetId), eq(relationships.targetId, input.sourceId)),
            )
          : and(eq(relationships.sourceId, input.sourceId), eq(relationships.targetId, input.targetId)),
      ),
    )
    .limit(1);
  if (dupe) throw new RelationshipError("That relationship already exists.");

  const [row] = await db
    .insert(relationships)
    .values({
      worldId,
      campaignId: input.campaignId ?? null,
      sourceId: input.sourceId,
      targetId: input.targetId,
      type,
      description: input.description,
      strength: input.strength ?? null,
      visibility: input.visibility,
      canonStatus: input.canonStatus,
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
    })
    .returning();
  const src = ends.find((e) => e.id === input.sourceId)!.name;
  const tgt = ends.find((e) => e.id === input.targetId)!.name;
  await recordRevision(db, actor, {
    worldId,
    campaignId: row!.campaignId,
    targetKind: "relationship",
    targetId: row!.id,
    targetLabel: `${src} ${relationshipLabel(type, "forward")} ${tgt}`,
    action: "create",
    summary: `Linked ${src} → ${relationshipLabel(type, "forward")} → ${tgt}`,
    after: row as unknown as Record<string, unknown>,
  });
  return row!;
}

export async function updateRelationship(db: DB, worldId: string, actor: Actor, id: string, raw: Partial<RelationshipInput>) {
  const [before] = await db.select().from(relationships).where(and(eq(relationships.id, id), eq(relationships.worldId, worldId)));
  if (!before) throw new RelationshipError("Relationship not found");
  const patch = parsePatch(relationshipInput.partial(), raw);
  const values: Partial<typeof relationships.$inferInsert> = {};
  if (patch.type !== undefined) values.type = normalizeRelationshipType(patch.type);
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.strength !== undefined) values.strength = patch.strength;
  if (patch.visibility !== undefined) values.visibility = patch.visibility;
  if (patch.canonStatus !== undefined) values.canonStatus = patch.canonStatus;
  if (patch.startAt !== undefined) values.startAt = patch.startAt;
  if (patch.endAt !== undefined) values.endAt = patch.endAt;
  const [after] = await db.update(relationships).set(values).where(eq(relationships.id, id)).returning();
  const d = diffRecords(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
  if (d.changed.length)
    await recordRevision(db, actor, {
      worldId,
      campaignId: before.campaignId,
      targetKind: "relationship",
      targetId: id,
      targetLabel: relationshipLabel(after!.type, "forward"),
      action: "update",
      summary: `Updated relationship (${d.changed.join(", ")})`,
      before: d.before,
      after: d.after,
    });
  return after!;
}

export async function deleteRelationship(db: DB, worldId: string, actor: Actor, id: string) {
  const [before] = await db.select().from(relationships).where(and(eq(relationships.id, id), eq(relationships.worldId, worldId)));
  if (!before) throw new RelationshipError("Relationship not found");
  await db.delete(relationships).where(eq(relationships.id, id));
  await recordRevision(db, actor, {
    worldId,
    campaignId: before.campaignId,
    targetKind: "relationship",
    targetId: id,
    targetLabel: relationshipLabel(before.type, "forward"),
    action: "delete",
    summary: "Removed relationship",
    before: before as unknown as Record<string, unknown>,
  });
}

export interface RelationshipView {
  id: string;
  type: string;
  label: string;
  direction: "outgoing" | "incoming";
  other: { id: string; name: string; type: string; status: string | null };
  description: string;
  strength: number | null;
  visibility: string;
  canonStatus: string;
  campaignId: string | null;
  startAt: number | null;
  endAt: number | null;
}

/** All relationships touching an entity, phrased from that entity's point of view. */
export async function listRelationshipsFor(db: DB, worldId: string, entityId: string, campaignId?: string | null): Promise<RelationshipView[]> {
  const other = alias(entities, "other");
  const scope = campaignId
    ? sql`(${relationships.campaignId} is null or ${relationships.campaignId} = ${campaignId})`
    : isNull(relationships.campaignId);
  const rows = await db
    .select({ rel: relationships, other: { id: other.id, name: other.name, type: other.type, status: other.status } })
    .from(relationships)
    .innerJoin(other, sql`${other.id} = case when ${relationships.sourceId} = ${entityId} then ${relationships.targetId} else ${relationships.sourceId} end`)
    .where(and(eq(relationships.worldId, worldId), or(eq(relationships.sourceId, entityId), eq(relationships.targetId, entityId)), scope, ne(relationships.canonStatus, "archived")));
  return rows.map(({ rel, other: o }) => {
    const outgoing = rel.sourceId === entityId;
    const def = RELATIONSHIP_TYPE_MAP[rel.type];
    return {
      id: rel.id,
      type: rel.type,
      label: outgoing || def?.symmetric ? relationshipLabel(rel.type, "forward") : relationshipLabel(rel.type, "inverse"),
      direction: outgoing ? "outgoing" : "incoming",
      other: o,
      description: rel.description,
      strength: rel.strength,
      visibility: rel.visibility,
      canonStatus: rel.canonStatus,
      campaignId: rel.campaignId,
      startAt: rel.startAt,
      endAt: rel.endAt,
    };
  });
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  importance: number;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  derived?: boolean;
}

/**
 * Relationship graph. With `focusId`, returns the neighbourhood within `depth`
 * hops; otherwise the whole world (capped). "Located in" edges are derived from
 * entities.location_id.
 */
export async function getGraph(db: DB, worldId: string, opts: { focusId?: string; depth?: number; types?: string[]; campaignId?: string | null; limit?: number } = {}) {
  const scope = opts.campaignId
    ? sql`(${relationships.campaignId} is null or ${relationships.campaignId} = ${opts.campaignId})`
    : isNull(relationships.campaignId);
  const relRows = await db
    .select({ id: relationships.id, source: relationships.sourceId, target: relationships.targetId, type: relationships.type })
    .from(relationships)
    .where(and(eq(relationships.worldId, worldId), scope, ne(relationships.canonStatus, "archived")));
  const entScope = opts.campaignId ? sql`(${entities.campaignId} is null or ${entities.campaignId} = ${opts.campaignId})` : isNull(entities.campaignId);
  const entRows = await db
    .select({ id: entities.id, name: entities.name, type: entities.type, importance: entities.importance, locationId: entities.locationId })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), entScope, ne(entities.canonStatus, "archived"), opts.types?.length ? inArray(entities.type, opts.types) : undefined));

  const nodeMap = new Map(entRows.map((e) => [e.id, e]));
  let edges: GraphEdge[] = relRows
    .filter((r) => nodeMap.has(r.source) && nodeMap.has(r.target))
    .map((r) => ({ id: r.id, source: r.source, target: r.target, type: r.type, label: relationshipLabel(r.type, "forward") }));
  for (const e of entRows) {
    if (e.locationId && nodeMap.has(e.locationId)) {
      edges.push({ id: `loc-${e.id}`, source: e.id, target: e.locationId, type: "located_in", label: "located in", derived: true });
    }
  }

  let nodeIds: Set<string>;
  if (opts.focusId && nodeMap.has(opts.focusId)) {
    nodeIds = new Set([opts.focusId]);
    let frontier = new Set([opts.focusId]);
    for (let d = 0; d < (opts.depth ?? 2); d++) {
      const next = new Set<string>();
      for (const e of edges) {
        if (frontier.has(e.source) && !nodeIds.has(e.target)) next.add(e.target);
        if (frontier.has(e.target) && !nodeIds.has(e.source)) next.add(e.source);
      }
      next.forEach((n) => nodeIds.add(n));
      frontier = next;
    }
  } else {
    // Whole world: keep connected nodes plus important loners, capped by degree.
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    const ranked = entRows
      .filter((e) => (degree.get(e.id) ?? 0) > 0 || e.importance > 0)
      .sort((a, b) => (degree.get(b.id) ?? 0) + b.importance * 3 - ((degree.get(a.id) ?? 0) + a.importance * 3));
    nodeIds = new Set(ranked.slice(0, opts.limit ?? 250).map((e) => e.id));
  }
  edges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  const nodes: GraphNode[] = [...nodeIds].map((id) => {
    const e = nodeMap.get(id)!;
    return { id, name: e.name, type: e.type, importance: e.importance };
  });
  return { nodes, edges };
}
