/**
 * Changing a world's calendar. In-world times are stored as absolute minutes,
 * so a structural change (month lengths, number of months, hours per day)
 * would silently move every date. By default we re-encode every stored time so
 * each event stays on the same named day, month and year.
 */
import { eq, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { rowsOf } from "@/server/db/client";
import { calendars, worlds } from "@/server/db/schema";
import { calendarDefinitionSchema, calendarProblems, daysInMonth, isStructuralChange, resolve, toAbsolute, type CalendarDefinition } from "@/lib/calendar";
import { recordRevision, type Actor } from "./history";

/** Same named date and time of day under the new calendar (clamped when a month got shorter). */
export function remapTime(from: CalendarDefinition, to: CalendarDefinition, t: number): number {
  const r = resolve(from, t);
  // Months are matched by name (so inserting or reordering months works), falling back to position (so renames work).
  const byName = to.months.findIndex((m) => m.name.trim().toLowerCase() === r.monthName.trim().toLowerCase());
  const month = byName >= 0 ? byName : Math.min(r.month, to.months.length - 1);
  const day = Math.min(r.day, daysInMonth(to, r.year, month));
  const hour = Math.min(r.hour, to.hoursPerDay - 1);
  const minute = Math.min(r.minute, to.minutesPerHour - 1);
  return toAbsolute(to, { year: r.year, month, day, hour, minute });
}

/** Every in-world time column, with how to find the rows that belong to a world. */
const TIME_COLUMNS: { table: string; key: string[]; cols: string[]; scope: string }[] = [
  { table: "worlds", key: ["id"], cols: ["current_at"], scope: "id = $W" },
  { table: "campaigns", key: ["id"], cols: ["current_at"], scope: "world_id = $W" },
  { table: "relationships", key: ["id"], cols: ["start_at", "end_at"], scope: "world_id = $W" },
  { table: "events", key: ["entity_id"], cols: ["start_at", "end_at"], scope: "entity_id in (select id from entities where world_id = $W)" },
  { table: "quests", key: ["entity_id"], cols: ["completed_at"], scope: "entity_id in (select id from entities where world_id = $W)" },
  { table: "world_threads", key: ["entity_id"], cols: ["next_milestone_at", "start_at", "last_advanced_at"], scope: "entity_id in (select id from entities where world_id = $W)" },
  { table: "thread_stages", key: ["id"], cols: ["reached_at"], scope: "thread_id in (select id from entities where world_id = $W)" },
  { table: "rumours", key: ["entity_id"], cols: ["started_at", "expires_at"], scope: "entity_id in (select id from entities where world_id = $W)" },
  { table: "facts", key: ["id"], cols: ["learned_at"], scope: "world_id = $W" },
  { table: "campaign_entity_states", key: ["campaign_id", "entity_id"], cols: ["discovered_at"], scope: "campaign_id in (select id from campaigns where world_id = $W)" },
  { table: "game_sessions", key: ["id"], cols: ["in_world_start_at", "in_world_end_at"], scope: "campaign_id in (select id from campaigns where world_id = $W)" },
  { table: "scenes", key: ["id"], cols: ["at_time"], scope: "campaign_id in (select id from campaigns where world_id = $W)" },
  { table: "clues", key: ["id"], cols: ["discovered_at"], scope: "world_id = $W" },
  { table: "consequences", key: ["id"], cols: ["due_at"], scope: "world_id = $W" },
  { table: "travel_plans", key: ["id"], cols: ["departed_at", "arrived_at"], scope: "world_id = $W" },
  { table: "proposal_batches", key: ["id"], cols: ["from_at", "to_at"], scope: "world_id = $W" },
];

export async function updateWorldCalendar(db: DB, worldId: string, actor: Actor, raw: unknown, opts: { keepDates: boolean }) {
  const next = calendarDefinitionSchema.parse(raw);
  const problems = calendarProblems(next);
  if (problems.length) throw new Error(problems[0]);
  const [w] = await db.select({ calendarId: worlds.calendarId, name: worlds.name }).from(worlds).where(eq(worlds.id, worldId));
  if (!w) throw new Error("World not found");
  const [current] = w.calendarId ? await db.select().from(calendars).where(eq(calendars.id, w.calendarId)) : [];
  const prev = current?.definition ?? null;
  let moved = 0;
  await db.transaction(async (tx) => {
    if (current) await tx.update(calendars).set({ definition: next }).where(eq(calendars.id, current.id));
    else {
      const [c] = await tx.insert(calendars).values({ worldId, name: "World calendar", definition: next }).returning();
      await tx.update(worlds).set({ calendarId: c!.id }).where(eq(worlds.id, worldId));
    }
    if (prev && opts.keepDates && isStructuralChange(prev, next)) {
      for (const spec of TIME_COLUMNS) {
        const [before, after] = spec.scope.split("$W");
        const cols = [...spec.key, ...spec.cols].map((c) => sql.identifier(c));
        const rows = rowsOf<Record<string, unknown>>(await tx.execute(sql`select ${sql.join(cols, sql`, `)} from ${sql.identifier(spec.table)} where ${sql.raw(before!)}${worldId}${sql.raw(after!)}`));
        for (const row of rows) {
          const sets = spec.cols
            .filter((c) => row[c] !== null && row[c] !== undefined)
            .map((c) => {
              const v = Number(row[c]);
              return { c, v, n: remapTime(prev, next, v) };
            })
            .filter((x) => x.n !== x.v);
          if (!sets.length) continue;
          moved++;
          const where = spec.key.map((k) => sql`${sql.identifier(k)} = ${row[k] as string}`);
          await tx.execute(sql`update ${sql.identifier(spec.table)} set ${sql.join(sets.map((x) => sql`${sql.identifier(x.c)} = ${x.n}`), sql`, `)} where ${sql.join(where, sql` and `)}`);
        }
      }
    }
    await recordRevision(tx, actor, {
      worldId,
      targetKind: "calendar",
      targetId: worldId,
      targetLabel: w.name,
      action: "update",
      summary: moved ? `Changed the calendar and kept ${moved} dated record${moved === 1 ? "" : "s"} on the same days` : "Changed the calendar",
      before: prev ? { definition: prev } : null,
      after: { definition: next },
    });
  });
  return { moved };
}
