import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { assertOwned } from "@/server/auth/ownership";
import { campaignEntityStates, campaigns, entities, scenes, worlds, type Campaign } from "@/server/db/schema";
import { campaignInput, campaignPatch, campaignStateInput, parsePatch, type CampaignInput, type CampaignPatchInput, type CampaignStateInput } from "@/lib/validation";
import { diffRecords, recordRevision, type Actor } from "./history";

export async function createCampaign(db: DB, worldId: string, actor: Actor, raw: CampaignInput): Promise<Campaign> {
  const input = campaignInput.parse(raw);
  const [world] = await db.select({ currentAt: worlds.currentAt }).from(worlds).where(eq(worlds.id, worldId));
  if (!world) throw new Error("World not found");
  if (input.startingLocationId) {
    const [loc] = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.id, input.startingLocationId), eq(entities.worldId, worldId)));
    if (!loc) throw new Error("Starting location not found");
  }
  const [row] = await db
    .insert(campaigns)
    .values({
      worldId,
      name: input.name,
      premise: input.premise,
      partyName: input.partyName || "The party",
      currentLocationId: input.startingLocationId ?? null,
      currentAt: world.currentAt,
      status: input.status ?? "active",
    })
    .returning();
  await recordRevision(db, actor, {
    worldId,
    campaignId: row!.id,
    targetKind: "campaign",
    targetId: row!.id,
    targetLabel: row!.name,
    action: "create",
    summary: `Started campaign "${row!.name}"`,
  });
  return row!;
}

export type CampaignPatch = CampaignPatchInput;

export async function updateCampaign(db: DB, worldId: string, actor: Actor, campaignId: string, raw: CampaignPatch) {
  const patch = parsePatch(campaignPatch, raw);
  if (!Object.keys(patch).length) throw new Error("Nothing to update");
  const [before] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.worldId, worldId)));
  if (!before) throw new Error("Campaign not found");
  if (patch.currentLocationId) {
    const [loc] = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.id, patch.currentLocationId), eq(entities.worldId, worldId)));
    if (!loc) throw new Error("Location not found");
  }
  if (patch.activeSceneId) {
    const [sc] = await db.select({ id: scenes.id }).from(scenes).where(and(eq(scenes.id, patch.activeSceneId), eq(scenes.campaignId, campaignId)));
    if (!sc) throw new Error("Scene not found in this campaign");
  }
  const [after] = await db.update(campaigns).set(patch).where(eq(campaigns.id, campaignId)).returning();
  const d = diffRecords(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, Object.keys(patch));
  // Notes edits are frequent; only log meaningful state changes.
  const meaningful = d.changed.filter((k) => !["dmNotes", "partyNotes", "partyInventory", "activeSceneId"].includes(k));
  if (meaningful.length)
    await recordRevision(db, actor, {
      worldId,
      campaignId,
      targetKind: "campaign",
      targetId: campaignId,
      targetLabel: after!.name,
      action: "update",
      summary: `Updated campaign (${meaningful.join(", ")})`,
      before: d.before,
      after: d.after,
    });
  return after!;
}

export async function deleteCampaign(db: DB, worldId: string, campaignId: string) {
  await db.delete(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.worldId, worldId)));
}

export async function listCampaigns(db: DB, worldId: string) {
  return db.select().from(campaigns).where(eq(campaigns.worldId, worldId)).orderBy(desc(campaigns.updatedAt));
}

// ---------------------------------------------------------------------------
// Campaign overlay: per-campaign state of world entities
// ---------------------------------------------------------------------------

