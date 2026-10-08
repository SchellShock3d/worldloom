import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { campaigns, worlds } from "@/server/db/schema";
import { minutesPerDay } from "@/lib/calendar";
import { recordRevision, type Actor } from "./history";
import { getCalendar } from "./worlds";
import { climateAt, weatherFor } from "./weather";

/** Move a campaign's clock. The world clock follows the furthest campaign. */
export async function setCampaignTime(db: DB, worldId: string, campaignId: string, actor: Actor, toAt: number, summary?: string) {
  const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.worldId, worldId)));
  if (!c) throw new Error("Campaign not found");
  // Weather follows the clock (new day or a new third of the day) unless the DM locked it.
  let weather: string | undefined;
  if (!c.weatherLocked) {
    const { definition: calendar } = await getCalendar(db, worldId);
    const block = (at: number) => Math.floor(at / (minutesPerDay(calendar) / 3));
    if (block(toAt) !== block(c.currentAt) || !c.currentWeather) {
      weather = weatherFor(calendar, toAt, await climateAt(db, worldId, c.currentLocationId), campaignId).description;
    }
  }
  await db.update(campaigns).set({ currentAt: toAt, ...(weather !== undefined && { currentWeather: weather }) }).where(eq(campaigns.id, campaignId));
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
    before: { currentAt: c.currentAt, ...(weather !== undefined && { weather: c.currentWeather }) },
    after: { currentAt: toAt, ...(weather !== undefined && { weather }) },
  });
  return { fromAt: c.currentAt, toAt, weather: weather ?? c.currentWeather };
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
