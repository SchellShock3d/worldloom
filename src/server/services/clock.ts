import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { campaigns, worlds } from "@/server/db/schema";
import { recordRevision, type Actor } from "./history";

/** Move a campaign's clock. The world clock follows the furthest campaign. */
export async function setCampaignTime(db: DB, worldId: string, campaignId: string, actor: Actor, toAt: number, summary?: string) {
  const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.worldId, worldId)));
  if (!c) throw new Error("Campaign not found");
  await db.update(campaigns).set({ currentAt: toAt }).where(eq(campaigns.id, campaignId));
  await db
    .update(worlds)
    .set({ currentAt: sql`greatest(${worlds.currentAt}, ${toAt})` })
    .where(eq(worlds.id, worldId));
  await recordRevision(db, actor, {
    worldId,
    campaignId,
    targetKind: "clock",
    targetId: campaignId,
    targetLabel: c.name,
    action: "advance",
    summary: summary ?? "Time advanced",
    before: { currentAt: c.currentAt },
    after: { currentAt: toAt },
  });
  return { fromAt: c.currentAt, toAt };
}

export async function setWorldTime(db: DB, worldId: string, actor: Actor, toAt: number) {
  const [w] = await db.select({ currentAt: worlds.currentAt, name: worlds.name }).from(worlds).where(eq(worlds.id, worldId));
  if (!w) throw new Error("World not found");
  await db.update(worlds).set({ currentAt: toAt }).where(eq(worlds.id, worldId));
  await recordRevision(db, actor, {
    worldId,
    targetKind: "clock",
    targetId: worldId,
    targetLabel: w.name,
    action: "advance",
    summary: "World clock set",
    before: { currentAt: w.currentAt },
    after: { currentAt: toAt },
  });
}
