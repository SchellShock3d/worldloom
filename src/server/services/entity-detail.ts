/** Everything an entity page shows, gathered in one place. */
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import {
  campaigns,
  clues,
  entities,
  entityMetrics,
  events,
  facts,
  gameSessions,
  mapMarkers,
  maps,
  mentions,
  mysteries,
  notes,
  questObjectives,
  quests,
  relationships,
  rumours,
  sceneEntities,
  scenes,
  threadStages,
  worldThreads,
  type Entity,
} from "@/server/db/schema";
import { getEntityTags, getLocationChain, getCustomTypes } from "./entities";
import { listRelationshipsFor } from "./relationships";
import { getCampaignEntityState } from "./campaigns";
import { getEntityType } from "@/lib/entity-types";

export async function getEntityDetail(db: DB, worldId: string, entity: Entity, campaignId?: string | null) {
  const id = entity.id;
  const custom = await getCustomTypes(db, worldId);
  const typeDef = getEntityType(entity.type, custom);

  const [tagsList, locationChain, rels, contents, subpages, backlinks, markers, metrics, overlay, eventsHere, heldFacts, aboutFacts, appearances] =
    await Promise.all([
      getEntityTags(db, id),
      getLocationChain(db, worldId, entity.locationId),
      listRelationshipsFor(db, worldId, id, campaignId),
      db
        .select({ id: entities.id, name: entities.name, type: entities.type, status: entities.status, summary: entities.summary })
        .from(entities)
        .where(and(eq(entities.worldId, worldId), eq(entities.locationId, id), ne(entities.canonStatus, "archived"), campaignId ? sql`(${entities.campaignId} is null or ${entities.campaignId} = ${campaignId})` : isNull(entities.campaignId)))
        .orderBy(asc(entities.type), asc(entities.name))
        .limit(200),
      db
        .select({ id: entities.id, name: entities.name, type: entities.type })
        .from(entities)
        .where(and(eq(entities.worldId, worldId), eq(entities.parentId, id), ne(entities.canonStatus, "archived")))
        .orderBy(asc(entities.name)),
      getBacklinks(db, worldId, id),
      db
        .select({ id: mapMarkers.id, mapId: maps.id, mapName: maps.name, label: mapMarkers.label })
        .from(mapMarkers)
        .innerJoin(maps, eq(maps.id, mapMarkers.mapId))
        .where(and(eq(mapMarkers.entityId, id), eq(maps.worldId, worldId))),
      db.select().from(entityMetrics).where(and(eq(entityMetrics.worldId, worldId), eq(entityMetrics.entityId, id))).orderBy(asc(entityMetrics.label)),
      campaignId ? getCampaignEntityState(db, campaignId, id) : Promise.resolve(null),
      getEventsForEntity(db, worldId, id, campaignId),
      db
        .select({ fact: facts, subjectName: entities.name })
        .from(facts)
        .leftJoin(entities, and(eq(entities.id, facts.subjectId), eq(entities.worldId, worldId)))
        .where(and(eq(facts.worldId, worldId), eq(facts.holderId, id), campaignId ? sql`(${facts.campaignId} is null or ${facts.campaignId} = ${campaignId})` : isNull(facts.campaignId)))
        .orderBy(desc(facts.updatedAt)),
      db
        .select({ fact: facts, holderName: entities.name, holderType: entities.type })
        .from(facts)
        .leftJoin(entities, and(eq(entities.id, facts.holderId), eq(entities.worldId, worldId)))
        .where(and(eq(facts.worldId, worldId), eq(facts.subjectId, id), campaignId ? sql`(${facts.campaignId} is null or ${facts.campaignId} = ${campaignId})` : isNull(facts.campaignId)))
        .orderBy(desc(facts.updatedAt)),
      getAppearances(db, worldId, id),
    ]);

  const extension = await getExtension(db, worldId, entity);

  let overlayLocation: { id: string; name: string } | null = null;
  if (overlay?.locationId) {
    const [l] = await db.select({ id: entities.id, name: entities.name }).from(entities).where(and(eq(entities.id, overlay.locationId), eq(entities.worldId, worldId)));
    overlayLocation = l ?? null;
  }

  return {
    typeDef,
    tags: tagsList,
    locationChain,
    relationships: rels,
    contents,
    subpages,
    backlinks,
    markers,
    metrics,
    overlay: overlay ? { ...overlay, location: overlayLocation } : null,
    events: eventsHere,
    heldFacts,
    aboutFacts,
    appearances,
    extension,
  };
}

