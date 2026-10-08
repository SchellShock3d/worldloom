import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { campaigns, quests, worlds } from "@/server/db/schema";
import { createEntity, getEntityTags, updateEntity } from "@/server/services/entities";
import { createCampaign, updateCampaign } from "@/server/services/campaigns";
import { updateWorld } from "@/server/services/worlds";
import { onlySent } from "@/lib/validation";
import { setupTestDb, setupWorld } from "./helpers";

let handle: Awaited<ReturnType<typeof setupTestDb>>;
let db: DB;

beforeAll(async () => {
  handle = await setupTestDb();
  db = handle.db;
});
afterAll(async () => handle.close());

describe("partial updates", () => {
  it("only strips keys that were not sent", () => {
    expect(onlySent({ a: 1, b: "default", c: { x: 1, y: "d" } }, { a: 1, c: { x: 1 } })).toEqual({ a: 1, c: { x: 1 } });
    expect(onlySent({ list: [{ a: 1, b: 2 }] }, { list: [{ a: 1 }] })).toEqual({ list: [{ a: 1, b: 2 }] });
  });

  it("does not reset untouched entity fields to their defaults", async () => {
    const { world, actor } = await setupWorld(db);
    const npc = await createEntity(db, world.id, actor, { type: "npc", name: "Lord Vael", summary: "Regent with a secret", visibility: "public", importance: 2, tags: ["noble"], aliases: ["The Regent"] });
    const after = await updateEntity(db, world.id, actor, npc.id, { status: "missing" });
    expect(after.status).toBe("missing");
    expect(after.summary).toBe("Regent with a secret");
    expect(after.visibility).toBe("public");
    expect(after.importance).toBe(2);
    expect(after.aliases).toEqual(["The Regent"]);
    expect((await getEntityTags(db, npc.id)).map((t) => t.name)).toEqual(["noble"]);
  });

  it("does not reset extension fields on a partial extension patch", async () => {
    const { world, actor } = await setupWorld(db);
    const q = await createEntity(db, world.id, actor, { type: "quest", name: "Who killed the prince?", quest: { status: "active", priority: 3, rewards: "Patronage" } });
    await updateEntity(db, world.id, actor, q.id, { quest: { priority: 2 } });
    const [row] = await db.select().from(quests).where(eq(quests.entityId, q.id));
    expect(row?.priority).toBe(2);
    expect(row?.status).toBe("active");
    expect(row?.rewards).toBe("Patronage");
  });

  it("keeps world settings that were not part of the update", async () => {
    const { world, actor } = await setupWorld(db);
    await updateWorld(db, actor, world.id, { genre: "Grimdark", tone: "Bleak" });
    await updateWorld(db, actor, world.id, { settings: { aiEnabled: false } });
    const [w] = await db.select().from(worlds).where(eq(worlds.id, world.id));
    expect(w?.genre).toBe("Grimdark");
    expect(w?.tone).toBe("Bleak");
  });

  it("validates campaign patches and ignores fields that can't be patched", async () => {
    const { world, actor } = await setupWorld(db);
    const other = await setupWorld(db);
    const c = await createCampaign(db, world.id, actor, { name: "The Crown and the Ash", premise: "" });
    await updateCampaign(db, world.id, actor, c.id, { partyFunds: "214 gp" });
    // worldId is not patchable: it is stripped, leaving nothing to update.
    await expect(updateCampaign(db, world.id, actor, c.id, { worldId: other.world.id } as never)).rejects.toThrow(/Nothing to update/);
    await expect(updateCampaign(db, world.id, actor, c.id, { status: "exploded" } as never)).rejects.toThrow();
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, c.id));
    expect(row?.worldId).toBe(world.id);
    expect(row?.partyFunds).toBe("214 gp");
    expect(row?.name).toBe("The Crown and the Ash");
  });
});
