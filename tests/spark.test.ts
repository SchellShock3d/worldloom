/**
 * The AI-led creator, offline: pitch, draft every section, steer one, and build the world.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, relationships, worlds, events, rumours } from "@/server/db/schema";
import { pitchWorlds, draftSection } from "@/server/ai/tasks/spark";
import { createWorldFromDraft, buildChangeSet } from "@/server/services/spark-world";
import { userActor } from "@/server/services/history";
import { listPeoples } from "@/server/services/peoples";
import { DEFAULT_DIALS, SECTIONS, describeDials, draftSoFar } from "@/lib/spark";
import type { DraftSections, SectionKey } from "@/lib/spark-schema";
import { setupTestDb, createTestUser } from "./helpers";

let handle: Awaited<ReturnType<typeof setupTestDb>>;
let db: DB;
beforeAll(async () => {
  handle = await setupTestDb();
  db = handle.db;
});
afterAll(async () => handle.close());

describe("AI-led world creator (offline engine)", () => {
  it("pitches, drafts every section, and builds a connected world", async () => {
    const dials = { ...DEFAULT_DIALS, tone: 1, scale: -1 };
    const { pitches, provider } = await pitchWorlds({ seed: "clockwork cities and dying gods", dials });
    expect(provider).toBe("offline");
    expect(pitches).toHaveLength(3);
    expect(new Set(pitches.map((p) => p.name)).size).toBe(3);
    expect(pitches[0]!.pitch).toContain("clockwork cities and dying gods");

    const blended = await pitchWorlds({ seed: "", dials, blend: [pitches[0]!, pitches[1]!] });
    expect(blended.pitches).toHaveLength(1);

    const pitch = pitches[1]!;
    const sections: DraftSections = {};
    for (const s of SECTIONS) {
      const { data } = await draftSection({ key: s.key, pitch, dials, sections, mode: "new" });
      (sections as Record<SectionKey, unknown>)[s.key] = data;
    }
    // Small-scale dial: fewer regions and nations.
    expect(sections.land!.regions).toHaveLength(3);
    expect(sections.powers!.nations).toHaveLength(2);
    expect(sections.peoples!.races.some((r) => r.core)).toBe(true);
    expect(sections.start!.npcs).toHaveLength(3);
    expect(draftSoFar(sections, "start")).toContain("# Powers");
    expect(describeDials(dials)).toContain("Hopeful ↔ Grim: leaning grim");

    // Steering a section keeps the shape.
    const steered = await draftSection({ key: "land", pitch, dials, sections: { overview: sections.overview }, previous: sections.land, notes: ["More islands and sea"], mode: "steer" });
    expect(steered.data.regions.length).toBeGreaterThan(0);

    const user = await createTestUser(db);
    const res = await createWorldFromDraft(db, { ...userActor(user.id), userId: user.id }, { seed: "clockwork", dials, pitch, sections: sections as Required<DraftSections> });
    expect(res.failed).toEqual([]);
    expect(res.applied).toBeGreaterThan(15);

    const [w] = await db.select().from(worlds).where(eq(worlds.id, res.worldId));
    expect(w!.name).toBe(sections.overview!.name);
    expect(w!.settings.profile?.vibe).toEqual(dials);
    expect(w!.settings.profile?.startingArea).toContain(sections.start!.settlement.name);

    const ents = await db.select().from(entities).where(eq(entities.worldId, res.worldId));
    const byType = (t: string) => ents.filter((e) => e.type === t);
    expect(byType("region")).toHaveLength(3);
    expect(byType("nation")).toHaveLength(2);
    expect(byType("npc")).toHaveLength(3);
    expect(byType("world_thread").length).toBeGreaterThanOrEqual(2);
    // Places nest: regions in landmasses, the town in its nation or region, the tavern in the town.
    const town = ents.find((e) => e.name === sections.start!.settlement.name)!;
    const tavern = ents.find((e) => e.name === sections.start!.tavern.name)!;
    expect(tavern.locationId).toBe(town.id);
    expect(town.locationId).not.toBeNull();
    for (const r of byType("region")) expect(r.locationId).not.toBeNull();
    // The town knows who lives there, and its NPCs have races from the draft.
    expect((town.fields as Record<string, string>).demographics).toMatch(/\d+%/);
    const raceNames = sections.peoples!.races.map((r) => r.name);
    for (const n of byType("npc")) expect(raceNames).toContain((n.fields as Record<string, string>).species);

    const { races, classes } = await listPeoples(db, res.worldId);
    expect(races.length).toBe(sections.peoples!.races.length);
    expect(classes.length).toBe(sections.peoples!.classes.length);

    expect((await db.select().from(relationships).where(eq(relationships.worldId, res.worldId))).length).toBeGreaterThan(3);
    expect((await db.select().from(events).innerJoin(entities, eq(entities.id, events.entityId)).where(eq(entities.worldId, res.worldId))).length).toBe(sections.history!.events.length);
    const rum = await db.select().from(rumours).innerJoin(entities, eq(entities.id, rumours.entityId)).where(and(eq(entities.worldId, res.worldId)));
    expect(rum.length).toBe(sections.start!.rumours.length);
  });

  it("matches names loosely but never guesses between two candidates", () => {
    const o = { name: "Test", logline: "", genre: "", tone: "", magicLevel: "Low", techLevel: "Medieval", overview: "", secret: "", themes: "", conflict: "", magicSources: [], magicAttitude: "", worldShape: "" };
    const land = { landmasses: [{ name: "Aldmere", summary: "" }], regions: [{ name: "The Ashen Reach", landmass: "aldmere", climate: "Arid" as const, terrain: "", summary: "", danger: "" }], landmarks: [] };
    const powers = {
      nations: [{ name: "The Cinder League", region: "Ashen Reach", government: "", ruler: "", demographics: "", summary: "" }],
      factions: [],
      religions: [{ name: "Church of Aurevane", summary: "", deities: [{ name: "Aurevane", domains: "", summary: "" }] }],
      ties: [],
    };
    const history = { events: [], threads: [{ name: "War", summary: "", stakes: "", drivers: ["Cinder League"], urgency: 3 }] };
    const start = { settlement: { name: "Cinderport", size: "Town" as const, within: "the cinder league", population: "", demographics: "", summary: "", features: "" }, tavern: { name: "The Gasket", summary: "", ambience: "" }, npcs: [], rumours: [], hook: "" };
    const cs = buildChangeSet(o, land, powers, history, start);
    const get = (name: string) => cs.newEntities.find((e) => e.name === name)!;
    expect(get("The Ashen Reach").location?.ref).toBe(get("Aldmere").ref);
    expect(get("The Cinder League").location?.ref).toBe(get("The Ashen Reach").ref);
    expect(get("Cinderport").location?.ref).toBe(get("The Cinder League").ref);
    // The deity is its own entry, worshipped by the church, not confused with it.
    expect(get("Aurevane").type).toBe("deity");
    expect(cs.relationships.find((r) => r.type === "worshipped_by")).toMatchObject({ source: { name: "Aurevane" }, target: { name: "Church of Aurevane" } });
    expect(cs.relationships.find((r) => r.type === "drives")).toMatchObject({ source: { name: "The Cinder League" }, target: { name: "War" } });
  });
});
