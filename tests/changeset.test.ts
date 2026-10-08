/**
 * Reading model output: references by name, mangled IDs, and the wire format.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DB } from "@/server/db/client";
import { createDemoWorld } from "@/server/services/seed";
import { changeSetToDrafts, changeSetWireSchema, emptyChangeSet, fromWire } from "@/server/ai/changeset";
import { fillDefaults } from "@/server/ai/schema-utils";
import { normalizeDmBlocks, splitDmBlocks, toPlayerMarkdown } from "@/lib/mentions";
import { eq } from "drizzle-orm";
import { consequences } from "@/server/db/schema";
import { createBatch } from "@/server/services/proposals";
import { pendingChangesText } from "@/server/ai/tasks/dm-tools";
import { DEFAULT_CALENDAR } from "@/lib/calendar";
import { setupTestDb, createTestUser } from "./helpers";

let handle: Awaited<ReturnType<typeof setupTestDb>>;
let db: DB;
let worldId: string;
let campaignId: string;
beforeAll(async () => {
  handle = await setupTestDb();
  db = handle.db;
  const user = await createTestUser(db);
  ({ worldId, campaignId } = await createDemoWorld(db, user.id));
});
afterAll(async () => handle.close());

const ctx = () => ({ worldId, campaignId, now: 0, calendar: DEFAULT_CALENDAR });

describe("DM blocks written loosely", () => {
  it("are tidied and never reach players", () => {
    const inline = "Harbourmaster, lean and scarred. :::dm\nTakes bribes from the Guild.:::";
    expect(normalizeDmBlocks(inline)).toBe("Harbourmaster, lean and scarred.\n\n:::dm\nTakes bribes from the Guild.\n:::");
    expect(toPlayerMarkdown(inline)).toBe("Harbourmaster, lean and scarred.");

    const oneLine = "A quiet inn. :::dm The cellar hides a shrine. ::: Rooms cost 5 sp.";
    expect(toPlayerMarkdown(oneLine)).toBe("A quiet inn.\n\nRooms cost 5 sp.");

    const unclosed = "Public part.\n:::dm\nSecret with no end";
    expect(toPlayerMarkdown(unclosed)).toBe("Public part.");

    const canonical = "Intro.\n\n:::dm\nSecret.\n:::\n\nOutro.";
    expect(normalizeDmBlocks(canonical)).toBe(canonical);
    expect(splitDmBlocks(canonical).map((s) => s.kind)).toEqual(["public", "dm", "public"]);
  });
});

describe("pending changes shown to reviews", () => {
  it("lists updates to existing records first, by name, even in a long batch", async () => {
    const [promise] = await db.select().from(consequences).where(eq(consequences.campaignId, campaignId));
    const facts = Array.from({ length: 40 }, (_, i) => ({ kind: "create_fact" as const, rationale: "", payload: { statement: `Filler fact number ${i} about the river trade and its many quarrels.`, visibility: "dm_only" } }));
    await createBatch(db, { worldId, campaignId, source: "session", title: "Session 3 — proposed updates", provider: "test", createdBy: null }, [
      ...facts,
      { kind: "consequence_update", rationale: "", payload: { consequenceId: promise!.id, status: "resolved", label: promise!.title } },
    ]);
    const text = await pendingChangesText(db, worldId, campaignId, DEFAULT_CALENDAR, 1500);
    const lines = text.split("\n");
    expect(lines[0]).toBe("- Session 3 — proposed updates");
    expect(lines[1]).toBe(`  - ${promise!.title} → resolved`);
    expect(lines.at(-1)).toMatch(/…and \d+ more/);
  });
});

describe("changeSetToDrafts", () => {
  it("resolves references the model named without a usable ID", async () => {
    const cs = emptyChangeSet("test");
    cs.newEntities.push({
      ref: "pip",
      type: "npc",
      name: "Pip Hollow",
      summary: "A nervous dockhand.",
      body: "",
      status: null,
      location: { id: null, ref: null, name: "stonehaven" },
      fields: [],
      tags: [],
      aliases: [],
      visibility: "dm_only",
      importance: 1,
      rationale: "",
    });
    cs.relationships.push(
      { source: { id: "not-a-uuid", ref: null, name: "Lady Marr" }, target: { id: null, ref: null, name: "Pip Hollow" }, type: "knows", description: "", rationale: "" },
      { source: { id: "3f0c2a8e-1111-4222-8333-444455556666", ref: null, name: "Captain Varo" }, target: { id: null, ref: null, name: "Nobody In Particular" }, type: "knows", description: "", rationale: "" },
    );
    const { drafts, dropped } = await changeSetToDrafts(db, cs, ctx());

    const create = drafts.find((d) => d.kind === "create_entity")!;
    expect((create.payload as { entity: { locationId: string | null } }).entity.locationId).toMatch(/^[0-9a-f-]{36}$/);

    const rels = drafts.filter((d) => d.kind === "create_relationship");
    expect(rels).toHaveLength(1);
    const rel = rels[0]!.payload as { source: { id?: string; name?: string }; target: { ref?: string } };
    expect(rel.source.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rel.source.name).toBe("Lady Marr");
    expect(rel.target.ref).toBe("pip");
    expect(dropped.join(" ")).toMatch(/Nobody In Particular/);
  });

  it("keeps name-only optional references from the wire format", () => {
    const wire = fillDefaults(changeSetWireSchema, {
      summary: "x",
      events: [{ title: "Fire at the docks", summary: "", kind: "world", offsetDays: 1, location: { id: "", ref: "", name: "Stonehaven" }, involved: [] }],
    }) as Parameters<typeof fromWire>[0];
    const cs = fromWire(wire);
    expect(cs.events[0]!.location).toEqual({ id: null, ref: null, name: "Stonehaven" });
    expect(cs.newEntities).toEqual([]);
  });
});
