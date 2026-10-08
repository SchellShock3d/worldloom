import { and, desc, eq, inArray, sql, count, max } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { calendars, campaigns, entities, randomTableEntries, randomTables, worldMembers, worlds, gameSessions } from "@/server/db/schema";
import { CALENDAR_PRESETS, DEFAULT_CALENDAR, toAbsolute, type CalendarDefinition } from "@/lib/calendar";
import { worldInput, worldSettingsInput, type WorldInput, parsePatch } from "@/lib/validation";
import { DEFAULT_RANDOM_TABLES } from "./default-tables";
import { recordRevision, type Actor } from "./history";

export async function createWorld(db: DB, actor: Actor & { userId: string }, raw: WorldInput) {
  const input = worldInput.parse(raw);
  const preset = (input.calendarPreset && CALENDAR_PRESETS[input.calendarPreset]) || null;
  const definition: CalendarDefinition = preset?.definition ?? DEFAULT_CALENDAR;
  const startYear = input.startYear ?? (input.calendarPreset === "gregorian" ? 1490 : 1000);
  const currentAt = toAbsolute(definition, { year: startYear, month: Math.min(2, definition.months.length - 1), day: 1, hour: 9 });

  return db.transaction(async (tx) => {
    const [world] = await tx
      .insert(worlds)
      .values({
        name: input.name,
        genre: input.genre,
        tone: input.tone,
        magicLevel: input.magicLevel,
        techLevel: input.techLevel,
        description: input.description,
        createdBy: actor.userId,
        currentAt,
        ...(input.profile ? { settings: { profile: input.profile } } : {}),
      })
      .returning();
    if (!world) throw new Error("World insert failed");
    const [cal] = await tx
      .insert(calendars)
      .values({ worldId: world.id, name: preset?.label ?? "World calendar", definition })
      .returning();
    await tx.update(worlds).set({ calendarId: cal!.id }).where(eq(worlds.id, world.id));
    await tx.insert(worldMembers).values({ worldId: world.id, userId: actor.userId, role: "owner" });

    for (const t of DEFAULT_RANDOM_TABLES) {
      const [table] = await tx
        .insert(randomTables)
        .values({ worldId: world.id, name: t.name, category: t.category, description: t.description })
        .returning({ id: randomTables.id });
      await tx.insert(randomTableEntries).values(
        t.entries.map((e, i) => ({
          tableId: table!.id,
          text: Array.isArray(e) ? e[0] : e,
          weight: Array.isArray(e) ? e[1] : 1,
          position: i,
        })),
      );
    }

    await recordRevision(tx, actor, {
      worldId: world.id,
      targetKind: "world",
      targetId: world.id,
      targetLabel: world.name,
      action: "create",
      summary: `Created world "${world.name}"`,
    });
    return { ...world, calendarId: cal!.id };
  });
}

export async function listWorldsForUser(db: DB, userId: string) {
  const rows = await db
    .select({
      id: worlds.id,
      name: worlds.name,
      genre: worlds.genre,
      tone: worlds.tone,
      description: worlds.description,
      updatedAt: worlds.updatedAt,
      role: worldMembers.role,
      currentAt: worlds.currentAt,
    })
    .from(worldMembers)
    .innerJoin(worlds, eq(worlds.id, worldMembers.worldId))
    .where(and(eq(worldMembers.userId, userId), sql`${worlds.archivedAt} is null`))
    .orderBy(desc(worlds.updatedAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const entityCounts = await db
    .select({ worldId: entities.worldId, n: count() })
    .from(entities)
    .where(inArray(entities.worldId, ids))
    .groupBy(entities.worldId);
  const campaignRows = await db
    .select({ worldId: campaigns.worldId, id: campaigns.id, name: campaigns.name, status: campaigns.status, updatedAt: campaigns.updatedAt })
    .from(campaigns)
    .where(inArray(campaigns.worldId, ids))
    .orderBy(desc(campaigns.updatedAt));
  return rows.map((r) => ({
    ...r,
    entityCount: entityCounts.find((e) => e.worldId === r.id)?.n ?? 0,
    campaigns: campaignRows.filter((c) => c.worldId === r.id),
  }));
}

export async function updateWorld(db: DB, actor: Actor, worldId: string, patch: Partial<WorldInput> & { settings?: Record<string, unknown> }) {
  const [before] = await db.select().from(worlds).where(eq(worlds.id, worldId));
  if (!before) throw new Error("World not found");
  const parsed = parsePatch(worldInput.partial(), patch);
  const values: Partial<typeof worlds.$inferInsert> = {};
  for (const k of ["name", "genre", "tone", "magicLevel", "techLevel", "description"] as const) {
    if (parsed[k] !== undefined) values[k] = parsed[k] as string;
  }
  if (patch.settings) values.settings = { ...before.settings, ...worldSettingsInput.parse(patch.settings) };
  const [after] = await db.update(worlds).set(values).where(eq(worlds.id, worldId)).returning();
  await recordRevision(db, actor, {
    worldId,
    targetKind: "world",
    targetId: worldId,
    targetLabel: after!.name,
    action: "update",
    summary: "Updated world settings",
    before: Object.fromEntries(Object.keys(values).map((k) => [k, (before as Record<string, unknown>)[k]])),
    after: values as Record<string, unknown>,
  });
  return after!;
}

export async function deleteWorld(db: DB, worldId: string) {
  await db.delete(worlds).where(eq(worlds.id, worldId));
}

export async function touchWorld(db: DB, worldId: string) {
  await db.update(worlds).set({ updatedAt: new Date() }).where(eq(worlds.id, worldId));
}

/** Most recent session across a user's worlds, for "Continue last session". */
export async function getLastSessionForUser(db: DB, userId: string) {
  const [row] = await db
    .select({
      sessionId: gameSessions.id,
      number: gameSessions.number,
      title: gameSessions.title,
      status: gameSessions.status,
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      worldId: worlds.id,
      worldName: worlds.name,
      updatedAt: gameSessions.updatedAt,
    })
    .from(gameSessions)
    .innerJoin(campaigns, eq(campaigns.id, gameSessions.campaignId))
    .innerJoin(worlds, eq(worlds.id, campaigns.worldId))
    // Players don't run sessions; the shortcut is for DMs and co-DMs.
    .innerJoin(worldMembers, and(eq(worldMembers.worldId, worlds.id), eq(worldMembers.userId, userId), inArray(worldMembers.role, ["owner", "editor"])))
    .orderBy(desc(gameSessions.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function getCalendar(db: DB, worldId: string): Promise<{ id: string | null; definition: CalendarDefinition }> {
  const [row] = await db
    .select({ id: calendars.id, definition: calendars.definition })
    .from(worlds)
    .leftJoin(calendars, eq(calendars.id, worlds.calendarId))
    .where(eq(worlds.id, worldId));
  return { id: row?.id ?? null, definition: row?.definition ?? DEFAULT_CALENDAR };
}

export async function worldStats(db: DB, worldId: string) {
  const [e] = await db.select({ n: count(), last: max(entities.updatedAt) }).from(entities).where(eq(entities.worldId, worldId));
  return { entityCount: e?.n ?? 0, lastEdited: e?.last ?? null };
}