export type EntityDetail = Awaited<ReturnType<typeof getEntityDetail>>;

export async function getBacklinks(db: DB, worldId: string, entityId: string) {
  const rows = await db.select().from(mentions).where(and(eq(mentions.worldId, worldId), eq(mentions.entityId, entityId)));
  const byKind = (k: string) => rows.filter((r) => r.sourceKind === k).map((r) => r.sourceId);
  const out: { kind: string; id: string; title: string; type?: string; campaignId?: string | null }[] = [];
  const entIds = byKind("entity");
  if (entIds.length) {
    const ents = await db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(and(eq(entities.worldId, worldId), inArray(entities.id, entIds)));
    out.push(...ents.map((e) => ({ kind: "entity", id: e.id, title: e.name, type: e.type })));
  }
  const sessIds = byKind("session");
  if (sessIds.length) {
    const ss = await db
      .select({ id: gameSessions.id, number: gameSessions.number, title: gameSessions.title, campaignId: gameSessions.campaignId })
      .from(gameSessions)
      .innerJoin(campaigns, eq(campaigns.id, gameSessions.campaignId))
      .where(and(eq(campaigns.worldId, worldId), inArray(gameSessions.id, sessIds)));
    out.push(...ss.map((s) => ({ kind: "session", id: s.id, title: `Session ${s.number}${s.title ? `: ${s.title}` : ""}`, campaignId: s.campaignId })));
  }
  const noteIds = byKind("note");
  if (noteIds.length) {
    const ns = await db.select({ id: notes.id, title: notes.title, campaignId: notes.campaignId }).from(notes).where(and(eq(notes.worldId, worldId), inArray(notes.id, noteIds)));
    out.push(...ns.map((n) => ({ kind: "note", id: n.id, title: n.title || "Untitled note", campaignId: n.campaignId })));
  }
  const sceneIds = byKind("scene");
  if (sceneIds.length) {
    const sc = await db
      .select({ id: scenes.id, name: scenes.name, campaignId: scenes.campaignId })
      .from(scenes)
      .innerJoin(campaigns, eq(campaigns.id, scenes.campaignId))
      .where(and(eq(campaigns.worldId, worldId), inArray(scenes.id, sceneIds)));
    out.push(...sc.map((s) => ({ kind: "scene", id: s.id, title: s.name, campaignId: s.campaignId })));
  }
  return out;
}

/** Sessions where this entity was mentioned or present in a scene, grouped by campaign. */
export async function getAppearances(db: DB, worldId: string, entityId: string) {
  const viaMentions = await db
    .select({ sessionId: gameSessions.id, number: gameSessions.number, title: gameSessions.title, campaignId: campaigns.id, campaignName: campaigns.name })
    .from(mentions)
    .innerJoin(gameSessions, eq(gameSessions.id, mentions.sourceId))
    .innerJoin(campaigns, eq(campaigns.id, gameSessions.campaignId))
    .where(and(eq(mentions.entityId, entityId), eq(mentions.sourceKind, "session"), eq(campaigns.worldId, worldId)));
  const viaScenes = await db
    .select({ sessionId: gameSessions.id, number: gameSessions.number, title: gameSessions.title, campaignId: campaigns.id, campaignName: campaigns.name })
    .from(sceneEntities)
    .innerJoin(scenes, eq(scenes.id, sceneEntities.sceneId))
    .innerJoin(gameSessions, eq(gameSessions.id, scenes.sessionId))
    .innerJoin(campaigns, eq(campaigns.id, gameSessions.campaignId))
    .where(and(eq(sceneEntities.entityId, entityId), eq(campaigns.worldId, worldId)));
  const map = new Map<string, { campaignId: string; campaignName: string; sessions: { id: string; number: number; title: string }[] }>();
  for (const r of [...viaMentions, ...viaScenes]) {
    const g = map.get(r.campaignId) ?? { campaignId: r.campaignId, campaignName: r.campaignName, sessions: [] };
    if (!g.sessions.some((s) => s.id === r.sessionId)) g.sessions.push({ id: r.sessionId, number: r.number, title: r.title });
    map.set(r.campaignId, g);
  }
  for (const g of map.values()) g.sessions.sort((a, b) => a.number - b.number);
  return [...map.values()];
}