export async function setCampaignEntityState(db: DB, worldId: string, campaignId: string, actor: Actor, raw: CampaignStateInput) {
  const input = campaignStateInput.parse(raw);
  const [ent] = await db.select({ id: entities.id, name: entities.name }).from(entities).where(and(eq(entities.id, input.entityId), eq(entities.worldId, worldId)));
  if (!ent) throw new Error("Entity not found");
  await assertOwned(db, worldId, { campaigns: [campaignId], entities: [input.locationId] });
  const [before] = await db
    .select()
    .from(campaignEntityStates)
    .where(and(eq(campaignEntityStates.campaignId, campaignId), eq(campaignEntityStates.entityId, input.entityId)));
  const values = {
    campaignId,
    entityId: input.entityId,
    ...(input.status !== undefined && { status: input.status }),
    ...(input.locationId !== undefined && { locationId: input.locationId }),
    ...(input.reputation !== undefined && { reputation: input.reputation }),
    ...(input.attitude !== undefined && { attitude: input.attitude }),
    ...(input.knowledge !== undefined && { knowledge: input.knowledge }),
    ...(input.notes !== undefined && { notes: input.notes }),
  };
  if (input.knowledge && input.knowledge !== "unknown" && before?.knowledge !== input.knowledge) {
    const [c] = await db.select({ currentAt: campaigns.currentAt }).from(campaigns).where(eq(campaigns.id, campaignId));
    Object.assign(values, { discoveredAt: c?.currentAt ?? null });
  }
  const { campaignId: _c, entityId: _e, ...updateSet } = values;
  const [after] = await db
    .insert(campaignEntityStates)
    .values(values)
    .onConflictDoUpdate({ target: [campaignEntityStates.campaignId, campaignEntityStates.entityId], set: { ...updateSet, updatedAt: new Date() } })
    .returning();
  const d = diffRecords((before ?? {}) as Record<string, unknown>, after as unknown as Record<string, unknown>, Object.keys(updateSet));
  if (d.changed.length)
    await recordRevision(db, actor, {
      worldId,
      campaignId,
      targetKind: "campaign_state",
      targetId: input.entityId,
      targetLabel: ent.name,
      action: "update",
      summary: `${ent.name} in this campaign: ${d.changed.join(", ")}`,
      before: d.before,
      after: d.after,
    });
  return after!;
}

export async function getCampaignEntityState(db: DB, campaignId: string, entityId: string) {
  const [row] = await db
    .select()
    .from(campaignEntityStates)
    .where(and(eq(campaignEntityStates.campaignId, campaignId), eq(campaignEntityStates.entityId, entityId)));
  return row ?? null;
}

export async function listCampaignStates(db: DB, campaignId: string, entityIds?: string[]) {
  return db
    .select()
    .from(campaignEntityStates)
    .where(and(eq(campaignEntityStates.campaignId, campaignId), entityIds?.length ? inArray(campaignEntityStates.entityId, entityIds) : undefined));
}

/** Faction (and other) standings with the party. */
export async function listReputations(db: DB, campaignId: string) {
  return db
    .select({ entityId: entities.id, name: entities.name, type: entities.type, reputation: campaignEntityStates.reputation, attitude: campaignEntityStates.attitude })
    .from(campaignEntityStates)
    .innerJoin(entities, eq(entities.id, campaignEntityStates.entityId))
    .where(and(eq(campaignEntityStates.campaignId, campaignId), sql`${campaignEntityStates.reputation} is not null`))
    .orderBy(desc(campaignEntityStates.reputation));
}

export async function listPartyMembers(db: DB, worldId: string, campaignId: string) {
  return db
    .select()
    .from(entities)
    .where(and(eq(entities.worldId, worldId), eq(entities.campaignId, campaignId), eq(entities.type, "pc")))
    .orderBy(asc(entities.name));
}

/**
 * Commit a campaign overlay to world canon: copies status/location from the
 * campaign state onto the base entity. This is the explicit "make it canon"
 * action — campaigns never silently rewrite the world.
 */
export async function commitStateToCanon(db: DB, worldId: string, campaignId: string, actor: Actor, entityId: string) {
  const state = await getCampaignEntityState(db, campaignId, entityId);
  if (!state) throw new Error("Nothing to commit");
  const [before] = await db.select().from(entities).where(and(eq(entities.id, entityId), eq(entities.worldId, worldId)));
  if (!before) throw new Error("Entity not found");
  const patch: Partial<typeof entities.$inferInsert> = {};
  if (state.status) patch.status = state.status;
  if (state.locationId) patch.locationId = state.locationId;
  if (!Object.keys(patch).length) return before;
  const [after] = await db.update(entities).set(patch).where(eq(entities.id, entityId)).returning();
  await db
    .update(campaignEntityStates)
    .set({ status: null, locationId: null })
    .where(and(eq(campaignEntityStates.campaignId, campaignId), eq(campaignEntityStates.entityId, entityId)));
  await recordRevision(db, actor, {
    worldId,
    campaignId,
    targetKind: "entity",
    targetId: entityId,
    targetLabel: before.name,
    action: "update",
    summary: "Committed campaign state to world canon",
    before: { status: before.status, locationId: before.locationId },
    after: { status: after!.status, locationId: after!.locationId },
  });
  return after!;
}
