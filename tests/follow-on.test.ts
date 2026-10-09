/**
 * Follow-on changes: big changes are noticed, described, followed up once, and never in a loop.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, proposalBatches } from "@/server/db/schema";
import { createDemoWorld } from "@/server/services/seed";
import { updateEntity } from "@/server/services/entities";
import { setCampaignEntityState } from "@/server/services/campaigns";
import { userActor } from "@/server/services/history";
import { applyProposals, createBatch, getBatch } from "@/server/services/proposals";
import { describeChange, markFollowOnHandled, pendingFollowOns } from "@/server/services/follow-on";
import { followOnChanges } from "@/server/ai/tasks/follow-on";
import { setupTestDb, createTestUser } from "./helpers";

let handle: Awaited<ReturnType<typeof setupTestDb>>;
let db: DB;
beforeAll(async () => {
  handle = await setupTestDb();
  db = handle.db;
});
afterAll(async () => handle.close());

describe("follow-on changes", () => {
  it("describe changes plainly", () => {
    const places = [{ id: "a", name: "Highcourt" }, { id: "b", name: "Stonehaven" }];
    expect(describeChange("Lady Marr", "npc", { status: "alive" }, { status: "dead" }, places, null)).toBe("Lady Marr is now dead (was alive)");
    expect(describeChange("Lord Vael", "npc", { locationId: "a" }, { locationId: "b" }, places, "The Crown and the Ash")).toBe("Lord Vael moved to Stonehaven in The Crown and the Ash (from Highcourt)");
    expect(describeChange("Riverfall", "settlement", { canonStatus: "canon" }, { canonStatus: "archived" }, places, null)).toBe("Riverfall was removed from the world (archived)");
  });

  it("notice a death, propose what follows once, and don't follow up their own changes", async () => {
    const user = await createTestUser(db);
    const { worldId, campaignId } = await createDemoWorld(db, user.id);
    const actor = userActor(user.id);
    const [vael] = await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.name, "Lord Vael")));

    // Small edits aren't follow-on material.
    await updateEntity(db, worldId, actor, vael!.id, { summary: "Chancellor and regent; tired now." });
    expect(await pendingFollowOns(db, worldId, { entityId: vael!.id })).toEqual([]);

    await updateEntity(db, worldId, actor, vael!.id, { status: "dead" });
    const [change] = await pendingFollowOns(db, worldId, { entityId: vael!.id });
    expect(change!.description).toBe("Lord Vael is now dead (was alive)");
    expect(change!.touches.length).toBeGreaterThan(0);
    expect(change!.campaign).toBeNull();
    // It shows on the dashboard list too.
    expect((await pendingFollowOns(db, worldId)).some((c) => c.entity.id === vael!.id)).toBe(true);

    const res = await followOnChanges({ db, worldId, campaignId, userId: user.id, entityId: vael!.id, change: change!.description, campaignOnly: false });
    expect(res.provider).toBe("offline");
    expect(res.accepted).toBeGreaterThan(0);
    const [batch] = await db.select().from(proposalBatches).where(eq(proposalBatches.id, res.batchId));
    expect(batch!.source).toBe("follow_on");
    await markFollowOnHandled(db, worldId, change!.revisionId);
    expect(await pendingFollowOns(db, worldId, { entityId: vael!.id })).toEqual([]);

    // Approving follow-ons (here, one that imprisons Lady Marr) doesn't prompt more follow-ons.
    const [marr] = await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.name, "Lady Marr")));
    const { batch: fb } = await createBatch(db, { worldId, source: "follow_on", title: "Follow-on", summary: "", provider: "offline", createdBy: user.id }, [{ kind: "update_entity", rationale: "She's blamed.", payload: { target: { id: marr!.id, name: "Lady Marr" }, status: "imprisoned" } as never }]);
    const items = (await getBatch(db, worldId, fb.id))!.items;
    await applyProposals(db, worldId, fb.id, items.map((i) => i.id), user.id);
    const [m2] = await db.select().from(entities).where(eq(entities.id, marr!.id));
    expect(m2!.status).toBe("imprisoned");
    expect(await pendingFollowOns(db, worldId, { entityId: marr!.id })).toEqual([]);
  });

  it("notice campaign-only changes and keep them in the campaign", async () => {
    const user = await createTestUser(db);
    const { worldId, campaignId } = await createDemoWorld(db, user.id);
    const [marr] = await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.name, "Lady Marr")));
    await setCampaignEntityState(db, worldId, campaignId, userActor(user.id), { entityId: marr!.id, status: "missing" });
    const [change] = await pendingFollowOns(db, worldId, { entityId: marr!.id });
    expect(change!.campaign?.id).toBe(campaignId);
    expect(change!.description).toContain("Lady Marr is now missing in The Crown and the Ash");
  });
});

describe("what counts as a big change", () => {
  it("ignores first placements, ordinary first statuses, and changes from building content", async () => {
    const user = await createTestUser(db);
    const { worldId } = await createDemoWorld(db, user.id);
    const actor = userActor(user.id);
    const { createEntity } = await import("@/server/services/entities");
    const [town] = await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.name, "Stonehaven")));
    const npc = await createEntity(db, worldId, actor, { type: "npc", name: "Wenlow Tarn" });
    await updateEntity(db, worldId, actor, npc.id, { locationId: town!.id });
    await updateEntity(db, worldId, actor, npc.id, { status: "alive" });
    await createEntity(db, worldId, actor, { type: "npc", name: "Corin Marrowgate", locationId: town!.id });
    expect(await pendingFollowOns(db, worldId, { entityId: npc.id })).toEqual([]);
    // A real move is news (for someone with ties to others).
    const { createRelationship } = await import("@/server/services/relationships");
    const [marr] = await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.name, "Lady Marr")));
    await createRelationship(db, worldId, actor, { sourceId: npc.id, targetId: marr!.id, type: "serves", description: "" });
    const [riverfall] = await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.name, "Riverfall")));
    await updateEntity(db, worldId, actor, npc.id, { locationId: riverfall!.id });
    const [moved] = await pendingFollowOns(db, worldId, { entityId: npc.id });
    expect(moved!.description).toBe("Wenlow Tarn moved to Riverfall (from Stonehaven)");
  });
});
