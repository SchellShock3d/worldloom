/**
 * The living world must behave like a world: the dead stay dead, weather
 * follows the clock, journeys pass through Advance World, fights end with the
 * session, and notes are read the way the DM wrote them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { campaigns, consequences, encounters, entities, travelPlans, worlds } from "@/server/db/schema";
import { createDemoWorld } from "@/server/services/seed";
import { advanceWorld, processSessionNotes } from "@/server/ai/tasks/world-tasks";
import { applyProposals, getBatch } from "@/server/services/proposals";
import { setCampaignEntityState, updateCampaign } from "@/server/services/campaigns";
import { setCampaignTime } from "@/server/services/clock";
import { createSession, endSession, startSession, updateSession } from "@/server/services/sessions";
import { continuityIssues } from "@/server/services/insights";
import { createEvent } from "@/server/services/timeline";
import { getCalendar } from "@/server/services/worlds";
import { climateAt, weatherFor } from "@/server/services/weather";
import { cleanLine } from "@/server/ai/offline/session";
import { needSomethingNow } from "@/server/ai/tasks/dm-tools";
import { buildNpcContext } from "@/server/ai/context";
import { durationToMinutes, minutesPerDay } from "@/lib/calendar";
import { toPlayerMarkdown } from "@/lib/mentions";
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
  const actor = { type: "user" as const, userId: user.id };
  const byName = async (name: string) => (await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.name, name))))[0]!;
  return { user, actor, worldId, campaignId, byName };
}

describe("session notes", () => {
  it("reads quick-log lines without mangling their time stamps", () => {
    expect(cleanLine("- **18:00** Bram punched Captain Varo")).toBe("Bram punched Captain Varo");
    expect(cleanLine("- [9:30 pm] The party left at dawn")).toBe("The party left at dawn");
    expect(cleanLine("1. Met Lady Marr")).toBe("Met Lady Marr");
    expect(cleanLine("3 bandits attacked the wagon")).toBe("3 bandits attacked the wagon");
  });
});

describe("offline session analysis", () => {
  it("notices grudges and newly accepted quests, even when notes drop titles", async () => {
    const { user, actor, worldId, campaignId } = await demo();
    const s = await createSession(db, worldId, campaignId, actor, { title: "Fallout" });
    await startSession(db, worldId, campaignId, actor, s.id);
    await updateSession(db, worldId, campaignId, s.id, { notes: "- **21:00** Varo now hates the party after the brawl.\nThe party accepted the Sun Crown quest from Lady Marr." });
    await endSession(db, worldId, campaignId, actor, s.id);
    const res = await processSessionNotes({ db, worldId, campaignId, userId: user.id, sessionId: s.id });
    const batch = (await getBatch(db, worldId, res.batchId))!;
    const varo = batch.items.find((i) => i.kind === "campaign_state" && JSON.stringify(i.payload).includes("Captain Varo"));
    expect((varo?.payload as { reputationDelta?: number } | undefined)?.reputationDelta).toBeLessThan(0);
    const quest = batch.items.find((i) => i.kind === "create_entity" && (i.payload as { entity: { type: string } }).entity.type === "quest");
    expect((quest?.payload as { entity: { name: string } } | undefined)?.entity.name).toBe("Sun Crown");
    expect(batch.items.some((i) => i.kind === "quest_update")).toBe(true);
    const recap = batch.items.find((i) => i.kind === "session_recap");
    expect(String((recap?.payload as { recap: string }).recap)).not.toContain(":00**");
  });
});

describe("the dead stay dead", () => {
  it("doesn't let a dead character carry out a consequence when time advances", async () => {
    const { user, actor, worldId, campaignId, byName } = await demo();
    const mara = await byName("Mara Thorne");
    await setCampaignEntityState(db, worldId, campaignId, actor, { entityId: mara.id, status: "dead" });
    const cal = (await getCalendar(db, worldId)).definition;
    const res = await advanceWorld({ db, worldId, campaignId, userId: user.id, minutes: durationToMinutes(cal, 7, "days") });
    const batch = (await getBatch(db, worldId, res.batchId))!;
    const [takeover] = await db.select().from(consequences).where(and(eq(consequences.worldId, worldId), eq(consequences.title, "Mara Thorne takes control of Grell's gang")));
    const update = batch.items.find((i) => i.kind === "consequence_update" && (i.payload as { consequenceId: string }).consequenceId === takeover!.id);
    expect((update?.payload as { status: string } | undefined)?.status).toBe("discarded");
    expect(batch.items.some((i) => i.kind === "create_event" && String((i.payload as { title: string }).title).includes("takes control of Grell"))).toBe(false);
  });

  it("flags a dead character taking part in a later event", async () => {
    const { actor, worldId, campaignId, byName } = await demo();
    const grell = await byName("Grell");
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect((await continuityIssues(db, worldId, campaignId, (await getCalendar(db, worldId)).definition)).filter((i) => i.kind === "dead_appears")).toEqual([]);
    await createEvent(db, worldId, actor, { title: "Grell leads a raid on the mill", kind: "campaign", startAt: c!.currentAt, involvedIds: [grell.id], campaignId, origin: "advance" });
    // A funeral is fine.
    await createEvent(db, worldId, actor, { title: "Grell's funeral pyre", kind: "campaign", startAt: c!.currentAt, involvedIds: [grell.id], campaignId, origin: "advance" });
    const issues = (await continuityIssues(db, worldId, campaignId, (await getCalendar(db, worldId)).definition)).filter((i) => i.kind === "dead_appears");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.detail).toContain("Grell leads a raid on the mill");
    expect(issues[0]!.detail).not.toContain("funeral");
  });
});

describe("weather and travel", () => {
  it("re-rolls the weather as time passes unless the DM locked it", async () => {
    const { actor, worldId, campaignId } = await demo();
    const cal = (await getCalendar(db, worldId)).definition;
    const [c0] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    await setCampaignTime(db, worldId, campaignId, actor, c0!.currentAt + minutesPerDay(cal));
    const [c1] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    const expected = weatherFor(cal, c1!.currentAt, await climateAt(db, worldId, c1!.currentLocationId), campaignId).description;
    expect(c1!.currentWeather).toBe(expected);

    await updateCampaign(db, worldId, actor, campaignId, { currentWeather: "A freak snowstorm", weatherLocked: true });
    await setCampaignTime(db, worldId, campaignId, actor, c1!.currentAt + 3 * minutesPerDay(cal));
    const [c2] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(c2!.currentWeather).toBe("A freak snowstorm");
  });

  it("completes a journey through Advance World: the party only arrives once the DM approves", async () => {
    const { user, worldId, campaignId, byName } = await demo();
    const riverfall = await byName("Riverfall");
    const cal = (await getCalendar(db, worldId)).definition;
    const [c0] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    const [trip] = await db
      .insert(travelPlans)
      .values({ worldId, campaignId, name: "Up the Northroad", destinationId: riverfall.id, status: "underway", departedAt: c0!.currentAt, estimatedMinutes: durationToMinutes(cal, 2, "days") })
      .returning();
    const res = await advanceWorld({ db, worldId, campaignId, userId: user.id, minutes: durationToMinutes(cal, 3, "days") });
    const batch = (await getBatch(db, worldId, res.batchId))!;
    const clock = batch.items.find((i) => i.kind === "advance_clock")!;
    expect((clock.payload as { arrivals?: { travelId: string }[] }).arrivals?.map((a) => a.travelId)).toEqual([trip!.id]);
    expect((await db.select().from(travelPlans).where(eq(travelPlans.id, trip!.id)))[0]!.status).toBe("underway");

    await applyProposals(db, worldId, res.batchId, [clock.id], user.id);
    const [after] = await db.select().from(travelPlans).where(eq(travelPlans.id, trip!.id));
    expect(after!.status).toBe("arrived");
    const [c1] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(c1!.currentLocationId).toBe(riverfall.id);
    expect(c1!.currentAt).toBe(c0!.currentAt + durationToMinutes(cal, 3, "days"));
  });
});

describe("advancing a world without a campaign", () => {
  it("proposes world developments and moves only the world clock once approved", async () => {
    const { user, worldId, campaignId } = await demo();
    const cal = (await getCalendar(db, worldId)).definition;
    const [w0] = await db.select().from(worlds).where(eq(worlds.id, worldId));
    const [c0] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    const res = await advanceWorld({ db, worldId, campaignId: null, userId: user.id, minutes: durationToMinutes(cal, 14, "days") });
    const batch = (await getBatch(db, worldId, res.batchId))!;
    expect(batch.items.some((i) => i.kind === "update_thread")).toBe(true);
    expect(batch.items.some((i) => i.kind === "consequence_update")).toBe(false);
    await applyProposals(db, worldId, res.batchId, batch.items.map((i) => i.id), user.id);
    const [w1] = await db.select().from(worlds).where(eq(worlds.id, worldId));
    const [c1] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(w1!.currentAt).toBe(w0!.currentAt + durationToMinutes(cal, 14, "days"));
    expect(c1!.currentAt).toBe(c0!.currentAt);
  });
});

describe("play", () => {
  it("ends any running fight when the session ends", async () => {
    const { actor, worldId, campaignId } = await demo();
    const [fight] = await db.insert(encounters).values({ worldId, campaignId, name: "Ambush at the ford", status: "active", round: 3 }).returning();
    const s = await createSession(db, worldId, campaignId, actor, { title: "Session" });
    await startSession(db, worldId, campaignId, actor, s.id);
    await endSession(db, worldId, campaignId, actor, s.id);
    expect((await db.select().from(encounters).where(eq(encounters.id, fight!.id)))[0]!.status).toBe("completed");
  });

  it("keeps an improvised NPC's secret out of what players see", async () => {
    const { worldId, campaignId } = await demo();
    const npc = await needSomethingNow(db, { worldId, campaignId, kind: "npc" });
    expect(npc.text).toContain("Secret");
    expect(toPlayerMarkdown(npc.text)).not.toContain("Secret");
  });

  it("gives clean offline roleplay notes built from what the character knows", async () => {
    const { worldId, campaignId, byName } = await demo();
    const varo = await byName("Captain Varo");
    const ctx = await buildNpcContext(db, worldId, varo.id, campaignId);
    expect(ctx.knows.some((k) => k.includes("official story doesn't add up"))).toBe(true);
    expect(ctx.knows.join(" ")).not.toMatch(/\{id:/);
  });
});
