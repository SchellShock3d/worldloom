import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { mentions, revisions, randomTables } from "@/server/db/schema";
import { createEntity, updateEntity, listEntities, deleteEntity, getEntity } from "@/server/services/entities";
import { createRelationship, listRelationshipsFor, getGraph } from "@/server/services/relationships";
import { setupTestDb, setupWorld } from "./helpers";

let handle: Awaited<ReturnType<typeof setupTestDb>>;
let db: DB;

beforeAll(async () => {
  handle = await setupTestDb();
  db = handle.db;
});
afterAll(async () => handle.close());

describe("worlds", () => {
  it("creates a world with calendar, membership and starter tables", async () => {
    const { world } = await setupWorld(db);
    expect(world.calendarId).toBeTruthy();
    const tables = await db.select().from(randomTables).where(eq(randomTables.worldId, world.id));
    expect(tables.length).toBeGreaterThan(5);
  });
});

describe("entities", () => {
  it("creates, links via mentions, renames safely, and records history", async () => {
    const { world, actor } = await setupWorld(db);
    const city = await createEntity(db, world.id, actor, { type: "settlement", name: "Stonehaven", summary: "A walled river city." });
    const vael = await createEntity(db, world.id, actor, { type: "npc", name: "Lord Vael", locationId: city.id, fields: { occupation: "Regent", bogus: 1 } });
    expect(vael.fields).toEqual({ occupation: "Regent" });
    expect(vael.status).toBe("alive");

    const page = await createEntity(db, world.id, actor, { type: "lore", name: "The Regency", body: "Ruled by @Lord Vael from @Stonehaven since the fall." });
    expect(page.body).toContain(`(entity:${vael.id})`);
    expect(page.body).toContain(`(entity:${city.id})`);
    const ms = await db.select().from(mentions).where(eq(mentions.sourceId, page.id));
    expect(ms.map((m) => m.entityId).sort()).toEqual([vael.id, city.id].sort());

    const renamed = await updateEntity(db, world.id, actor, vael.id, { name: "Regent Vael" });
    expect(renamed.slug).toBe("regent-vael");
    const revs = await db.select().from(revisions).where(eq(revisions.targetId, vael.id));
    expect(revs.map((r) => r.action)).toEqual(["create", "update"]);

    const npcs = await listEntities(db, world.id, { types: ["npc"] });
    expect(npcs).toHaveLength(1);
    const fuzzy = await listEntities(db, world.id, { q: "Stonhaven" });
    expect(fuzzy.map((e) => e.name)).toContain("Stonehaven");
  });

  it("prevents location cycles and validates types", async () => {
    const { world, actor } = await setupWorld(db);
    const a = await createEntity(db, world.id, actor, { type: "region", name: "A" });
    const b = await createEntity(db, world.id, actor, { type: "settlement", name: "B", locationId: a.id });
    await expect(updateEntity(db, world.id, actor, a.id, { locationId: b.id })).rejects.toThrow(/inside itself/);
    await expect(createEntity(db, world.id, actor, { type: "nonsense", name: "X" })).rejects.toThrow(/Unknown entity type/);
    await expect(createEntity(db, world.id, actor, { type: "pc", name: "Hero" })).rejects.toThrow(/campaign/);
  });

  it("creates extension rows for quests, threads and events", async () => {
    const { world, actor } = await setupWorld(db);
    const q = await createEntity(db, world.id, actor, { type: "quest", name: "Find the crown", quest: { status: "active", priority: 1, rewards: "", prerequisites: "", consequences: "", playerKnowledge: "", objectives: [{ text: "Ask around", status: "open", hidden: false }] } });
    expect(q.type).toBe("quest");
    await expect(createEntity(db, world.id, actor, { type: "event", name: "No date" })).rejects.toThrow(/date/);
    const ev = await createEntity(db, world.id, actor, { type: "event", name: "The Fall", event: { startAt: 1000, kind: "historical", precision: "year", origin: "manual" } });
    expect(ev.id).toBeTruthy();
  });
});

describe("relationships", () => {
  it("creates directional and symmetric relationships and builds a graph", async () => {
    const { world, actor } = await setupWorld(db);
    const guild = await createEntity(db, world.id, actor, { type: "faction", name: "Thieves Guild" });
    const npc = await createEntity(db, world.id, actor, { type: "npc", name: "Mara" });
    const rival = await createEntity(db, world.id, actor, { type: "faction", name: "City Watch" });
    await createRelationship(db, world.id, actor, { sourceId: npc.id, targetId: guild.id, type: "member_of" });
    await createRelationship(db, world.id, actor, { sourceId: guild.id, targetId: rival.id, type: "enemy_of" });
    await expect(createRelationship(db, world.id, actor, { sourceId: rival.id, targetId: guild.id, type: "enemy_of" })).rejects.toThrow(/already exists/);
    const rels = await listRelationshipsFor(db, world.id, guild.id);
    expect(rels.find((r) => r.other.id === npc.id)?.label).toBe("has member");
    expect(rels.find((r) => r.other.id === rival.id)?.label).toBe("enemy of");
    const g = await getGraph(db, world.id, { focusId: npc.id, depth: 2 });
    expect(g.nodes).toHaveLength(3);
    await deleteEntity(db, world.id, actor, npc.id);
    expect(await getEntity(db, world.id, npc.id)).toBeNull();
    expect(await listRelationshipsFor(db, world.id, guild.id)).toHaveLength(1);
  });
});

describe("structured fields from text", () => {
  it("parses menus, ability scores and yes/no from plain text", async () => {
    const { getEntityType, sanitizeFields } = await import("@/lib/entity-types");
    const tavern = sanitizeFields(getEntityType("tavern"), { menu: "Mutton stew — 4 cp; Pickled eggs — 1 cp", quality: "Modest" });
    expect(tavern.menu).toEqual([
      { name: "Mutton stew", price: "4 cp", qty: "", notes: "" },
      { name: "Pickled eggs", price: "1 cp", qty: "", notes: "" },
    ]);
    const creature = sanitizeFields(getEntityType("creature"), { abilities: "STR 16, DEX 12, CON 14, INT 3, WIS 12, CHA 6" });
    expect(creature.abilities).toEqual({ str: 16, dex: 12, con: 14, int: 3, wis: 12, cha: 6 });
  });
});
