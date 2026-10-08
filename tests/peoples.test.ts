/**
 * Races and classes: the core set, homebrew that fits the world, demographics, and the generators
 * and AI context using them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, worlds } from "@/server/db/schema";
import { createDemoWorld } from "@/server/services/seed";
import { addCorePeoples, addHomebrewPeoples, listPeoples, peoplesContext } from "@/server/services/peoples";
import { createWorld } from "@/server/services/worlds";
import { offlineGenerate, racePicker } from "@/server/ai/offline/generate";
import { Rng } from "@/server/ai/offline/rng";
import { buildDmContext } from "@/server/ai/context";
import { suggestForField, suggestPeoples } from "@/server/ai/tasks/creator";
import { userActor } from "@/server/services/history";
import { defaultClassPrevalence, defaultRacePrevalence, parseDemographics, singularPeople, suggestHomebrew } from "@/lib/peoples";
import { setupTestDb, createTestUser } from "./helpers";

let handle: Awaited<ReturnType<typeof setupTestDb>>;
let db: DB;
beforeAll(async () => {
  handle = await setupTestDb();
  db = handle.db;
});
afterAll(async () => handle.close());

describe("peoples logic", () => {
  it("reads demographics written in several ways", () => {
    expect(parseDemographics("Human 60%, Dwarf 25%, halflings 10%, other 5%")).toEqual([
      { name: "Human", percent: 60 },
      { name: "Dwarf", percent: 25 },
      { name: "halflings", percent: 10 },
      { name: "other", percent: 5 },
    ]);
    expect(parseDemographics("60% human; Elves: 30%\nand 10% gnomes")).toEqual([
      { name: "human", percent: 60 },
      { name: "Elves", percent: 30 },
      { name: "gnomes", percent: 10 },
    ]);
    expect(singularPeople("Elves")).toBe("elf");
    expect(singularPeople("Dwarves")).toBe("dwarf");
    expect(singularPeople("Half-Orcs")).toBe("half-orc");
    expect(singularPeople("Clockwork Folk")).toBe("clockwork folk");
  });

  it("tunes how common core races and classes are to the world", () => {
    const low = defaultClassPrevalence({ genre: "Low fantasy", magicLevel: "None" });
    const high = defaultClassPrevalence({ genre: "High fantasy", magicLevel: "High" });
    expect(["Very rare", "Legendary"]).toContain(low.Wizard);
    expect(["Common", "Uncommon"]).toContain(high.Wizard);
    expect(defaultRacePrevalence({ genre: "Steampunk", techLevel: "Industrial" }).Gnome).toBe("Common");
  });

  it("suggests homebrew that grows out of the setting", () => {
    const steam = suggestHomebrew({ genre: "Steampunk", magicLevel: "Moderate", techLevel: "Industrial" });
    expect(steam.find((s) => s.name === "Artificer")).toMatchObject({ kind: "class", prevalence: "Common" });
    const high = suggestHomebrew({ genre: "High fantasy", magicLevel: "High", techLevel: "Medieval" });
    expect(high.map((s) => s.name)).toContain("Planeswalker");
    const sea = suggestHomebrew({ genre: "Nautical fantasy", techLevel: "Age of sail" }, ["Tidekin"]);
    expect(sea.map((s) => s.name)).not.toContain("Tidekin");
    expect(sea.map((s) => s.name)).toContain("Corsair");
    // Never more than asked for, and always something.
    expect(suggestHomebrew({}).length).toBeGreaterThan(0);
    expect(suggestHomebrew({ magicLevel: "Wild", genre: "Steampunk", techLevel: "Industrial" }, [], { race: 1, class: 1 })).toHaveLength(2);
  });
});

describe("peoples in a world", () => {
  it("adds the core set at the chosen prevalence, skipping absent and existing ones", async () => {
    const user = await createTestUser(db);
    const actor = { ...userActor(user.id), userId: user.id };
    const w = await createWorld(db, actor, { name: "Brassmoor", genre: "Steampunk", tone: "", magicLevel: "Moderate", techLevel: "Industrial", description: "" });
    await addCorePeoples(db, w.id, actor, { races: { Human: "Common", Elf: "Absent", Gnome: "Common" }, classes: { Fighter: "Common", Wizard: "Rare" } });
    await addCorePeoples(db, w.id, actor, { races: { Human: "Rare" }, classes: {} });
    await addHomebrewPeoples(db, w.id, actor, [{ kind: "class", name: "Artificer", prevalence: "Common", summary: "Gadgeteers.", reason: "Industry.", fields: { hitDie: "d8", role: "Support" } }]);
    const { races, classes } = await listPeoples(db, w.id);
    expect(races.map((r) => [r.name, r.prevalence])).toEqual([
      ["Gnome", "Common"],
      ["Human", "Common"],
    ]);
    expect(classes.map((c) => c.name)).toEqual(["Artificer", "Fighter", "Wizard"]);
    expect(classes[0]).toMatchObject({ source: "Homebrew" });
    const text = await peoplesContext(db, w.id);
    expect(text).toContain("Races: Gnome (common), Human (common)");
    expect(text).toContain("Artificer (common, homebrew)");
  });

  it("generates NPCs from the races of the place they're in", async () => {
    const user = await createTestUser(db);
    const { worldId, campaignId } = await createDemoWorld(db, user.id);
    const [ashfall] = await db.select().from(entities).where(and(eq(entities.worldId, worldId), eq(entities.name, "The Ashfall Wastes")));
    const pick = await racePicker(db, worldId, new Rng(7), ashfall!.id);
    const seen = new Set(Array.from({ length: 200 }, () => pick()));
    expect([...seen].sort()).toEqual(["Human", "Orc", "Tiefling"]);

    const cs = await offlineGenerate(db, { worldId, campaignId, request: "three villagers in Stonehaven", type: "npc", count: 3, seed: 11 });
    const allowed = ["Human", "Halfling", "Dwarf", "Gnome"];
    for (const e of cs.newEntities) expect(allowed).toContain(e.fields.find((f) => f.key === "species")!.value);

    const town = await offlineGenerate(db, { worldId, campaignId, request: "a village in the Heartlands", type: "settlement", seed: 3 });
    expect(town.newEntities[0]!.fields.find((f) => f.key === "demographics")?.value).toMatch(/Human \d+%/);
  });

  it("tells the AI about the peoples, the profile and the table's limits", async () => {
    const user = await createTestUser(db);
    const actor = { ...userActor(user.id), userId: user.id };
    const w = await createWorld(db, actor, {
      name: "Saltreach",
      genre: "Nautical fantasy",
      tone: "Swashbuckling",
      magicLevel: "High",
      techLevel: "Age of sail",
      description: "",
      profile: { magicSources: ["Pacts with patrons"], magicAttitude: "Feared", worldShape: "An archipelago", avoid: "Spiders, harm to children" },
    });
    const [row] = await db.select().from(worlds).where(eq(worlds.id, w.id));
    expect(row!.settings.profile?.worldShape).toBe("An archipelago");
    await addCorePeoples(db, w.id, actor, { races: { Human: "Common" }, classes: { Rogue: "Common" } });
    const ctx = await buildDmContext(db, { worldId: w.id, campaignId: null });
    expect(ctx.text).toContain("Magic: comes from pacts with patrons; society sees it as feared");
    expect(ctx.text).toContain("Geography: An archipelago");
    expect(ctx.text).toMatch(/Content to keep out of this world entirely.*Spiders, harm to children/);
    expect(ctx.text).toContain("# Peoples of this world");
    expect(ctx.text).toContain("Races: Human (common)");
  });

  it("offers creator suggestions and homebrew without an AI key", async () => {
    const field = await suggestForField("conflict", { genre: "Nautical fantasy" });
    expect(field.provider).toBe("offline");
    expect(field.suggestions).toHaveLength(4);
    const peoples = await suggestPeoples({ draft: { genre: "Steampunk", magicLevel: "High", techLevel: "Industrial" }, existing: ["Artificer"] });
    expect(peoples.provider).toBe("offline");
    expect(peoples.items.map((i) => i.name)).not.toContain("Artificer");
    expect(peoples.items.map((i) => i.name)).toContain("Planeswalker");
  });
});
