import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, files, maps, mapMarkers, relationships, worldMembers, worlds, campaigns, events } from "@/server/db/schema";
import { createDemoWorld } from "@/server/services/seed";
import { exportWorld, importWorld } from "@/server/services/portability";
import { extractMentionIds } from "@/lib/mentions";
import { setupTestDb, createTestUser } from "./helpers";

let handle: Awaited<ReturnType<typeof setupTestDb>>;
let db: DB;

beforeAll(async () => {
  handle = await setupTestDb();
  db = handle.db;
});
afterAll(async () => handle.close());

describe("export and import", () => {
  it("round-trips a whole world into a new, independent copy", async () => {
    const alice = await createTestUser(db);
    const bob = await createTestUser(db);
    const { worldId } = await createDemoWorld(db, alice.id);
    const dump = await exportWorld(db, worldId);
    expect(dump.tables.entities!.length).toBeGreaterThan(30);
    // survives JSON serialisation (dates become strings)
    const json = JSON.parse(JSON.stringify(dump));
    const res = await importWorld(db, bob.id, json, { name: "Copy of the Crown" });
    expect(res.worldId).not.toBe(worldId);
    expect(res.skipped).toBe(0);

    const [copy] = await db.select().from(worlds).where(eq(worlds.id, res.worldId));
    expect(copy?.name).toBe("Copy of the Crown");
    expect(copy?.createdBy).toBe(bob.id);
    expect(copy?.calendarId).toBeTruthy();
    const members = await db.select().from(worldMembers).where(eq(worldMembers.worldId, res.worldId));
    expect(members).toEqual([expect.objectContaining({ userId: bob.id, role: "owner" })]);

    const origNames = (await db.select({ name: entities.name }).from(entities).where(eq(entities.worldId, worldId))).map((e) => e.name).sort();
    const copyEntities = await db.select().from(entities).where(eq(entities.worldId, res.worldId));
    expect(copyEntities.map((e) => e.name).sort()).toEqual(origNames);
    const copyIds = new Set(copyEntities.map((e) => e.id));

    // Hierarchy and @mentions point at the copies, never at the original world.
    for (const e of copyEntities) {
      if (e.locationId) expect(copyIds.has(e.locationId)).toBe(true);
      for (const id of extractMentionIds(e.body)) expect(copyIds.has(id)).toBe(true);
    }
    const rels = await db.select().from(relationships).where(eq(relationships.worldId, res.worldId));
    expect(rels.length).toBe(dump.tables.relationships!.length);
    for (const r of rels) expect(copyIds.has(r.sourceId) && copyIds.has(r.targetId)).toBe(true);

    const [c] = await db.select().from(campaigns).where(eq(campaigns.worldId, res.worldId));
    expect(c?.currentLocationId && copyIds.has(c.currentLocationId)).toBe(true);
    const evs = await db.select().from(events).where(inArray(events.entityId, [...copyIds]));
    expect(evs.length).toBe(dump.tables.events!.length);

    // Maps and their files came along.
    const copyMaps = await db.select().from(maps).where(eq(maps.worldId, res.worldId));
    expect(copyMaps.length).toBe(dump.tables.maps!.length);
    const copyFiles = await db.select().from(files).where(eq(files.worldId, res.worldId));
    expect(copyFiles.length).toBe(dump.tables.files!.length);
    for (const m of copyMaps) if (m.imageFileId) expect(copyFiles.some((f) => f.id === m.imageFileId)).toBe(true);
    const markers = await db.select().from(mapMarkers).where(inArray(mapMarkers.mapId, copyMaps.map((m) => m.id)));
    expect(markers.length).toBe(dump.tables.map_markers!.length);

    // The original is untouched.
    expect((await db.select().from(entities).where(eq(entities.worldId, worldId))).length).toBe(origNames.length);
  });

  it("cannot be used to write into another world", async () => {
    const alice = await createTestUser(db);
    const mallory = await createTestUser(db);
    const { worldId: victim } = await createDemoWorld(db, alice.id);
    const [victimEntity] = await db.select().from(entities).where(eq(entities.worldId, victim)).limit(1);
    const before = (await db.select({ id: entities.id }).from(entities).where(eq(entities.worldId, victim))).length;

    const fakeWorld = "11111111-1111-4111-8111-111111111111";
    const fakeEntity = "22222222-2222-4222-8222-222222222222";
    const doc = {
      format: "worldloom-world",
      version: 1,
      tables: {
        worlds: [{ id: fakeWorld, name: "Trojan", createdBy: mallory.id, settings: {} }],
        // claims to belong to the victim's world
        entities: [{ id: fakeEntity, worldId: victim, type: "npc", name: "Intruder", slug: "intruder", fields: {}, aliases: [] }],
        // points at a real entity in the victim's world
        relationships: [{ id: "33333333-3333-4333-8333-333333333333", worldId: victim, sourceId: fakeEntity, targetId: victimEntity!.id, type: "related_to" }],
      },
    };
    const res = await importWorld(db, mallory.id, doc);
    expect((await db.select({ id: entities.id }).from(entities).where(eq(entities.worldId, victim))).length).toBe(before);
    const imported = await db.select().from(entities).where(eq(entities.worldId, res.worldId));
    expect(imported.map((e) => e.name)).toEqual(["Intruder"]);
    expect(await db.select().from(relationships).where(and(eq(relationships.worldId, res.worldId)))).toEqual([]);
    expect(await db.select().from(relationships).where(eq(relationships.targetId, victimEntity!.id)).then((r) => r.every((x) => x.worldId === victim))).toBe(true);
  });

  it("rejects files that aren't exports", async () => {
    const u = await createTestUser(db);
    await expect(importWorld(db, u.id, { hello: "world" })).rejects.toThrow(/isn't a Worldloom/);
  });
});
