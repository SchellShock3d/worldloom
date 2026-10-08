/**
 * Lightweight weather: climate (from the nearest region/settlement field) +
 * season (from the calendar) + date seed → a stable description. The DM can
 * override it on the campaign (weatherLocked).
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities } from "@/server/db/schema";
import { resolve, type CalendarDefinition } from "@/lib/calendar";
import { WEATHER } from "@/server/ai/offline/banks";
import { Rng, hashSeed } from "@/server/ai/offline/rng";

const SEASON_ALIASES: Record<string, string> = { spring: "Spring", summer: "Summer", autumn: "Autumn", fall: "Autumn", winter: "Winter" };

export function weatherFor(calendar: CalendarDefinition, at: number, climate: string, seedKey = "") {
  const r = resolve(calendar, at);
  const season = SEASON_ALIASES[(r.season ?? "").toLowerCase()] ?? (["Winter", "Spring", "Summer", "Autumn"][Math.floor((r.month / calendar.months.length) * 4)] as string);
  const table = WEATHER[climate] ?? WEATHER.Temperate!;
  const options = table[season] ?? table.Spring ?? ["clear"];
  const rng = new Rng(hashSeed(seedKey, r.absoluteDay, Math.floor(r.hour / 8)));
  return { description: rng.pick(options), season, climate: WEATHER[climate] ? climate : "Temperate" };
}

/** Walk up the location chain to find a climate field. */
export async function climateAt(db: DB, worldId: string, locationId: string | null): Promise<string> {
  let current = locationId;
  for (let i = 0; current && i < 10; i++) {
    const [row] = await db.select({ fields: entities.fields, next: entities.locationId }).from(entities).where(and(eq(entities.id, current), eq(entities.worldId, worldId)));
    if (!row) break;
    const c = (row.fields as { climate?: string }).climate;
    if (c) return c;
    current = row.next;
  }
  return "Temperate";
}
