"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { authorizeWorld } from "@/server/auth/access";
import { entities, files, mapLayers, mapMarkers, mapRegions, maps } from "@/server/db/schema";
import { recordRevision, userActor } from "@/server/services/history";
import { run } from "./_util";

const refresh = (worldId: string) => revalidatePath(`/w/${worldId}`, "layout");
const optUuid = z.string().uuid().nullable().optional();
const visibility = z.enum(["dm_only", "secret", "partially_known", "discovered", "public"]);

async function assertRefs(worldId: string, ids: { entityId?: string | null; mapIds?: (string | null | undefined)[]; fileId?: string | null }) {
  const db = await getDb();
  if (ids.entityId) {
    const [e] = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.id, ids.entityId), eq(entities.worldId, worldId)));
    if (!e) throw new Error("Entity not found in this world");
  }
  for (const m of ids.mapIds ?? []) {
    if (!m) continue;
    const [x] = await db.select({ id: maps.id }).from(maps).where(and(eq(maps.id, m), eq(maps.worldId, worldId)));
    if (!x) throw new Error("Map not found in this world");
  }
  if (ids.fileId) {
    const [f] = await db.select({ id: files.id }).from(files).where(and(eq(files.id, ids.fileId), eq(files.worldId, worldId)));
    if (!f) throw new Error("Image not found");
  }
  return db;
}

async function mapInWorld(worldId: string, mapId: string) {
  const db = await getDb();
  const [m] = await db.select().from(maps).where(and(eq(maps.id, mapId), eq(maps.worldId, worldId)));
  if (!m) throw new Error("Map not found");
  return { db, map: m };
}

async function assertLayer(mapId: string, layerId: string | null | undefined) {
  if (!layerId) return;
  const db = await getDb();
  const [l] = await db.select({ id: mapLayers.id }).from(mapLayers).where(and(eq(mapLayers.id, layerId), eq(mapLayers.mapId, mapId)));
  if (!l) throw new Error("That layer belongs to another map.");
}

const mapInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(5000).default(""),
  imageFileId: optUuid,
  parentMapId: optUuid,
  entityId: optUuid,
  width: z.number().int().min(1).max(50000).nullable().optional(),
  height: z.number().int().min(1).max(50000).nullable().optional(),
  scaleDistance: z.number().min(0).nullable().optional(),
  scaleUnit: z.string().max(20).default("miles"),
});

export async function saveMapAction(worldId: string, raw: z.input<typeof mapInput>, mapId?: string) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const input = mapInput.parse(raw);
    const db = await assertRefs(worldId, { entityId: input.entityId, mapIds: [input.parentMapId], fileId: input.imageFileId });
    if (mapId && input.parentMapId === mapId) throw new Error("A map can't be inside itself.");
    let width = input.width ?? null;
    let height = input.height ?? null;
    if (input.imageFileId && (!width || !height)) {
      const [f] = await db.select({ width: files.width, height: files.height }).from(files).where(eq(files.id, input.imageFileId));
      width = f?.width ?? 1600;
      height = f?.height ?? 1000;
    }
    const values = { ...input, imageFileId: input.imageFileId ?? null, parentMapId: input.parentMapId ?? null, entityId: input.entityId ?? null, width, height, scaleDistance: input.scaleDistance ?? null };
    let id = mapId;
    if (id) await db.update(maps).set(values).where(and(eq(maps.id, id), eq(maps.worldId, worldId)));
    else {
      const [m] = await db.insert(maps).values({ ...values, worldId }).returning();
      id = m!.id;
      await db.insert(mapLayers).values({ mapId: id, name: "Points of interest", position: 0 });
      await recordRevision(db, userActor(user.id), { worldId, targetKind: "map", targetId: id, targetLabel: input.name, action: "create", summary: `Added map "${input.name}"` });
    }
    refresh(worldId);
    return { id };
  }, "Map saved");
}

export async function deleteMapAction(worldId: string, mapId: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const { db } = await mapInWorld(worldId, mapId);
    await db.delete(maps).where(eq(maps.id, mapId));
    refresh(worldId);
    return null;
  });
}

