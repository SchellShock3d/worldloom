/** Worlds must be sealed off from each other, even when someone knows another world's ids. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { campaigns, entities, proposals, scenes } from "@/server/db/schema";
import { createDemoWorld } from "@/server/services/seed";
import { createEntity } from "@/server/services/entities";
import { createCampaign, setCampaignEntityState } from "@/server/services/campaigns";
import { activateScene } from "@/server/services/sessions";
import { createClue, createConsequence } from "@/server/services/play";
import { createFact } from "@/server/services/knowledge";
import { createBatch, applyProposals } from "@/server/services/proposals";
import { setupTestDb, setupWorld, createTestUser } from "./helpers";

let handle: Awaited<ReturnType<typeof setupTestDb>>;
let db: DB;
beforeAll(async () => {
  handle = await setupTestDb();
  db = handle.db;
});
afterAll(async () => handle.close());

async function twoWorlds() {
  const victimUser = await createTestUser(db);
  const victim = await createDemoWorld(db, victimUser.id);
  const attacker = await setupWorld(db);
  const camp = await createCampaign(db, attacker.world.id, attacker.actor, { name: "Mine", premise: "" });
  const [secret] = await db.select().from(entities).where(and(eq(entities.worldId, victim.worldId), eq(entities.name, "Lord Vael")));
  const [victimScene] = await db.select().from(scenes).where(eq(scenes.campaignId, victim.campaignId)).limit(1);
  return { victim, attacker, camp, secret: secret!, victimScene };
}

describe("cross-world references are refused", () => {
  it("for entities, campaign overlays, clues, consequences and facts", async () => {
    const { victim, attacker, camp, secret } = await twoWorlds();
    const A = attacker.world.id;
    await expect(createEntity(db, A, attacker.actor, { type: "pc", name: "Spy", campaignId: victim.campaignId })).rejects.toThrow(/not found in this world/);
    await expect(createEntity(db, A, attacker.actor, { type: "npc", name: "Spy", locationId: secret.id })).rejects.toThrow();
    const mine = await createEntity(db, A, attacker.actor, { type: "npc", name: "Mine" });
    await expect(setCampaignEntityState(db, A, camp.id, attacker.actor, { entityId: mine.id, locationId: secret.id })).rejects.toThrow(/not found in this world/);
    await expect(createClue(db, A, camp.id, attacker.actor, { description: "x", mysteryId: secret.id })).rejects.toThrow(/not found in this world/);
    await expect(createClue(db, A, victim.campaignId, attacker.actor, { description: "x" })).rejects.toThrow(/not found in this world/);
    await expect(createConsequence(db, A, camp.id, attacker.actor, { title: "x", actorId: secret.id })).rejects.toThrow(/not found in this world/);
    await expect(createFact(db, A, attacker.actor, { statement: "x", subjectId: secret.id })).rejects.toThrow(/not found in this world/);
  });

  it("for activating another campaign's scene", async () => {
    const { attacker, camp, victimScene } = await twoWorlds();
    if (!victimScene) return;
    await expect(activateScene(db, camp.id, victimScene.id)).rejects.toThrow(/Scene not found/);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, camp.id));
    expect(c!.activeSceneId).toBeNull();
    void attacker;
  });
});

describe("proposals", () => {
  it("can't be applied twice, even concurrently", async () => {
    const { world, user } = await setupWorld(db);
    const batch = await createBatch(db, { worldId: world.id, source: "generate", title: "t", provider: "offline", createdBy: user.id }, [
      { kind: "create_entity", payload: { ref: "a", entity: { type: "npc", name: "Only Once" } }, rationale: "" },
    ]);
    const ids = (await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.batchId, batch.batch.id))).map((p) => p.id);
    await Promise.all([applyProposals(db, world.id, batch.batch.id, ids, user.id), applyProposals(db, world.id, batch.batch.id, ids, user.id)]);
    const made = await db.select().from(entities).where(and(eq(entities.worldId, world.id), eq(entities.name, "Only Once")));
    expect(made.length).toBe(1);
  });
});
