/**
 * Critical flows from the brief: the world has state, AI only proposes, and
 * only approved proposals change canon.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { campaigns, entities, events, gameSessions, proposals, revisions, worldThreads } from "@/server/db/schema";
import { createDemoWorld } from "@/server/services/seed";
import { advanceWorld, processSessionNotes } from "@/server/ai/tasks/world-tasks";
import { applyProposals, getBatch, rejectProposals } from "@/server/services/proposals";
import { createSession, endSession, startSession, updateSession } from "@/server/services/sessions";
import { searchWorld } from "@/server/services/search";
import { buildNpcContext } from "@/server/ai/context";
import { updateWorldCalendar } from "@/server/services/calendar-edit";
import { getCalendar } from "@/server/services/worlds";
import { listTimeline } from "@/server/services/timeline";
import { CALENDAR_PRESETS, durationToMinutes, formatDate, resolve, toAbsolute, type CalendarDefinition } from "@/lib/calendar";
import { setupTestDb, createTestUser } from "./helpers";

let handle: Awaited<ReturnType<typeof setupTestDb>>;
let db: DB;

beforeAll(async () => {
  handle = await setupTestDb();
  db = handle.db;
});
afterAll(async () => handle.close());

async function demo() {
  const user = await createTestUser(db);
  const { worldId, campaignId } = await createDemoWorld(db, user.id);
  return { user, worldId, campaignId };
}

describe("calendar", () => {
  const wheel = CALENDAR_PRESETS.wheel!.definition;
  const greg = CALENDAR_PRESETS.gregorian!.definition;

  it("round-trips dates, festival days and leap years", () => {
    for (const parts of [
      { year: 1012, month: 5, day: 14, hour: 18, minute: 30 },
      { year: 1, month: 0, day: 1, hour: 0, minute: 0 },
      { year: 1012, month: 12, day: 3, hour: 9, minute: 0 }, // Yearturn festival day
    ]) {
      const r = resolve(wheel, toAbsolute(wheel, parts));
      expect({ year: r.year, month: r.month, day: r.day, hour: r.hour, minute: r.minute }).toEqual(parts);
    }
    expect(resolve(wheel, toAbsolute(wheel, { year: 1012, month: 12, day: 3 })).weekday).toBeNull();
    // Leap day in the Gregorian preset
    expect(resolve(greg, toAbsolute(greg, { year: 2024, month: 1, day: 29 })).day).toBe(29);
    expect(resolve(greg, toAbsolute(greg, { year: 2023, month: 1, day: 28 }) + durationToMinutes(greg, 1, "days")).month).toBe(2);
    expect(formatDate(wheel, toAbsolute(wheel, { year: 1012, month: 5, day: 14 }))).toBe("14 Highsun, 1012 AE");
  });

  it("keeps events on the same named dates when the calendar's structure changes", async () => {
    const { user, worldId } = await demo();
    const before = (await getCalendar(db, worldId)).definition;
    const [death] = (await listTimeline(db, worldId, { limit: 500 })).filter((e) => e.name === "The death of Prince Edric");
    const label = formatDate(before, death!.startAt);
    // Insert a new month near the start of the year: every later date would shift without remapping.
    const next: CalendarDefinition = { ...before, months: [before.months[0]!, { name: "Icewane", days: 20 }, ...before.months.slice(1)] };
    next.seasons = before.seasons.map((s) => ({ ...s, startMonth: s.startMonth + 1 }));
    next.holidays = before.holidays.map((h) => ({ ...h, month: h.month + 1 }));
    const res = await updateWorldCalendar(db, worldId, { type: "user", userId: user.id }, next, { keepDates: true });
    expect(res.moved).toBeGreaterThan(5);
    const after = (await getCalendar(db, worldId)).definition;
    const [moved] = await db.select().from(events).where(eq(events.entityId, death!.id));
    expect(formatDate(after, moved!.startAt)).toBe(label);
  });
});

describe("living world", () => {
  it("advancing time only proposes; approving applies the changes and records who approved", async () => {
    const { user, worldId, campaignId } = await demo();
    const [c0] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    const threads0 = await db.select().from(worldThreads).innerJoin(entities, eq(entities.id, worldThreads.entityId)).where(eq(entities.worldId, worldId));
    const entityCount0 = (await db.select({ id: entities.id }).from(entities).where(eq(entities.worldId, worldId))).length;

    const week = durationToMinutes((await getCalendar(db, worldId)).definition, 7, "days");
    const res = await advanceWorld({ db, worldId, campaignId, userId: user.id, minutes: week });
    expect(res.accepted).toBeGreaterThan(2);

    // Nothing has changed yet.
    const [c1] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(c1!.currentAt).toBe(c0!.currentAt);
    expect((await db.select({ id: entities.id }).from(entities).where(eq(entities.worldId, worldId))).length).toBe(entityCount0);
    const threads1 = await db.select().from(worldThreads).innerJoin(entities, eq(entities.id, worldThreads.entityId)).where(eq(entities.worldId, worldId));
    expect(threads1.map((t) => t.world_threads.progress)).toEqual(threads0.map((t) => t.world_threads.progress));

    // Reject one, approve the rest.
    const batch = (await getBatch(db, worldId, res.batchId))!;
    const kinds = batch.items.map((i) => i.kind);
    expect(kinds).toContain("advance_clock");
    const rejectMe = batch.items.find((i) => i.kind === "create_rumour") ?? batch.items.find((i) => i.kind !== "advance_clock")!;
    await rejectProposals(db, worldId, res.batchId, [rejectMe.id]);
    const approve = batch.items.filter((i) => i.id !== rejectMe.id).map((i) => i.id);
    const applied = await applyProposals(db, worldId, res.batchId, approve, user.id);
    expect(applied.failed).toEqual([]);
    expect(applied.applied).toBe(approve.length);

    const [c2] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(c2!.currentAt).toBe(c0!.currentAt + week);
    const threads2 = await db.select().from(worldThreads).innerJoin(entities, eq(entities.id, worldThreads.entityId)).where(eq(entities.worldId, worldId));
    expect(threads2.some((t) => t.world_threads.progress > (threads0.find((x) => x.entities.id === t.entities.id)?.world_threads.progress ?? 0))).toBe(true);

    const [rejected] = await db.select().from(proposals).where(eq(proposals.id, rejectMe.id));
    expect(rejected!.status).toBe("rejected");
    // Applied changes are attributed to the AI and the approving DM.
    const aiRevs = await db.select().from(revisions).where(and(eq(revisions.worldId, worldId), eq(revisions.actorType, "ai")));
    expect(aiRevs.length).toBeGreaterThan(0);
    expect(aiRevs.every((r) => r.actorUserId === user.id && r.proposalId)).toBe(true);
  });

  it("runs a session, records notes, and turns them into reviewable proposals", async () => {
    const { user, worldId, campaignId } = await demo();
    const actor = { type: "user" as const, userId: user.id };
    const s = await createSession(db, worldId, campaignId, actor, { title: "Into Stonehaven" });
    await startSession(db, worldId, campaignId, actor, s.id);
    await updateSession(db, worldId, campaignId, s.id, {
      notes: "The party met Lady Marr at the Drowned Lantern. She showed them the prince's signet ring.\nBram picked a fight with a Black Hand cutthroat and won.\nThey promised to escort Sister Wenna to Riverfall.",
    });
    await endSession(db, worldId, campaignId, actor, s.id);
    const res = await processSessionNotes({ db, worldId, campaignId, userId: user.id, sessionId: s.id });
    expect(res.accepted).toBeGreaterThan(0);
    const batch = (await getBatch(db, worldId, res.batchId))!;
    expect(batch.items.map((i) => i.kind)).toContain("session_recap");
    const [before] = await db.select().from(gameSessions).where(eq(gameSessions.id, s.id));
    expect(before!.recap).toBe("");
    await applyProposals(db, worldId, res.batchId, batch.items.filter((i) => i.kind === "session_recap").map((i) => i.id), user.id);
    const [after] = await db.select().from(gameSessions).where(eq(gameSessions.id, s.id));
    expect(after!.recap.length).toBeGreaterThan(20);
  });
});

describe("search and knowledge", () => {
  it("finds entities by name, typo and content", async () => {
    const { worldId } = await demo();
    expect((await searchWorld(db, worldId, "Vael")).some((r) => r.title === "Lord Vael")).toBe(true);
    expect((await searchWorld(db, worldId, "Greywatsh")).some((r) => r.title === "Fort Greywatch")).toBe(true);
    expect((await searchWorld(db, worldId, "nightshade", { kinds: ["entity"] })).length).toBeGreaterThan(0);
  });

  it("limits an NPC's roleplay context to what they know", async () => {
    const { worldId, campaignId } = await demo();
    const [hollis] = await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.name, "Hollis Pell")));
    const ctx = await buildNpcContext(db, worldId, hollis!.id, campaignId);
    expect(ctx.text).toContain("The northern rebels killed the prince.");
    expect(ctx.text).toContain("may not be true");
    expect(ctx.text).not.toMatch(/nightshade/i);
    expect(ctx.text).not.toMatch(/funding the Cult/i);
  });
});

describe("integrity", () => {
  it("keeps the demo world internally consistent", async () => {
    const { worldId } = await demo();
    const orphans = await db.execute(sql`select count(*)::int as n from entities e where e.world_id = ${worldId} and e.location_id is not null and not exists (select 1 from entities p where p.id = e.location_id and p.world_id = ${worldId})`);
    const n = (Array.isArray(orphans) ? orphans : (orphans as { rows: { n: number }[] }).rows)[0] as { n: number };
    expect(n.n).toBe(0);
    const evs = await db.select({ id: events.entityId }).from(events).innerJoin(entities, eq(entities.id, events.entityId)).where(inArray(entities.worldId, [worldId]));
    expect(evs.length).toBeGreaterThan(5);
  });
});