const markerInput = z.object({
  label: z.string().trim().min(1).max(120),
  category: z.string().max(40).default("landmark"),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  entityId: optUuid,
  childMapId: optUuid,
  layerId: optUuid,
  color: z.string().max(20).nullable().optional(),
  description: z.string().max(5000).default(""),
  visibility: visibility.default("public"),
});

export async function saveMarkerAction(worldId: string, mapId: string, raw: z.input<typeof markerInput>, markerId?: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const input = markerInput.parse(raw);
    const { db } = await mapInWorld(worldId, mapId);
    await assertRefs(worldId, { entityId: input.entityId, mapIds: [input.childMapId] });
    await assertLayer(mapId, input.layerId);
    if (input.childMapId === mapId) throw new Error("A marker can't link to its own map.");
    const values = { ...input, entityId: input.entityId ?? null, childMapId: input.childMapId ?? null, layerId: input.layerId ?? null, color: input.color ?? null };
    let id = markerId;
    if (id) await db.update(mapMarkers).set(values).where(and(eq(mapMarkers.id, id), eq(mapMarkers.mapId, mapId)));
    else id = (await db.insert(mapMarkers).values({ ...values, mapId }).returning())[0]!.id;
    refresh(worldId);
    return { id };
  });
}

export async function moveMarkerAction(worldId: string, mapId: string, markerId: string, x: number, y: number) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const { db } = await mapInWorld(worldId, mapId);
    await db
      .update(mapMarkers)
      .set({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) })
      .where(and(eq(mapMarkers.id, markerId), eq(mapMarkers.mapId, mapId)));
    return null;
  });
}

export async function deleteMarkerAction(worldId: string, mapId: string, markerId: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const { db } = await mapInWorld(worldId, mapId);
    await db.delete(mapMarkers).where(and(eq(mapMarkers.id, markerId), eq(mapMarkers.mapId, mapId)));
    refresh(worldId);
    return null;
  });
}

const regionInput = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().max(20).default("#5bb3a4"),
  points: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).min(3).max(500),
  entityId: optUuid,
  layerId: optUuid,
  visibility: visibility.default("public"),
});

export async function saveRegionAction(worldId: string, mapId: string, raw: z.input<typeof regionInput>, regionId?: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const input = regionInput.parse(raw);
    const { db } = await mapInWorld(worldId, mapId);
    await assertRefs(worldId, { entityId: input.entityId });
    await assertLayer(mapId, input.layerId);
    const values = { ...input, entityId: input.entityId ?? null, layerId: input.layerId ?? null };
    let id = regionId;
    if (id) await db.update(mapRegions).set(values).where(and(eq(mapRegions.id, id), eq(mapRegions.mapId, mapId)));
    else id = (await db.insert(mapRegions).values({ ...values, mapId }).returning())[0]!.id;
    refresh(worldId);
    return { id };
  });
}

export async function deleteRegionAction(worldId: string, mapId: string, regionId: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const { db } = await mapInWorld(worldId, mapId);
    await db.delete(mapRegions).where(and(eq(mapRegions.id, regionId), eq(mapRegions.mapId, mapId)));
    refresh(worldId);
    return null;
  });
}

export async function saveLayerAction(worldId: string, mapId: string, name: string, layerId?: string, opts: { visibleByDefault?: boolean } = {}) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const { db } = await mapInWorld(worldId, mapId);
    const n = z.string().trim().min(1).max(60).parse(name);
    const visibleByDefault = z.boolean().optional().parse(opts.visibleByDefault);
    if (layerId) await db.update(mapLayers).set({ name: n, ...(visibleByDefault !== undefined && { visibleByDefault }) }).where(and(eq(mapLayers.id, layerId), eq(mapLayers.mapId, mapId)));
    else {
      const existing = await db.select().from(mapLayers).where(eq(mapLayers.mapId, mapId));
      await db.insert(mapLayers).values({ mapId, name: n, position: existing.length, visibleByDefault: visibleByDefault ?? true });
    }
    refresh(worldId);
    return null;
  });
}

export async function deleteLayerAction(worldId: string, mapId: string, layerId: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const { db } = await mapInWorld(worldId, mapId);
    await db.delete(mapLayers).where(and(eq(mapLayers.id, layerId), eq(mapLayers.mapId, mapId)));
    refresh(worldId);
    return null;
  });
}
