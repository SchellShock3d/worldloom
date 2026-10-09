/**
 * Build out (offline engine): plans, drafting every section of a town, steering one, and adding
 * the result to the world without duplicating what's already there.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, relationships, rumours } from "@/server/db/schema";
import { createDemoWorld } from "@/server/services/seed";
import { draftBuildSection } from "@/server/ai/tasks/build-out";
import { applyBuildOut, entryType, orientLink, surroundings } from "@/server/services/build-out";
import { BUILD_PLANS, emptyFieldFills, planFor, sectionsIn, type BuildSectionData } from "@/lib/build-out";
import { setupTestDb, createTestUser } from "./helpers";

let handle: Awaited<ReturnType<typeof setupTestDb>>;
let db: DB;
beforeAll(async () => {
  handle = await setupTestDb();
  db = handle.db;
});
afterAll(async () => handle.close());

describe("build-out plans", () => {
  it("fit the kind of entry, and drop dependencies the DM left out", () => {
    expect(planFor("settlement").key).toBe("settlement");
    expect(planFor("continent").key).toBe("region");
    expect(planFor("npc").key).toBe("person");
    expect(planFor("magic_item").key).toBe("general");
    for (const p of Object.values(BUILD_PLANS)) {
      expect(p.sections[0]!.key).toBe("about");
      const keys = p.sections.map((s) => s.key);
      for (const s of p.sections) for (const d of s.depends) expect(keys.indexOf(d)).toBeLessThan(keys.indexOf(s.key));
    }
    // Without "power", the town's people are written straight from the basics.
    const people = sectionsIn(planFor("settlement"), ["about", "people"]).find((s) => s.key === "people")!;
    expect(people.depends).toEqual(["about"]);
    // Without the basics either, they're written straight away.
    expect(sectionsIn(planFor("settlement"), ["people"])[0]!.depends).toEqual([]);
  });

  it("only fill fields that are empty", () => {
    const fills = emptyFieldFills(
      [
        { key: "population", value: "12,000" },
        { key: "government", value: "A theocracy" },
        { key: "nonsense", value: "x" },
        { key: "economy", value: "" },
      ],
      { government: "Merchant council" },
      ["population", "government", "economy"],
    );
    expect(fills).toEqual([{ key: "population", value: "12,000" }]);
  });

  it("map loose type names onto real entry types", () => {
    expect(entryType("district")).toBe("location");
    expect(entryType("Magic item")).toBe("magic_item");
    expect(entryType("quest")).toBeNull(); // campaign-only; not built out
    expect(entryType("blorp")).toBeNull();
  });

  it("flip reversed links so they read the right way", () => {
    expect(orientLink("owned_by")).toEqual({ type: "owns", flip: true });
    expect(orientLink("Led by")).toEqual({ type: "leads", flip: true });
    expect(orientLink("child_of")).toEqual({ type: "parent_of", flip: true });
    expect(orientLink("rival_of")).toEqual({ type: "rival_of", flip: false });
    expect(orientLink("sworn_to")).toEqual({ type: "sworn_to", flip: false });
  });
});

describe("building out a town", () => {
  it("drafts each section, steers one, and adds it all around what's already there", async () => {
    const user = await createTestUser(db);
    const { worldId } = await createDemoWorld(db, user.id);
    const [town] = await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.name, "Stonehaven")));
    const around = await surroundings(db, worldId, town!);
    expect(around.map((a) => a.name)).toContain("The Drowned Lantern");

    const plan = planFor("settlement");
    const chosen = plan.sections.map((s) => s.key);
    const written: Record<string, BuildSectionData> = {};
    for (const s of plan.sections) {
      const { data, provider } = await draftBuildSection(db, { worldId, campaignId: null, entityId: town!.id, key: s.key, chosen, depth: "essentials", written, mode: "new" });
      expect(provider).toBe("offline");
      written[s.key] = data;
    }
    expect(written.people!.entries).toHaveLength(3);
    expect(written.trouble!.rumours).toHaveLength(3);
    expect(written.trouble!.hooks).toHaveLength(3);

    // Steer the people: same shape back.
    const steered = await draftBuildSection(db, { worldId, campaignId: null, entityId: town!.id, key: "people", chosen, depth: "deep", written, previous: written.people, notes: ["Quirkier"], mode: "steer" });
    expect(steered.data.entries).toHaveLength(5);
    written.people = steered.data;

    // Claude reused an existing name: it's linked, not duplicated.
    written.power!.entries.push({ type: "npc", name: "Lady Marr", summary: "dup", details: "", secret: "", within: "", fields: [], links: [] });
    const tavernOwner = written.haunts!.entries.find((e) => e.type === "npc");
    if (tavernOwner) tavernOwner.links.push({ to: "the drowned lantern", type: "works_at", why: "Pours the ale." });

    const before = await db.select({ id: entities.id, name: entities.name }).from(entities).where(eq(entities.worldId, worldId));
    const res = await applyBuildOut(db, worldId, user.id, { entityId: town!.id, sections: written, reveal: false, provider: "offline" });
    expect(res.failed).toEqual([]);
    const after = await db.select().from(entities).where(eq(entities.worldId, worldId));
    const added = after.filter((e) => !before.some((b) => b.id === e.id) && e.type !== "rumour");
    // Generated names that happen to match an existing entry link to it instead.
    const expected = new Set(Object.values(written).flatMap((d) => d.entries).map((e) => e.name.toLowerCase()).filter((n) => !before.some((b) => b.name.toLowerCase() === n))).size;
    expect(added.length).toBe(expected);
    expect(after.filter((e) => e.name === "Lady Marr")).toHaveLength(1);

    // New places and people sit inside the town; new entries stay hidden from players.
    const districts = added.filter((e) => e.type === "location");
    expect(districts.length).toBeGreaterThan(0);
    for (const d of districts) expect(d.locationId).toBe(town!.id);
    expect(added.filter((e) => e.type !== "world_thread").every((e) => e.visibility === "secret")).toBe(true);
    expect(added.find((e) => e.type === "world_thread")!.visibility).toBe("dm_only");

    // Links, including one to an existing entry referred to loosely.
    const rels = await db.select().from(relationships).where(and(eq(relationships.worldId, worldId), inArray(relationships.sourceId, added.map((e) => e.id))));
    expect(rels.some((r) => r.targetId === town!.id && r.type === "rules")).toBe(true);
    if (tavernOwner) {
      const [lantern] = after.filter((e) => e.name === "The Drowned Lantern");
      expect(rels.some((r) => r.targetId === lantern!.id && r.type === "works_at")).toBe(true);
    }

    // The town's article grew, hooks are DM-only, rumours circulate there.
    const [grown] = await db.select().from(entities).where(eq(entities.id, town!.id));
    expect(grown!.body.length).toBeGreaterThan(town!.body.length);
    expect(grown!.body).toContain("Adventure hooks");
    expect(grown!.body).toMatch(/:::dm[\s\S]*Adventure hooks[\s\S]*:::/);
    const rs = after.filter((e) => e.type === "rumour" && !before.some((b) => b.id === e.id));
    expect(rs).toHaveLength(3);
    const [r] = await db.select().from(rumours).where(eq(rumours.entityId, rs[0]!.id));
    expect(r!.truth).toBeTruthy();
  });

  it("refuses an empty build and a build of things that all exist", async () => {
    const user = await createTestUser(db);
    const { worldId } = await createDemoWorld(db, user.id);
    const [npc] = await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.name, "Hollis Pell")));
    await expect(applyBuildOut(db, worldId, user.id, { entityId: npc!.id, sections: {}, reveal: false })).rejects.toThrow(/Nothing has been written/);
    const dupOnly: BuildSectionData = { article: "", fields: [], entries: [{ type: "npc", name: "Lady Marr", summary: "", details: "", secret: "", within: "", fields: [], links: [] }], links: [], rumours: [], hooks: [] };
    await expect(applyBuildOut(db, worldId, user.id, { entityId: npc!.id, sections: { circle: dupOnly }, reveal: true })).rejects.toThrow(/already exists/);
  });
});

describe("thin spots", () => {
  it("find sketchy places and powers, point at the right build-out parts, and can be dismissed", async () => {
    const { findThinSpots, setThinSpotDismissed } = await import("@/server/services/thin-spots");
    const { createEntity } = await import("@/server/services/entities");
    const { userActor } = await import("@/server/services/history");
    const user = await createTestUser(db);
    const { worldId, campaignId } = await createDemoWorld(db, user.id);
    const actor = userActor(user.id);
    const vale = await createEntity(db, worldId, actor, { type: "settlement", name: "Emptyvale", summary: "A village by the marsh.", importance: 1 });
    const guild = await createEntity(db, worldId, actor, { type: "faction", name: "The Quiet Ledger", summary: "Accountants of the dead." });

    const { spots } = await findThinSpots(db, worldId, { campaignId });
    const of = (id: string) => spots.filter((s) => s.entity.id === id);
    expect(of(vale.id).map((s) => s.kind).sort()).toEqual(["no-people", "nowhere-to-go"]);
    expect(of(vale.id).find((s) => s.kind === "no-people")!.parts).toEqual(["people", "power"]);
    expect(of(guild.id)[0]!.kind).toBe("no-members");
    expect(of(guild.id)[0]!.parts).toEqual(["leaders", "members"]);
    // The demo's starting town is fully stocked.
    const [town] = await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.name, "Stonehaven")));
    expect(of(town!.id).some((s) => s.kind === "no-people")).toBe(false);
    // Races and classes aren't flagged as sketches.
    expect(spots.some((s) => ["race", "class"].includes(s.entity.type))).toBe(false);

    await setThinSpotDismissed(db, worldId, `no-members:${guild.id}`, true);
    const after = await findThinSpots(db, worldId, { campaignId });
    expect(after.spots.some((s) => s.entity.id === guild.id)).toBe(false);
    expect(after.dismissed).toBe(1);
    await setThinSpotDismissed(db, worldId, null, false);
    expect((await findThinSpots(db, worldId)).dismissed).toBe(0);
  });
});