/** Timeline events involving this entity or located at it. */
export async function getEventsForEntity(db: DB, worldId: string, entityId: string, campaignId?: string | null) {
  const involved = db
    .select({ id: relationships.sourceId })
    .from(relationships)
    .where(and(eq(relationships.worldId, worldId), eq(relationships.targetId, entityId), eq(relationships.type, "involves")));
  return db
    .select({
      id: entities.id,
      name: entities.name,
      summary: entities.summary,
      kind: events.kind,
      startAt: events.startAt,
      endAt: events.endAt,
      precision: events.precision,
      visibility: entities.visibility,
      campaignId: entities.campaignId,
    })
    .from(events)
    .innerJoin(entities, eq(entities.id, events.entityId))
    .where(
      and(
        eq(entities.worldId, worldId),
        ne(entities.canonStatus, "archived"),
        campaignId ? sql`(${entities.campaignId} is null or ${entities.campaignId} = ${campaignId})` : isNull(entities.campaignId),
        or(eq(entities.locationId, entityId), inArray(entities.id, involved)),
      ),
    )
    .orderBy(asc(events.startAt))
    .limit(200);
}

export async function getExtension(db: DB, worldId: string, entity: Entity) {
  switch (entity.type) {
    case "quest": {
      const [q] = await db.select().from(quests).where(eq(quests.entityId, entity.id));
      const objectives = await db.select().from(questObjectives).where(eq(questObjectives.questId, entity.id)).orderBy(asc(questObjectives.position));
      const refs = [q?.giverId, q?.threadId].filter((x): x is string => !!x);
      const refRows = refs.length ? await db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(and(eq(entities.worldId, worldId), inArray(entities.id, refs))) : [];
      const questClues = await db.select().from(clues).where(and(eq(clues.worldId, worldId), eq(clues.questId, entity.id))).orderBy(asc(clues.position));
      return {
        kind: "quest" as const,
        quest: q ?? null,
        objectives,
        giver: refRows.find((r) => r.id === q?.giverId) ?? null,
        thread: refRows.find((r) => r.id === q?.threadId) ?? null,
        clues: questClues,
      };
    }
    case "world_thread": {
      const [t] = await db.select().from(worldThreads).where(eq(worldThreads.entityId, entity.id));
      const stages = await db.select().from(threadStages).where(eq(threadStages.threadId, entity.id)).orderBy(asc(threadStages.position));
      return { kind: "thread" as const, thread: t ?? null, stages };
    }
    case "mystery": {
      const [m] = await db.select().from(mysteries).where(eq(mysteries.entityId, entity.id));
      const cl = await db.select().from(clues).where(and(eq(clues.worldId, worldId), eq(clues.mysteryId, entity.id))).orderBy(asc(clues.position), asc(clues.createdAt));
      return { kind: "mystery" as const, mystery: m ?? null, clues: cl };
    }
    case "rumour": {
      const [r] = await db.select().from(rumours).where(eq(rumours.entityId, entity.id));
      let origin: { id: string; name: string } | null = null;
      if (r?.originEventId) {
        const [o] = await db.select({ id: entities.id, name: entities.name }).from(entities).where(and(eq(entities.id, r.originEventId), eq(entities.worldId, worldId)));
        origin = o ?? null;
      }
      return { kind: "rumour" as const, rumour: r ?? null, origin };
    }
    case "event": {
      const [e] = await db.select().from(events).where(eq(events.entityId, entity.id));
      return { kind: "event" as const, event: e ?? null };
    }
    default:
      return null;
  }
}
