import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, events, relationships, type EventKind } from "@/server/db/schema";
import { createEntity } from "./entities";
import { createRelationship } from "./relationships";
import type { Actor } from "./history";

export interface CreateEventInput {
  title: string;
  summary?: string;
  body?: string;
  kind: EventKind;
  startAt: number;
  endAt?: number | null;
  precision?: "year" | "month" | "day" | "minute";
  locationId?: string | null;
  involvedIds?: string[];
  campaignId?: string | null;
  sessionId?: string | null;
  visibility?: "dm_only" | "secret" | "partially_known" | "discovered" | "public";
  origin?: "manual" | "ai" | "advance" | "session";
  tags?: string[];
  importance?: number;
}

/** Create a timeline event (an `event` entity) and link its participants. */
export async function createEvent(db: DB, worldId: string, actor: Actor, input: CreateEventInput) {
  const ent = await createEntity(db, worldId, actor, {
    type: "event",
    name: input.title,
    summary: input.summary ?? "",
    body: input.body ?? "",
    locationId: input.locationId ?? null,
    campaignId: input.campaignId ?? null,
    visibility: input.visibility ?? "dm_only",
    tags: input.tags ?? [],
    importance: input.importance ?? 0,
    event: {
      kind: input.kind,
      startAt: input.startAt,
      endAt: input.endAt ?? null,
      precision: input.precision ?? "day",
      sessionId: input.sessionId ?? null,
      origin: input.origin ?? "manual",
    },
  });
  for (const id of Array.from(new Set(input.involvedIds ?? []))) {
    if (id === ent.id) continue;
    try {
      await createRelationship(db, worldId, actor, { sourceId: ent.id, targetId: id, type: "involves", campaignId: input.campaignId ?? null });
    } catch {
      /* skip invalid participant */
    }
  }
  return ent;
}

export interface TimelineFilter {
  campaignId?: string | null;
  /** include campaign events of this campaign in addition to world events */
  includeCampaign?: boolean;
  kinds?: EventKind[];
  entityId?: string; // character / faction / location filter
  from?: number;
  to?: number;
  limit?: number;
  order?: "asc" | "desc";
  visibleOnly?: boolean;
}

export async function listTimeline(db: DB, worldId: string, f: TimelineFilter = {}) {
  const where: (SQL | undefined)[] = [eq(entities.worldId, worldId), ne(entities.canonStatus, "archived")];
  if (f.campaignId && f.includeCampaign !== false) where.push(or(isNull(entities.campaignId), eq(entities.campaignId, f.campaignId)));
  else if (f.campaignId === undefined || f.campaignId === null) where.push(isNull(entities.campaignId));
  if (f.kinds?.length) where.push(inArray(events.kind, f.kinds));
  if (f.from !== undefined) where.push(gte(sql`coalesce(${events.endAt}, ${events.startAt})`, f.from));
  if (f.to !== undefined) where.push(lte(events.startAt, f.to));
  if (f.visibleOnly) where.push(inArray(entities.visibility, ["public", "discovered", "partially_known"]));
  if (f.entityId) {
    const involved = db
      .select({ id: relationships.sourceId })
      .from(relationships)
      .where(and(eq(relationships.targetId, f.entityId), eq(relationships.type, "involves")));
    // Events at this place or anywhere inside it (one level of containment).
    const inside = db.select({ id: entities.id }).from(entities).where(eq(entities.locationId, f.entityId));
    where.push(or(eq(entities.locationId, f.entityId), inArray(entities.id, involved), inArray(entities.locationId, inside)));
  }
  const rows = await db
    .select({
      id: entities.id,
      name: entities.name,
      summary: entities.summary,
      body: entities.body,
      kind: events.kind,
      startAt: events.startAt,
      endAt: events.endAt,
      precision: events.precision,
      origin: events.origin,
      sessionId: events.sessionId,
      locationId: entities.locationId,
      campaignId: entities.campaignId,
      visibility: entities.visibility,
      canonStatus: entities.canonStatus,
      importance: entities.importance,
    })
    .from(events)
    .innerJoin(entities, eq(entities.id, events.entityId))
    .where(and(...where))
    .orderBy(f.order === "desc" ? desc(events.startAt) : asc(events.startAt))
    .limit(f.limit ?? 500);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const parts = await db
    .select({ eventId: relationships.sourceId, id: entities.id, name: entities.name, type: entities.type })
    .from(relationships)
    .innerJoin(entities, eq(entities.id, relationships.targetId))
    .where(and(inArray(relationships.sourceId, ids), eq(relationships.type, "involves")));
  const locIds = rows.map((r) => r.locationId).filter((x): x is string => !!x);
  const locs = locIds.length ? await db.select({ id: entities.id, name: entities.name }).from(entities).where(inArray(entities.id, locIds)) : [];
  return rows.map((r) => ({
    ...r,
    participants: parts.filter((p) => p.eventId === r.id).map(({ id, name, type }) => ({ id, name, type })),
    location: locs.find((l) => l.id === r.locationId) ?? null,
  }));
}

export type TimelineEvent = Awaited<ReturnType<typeof listTimeline>>[number];
