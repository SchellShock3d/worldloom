"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { authorizeCampaign, authorizeWorld } from "@/server/auth/access";
import { campaigns, randomTables, randomTableEntries, travelPlans, entities, audioTracks, audioProfiles, encounters, encounterCombatants } from "@/server/db/schema";
import { climateAt, weatherFor } from "@/server/services/weather";
import { Rng, hashSeed } from "@/server/ai/offline/rng";
import { describeDuration, durationToMinutes, minutesPerDay } from "@/lib/calendar";
import { getGameSystem } from "@/lib/game-systems/dnd5e";
import { assertOwned } from "@/server/auth/ownership";
import { advanceWorld } from "@/server/ai/tasks/world-tasks";
import { run } from "./_util";

const refresh = (worldId: string) => revalidatePath(`/w/${worldId}`, "layout");

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

export async function rollWeatherAction(worldId: string, campaignId: string) {
  return run(async () => {
    const { campaign, calendar } = await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    const climate = await climateAt(db, worldId, campaign.currentLocationId);
    const w = weatherFor(calendar, campaign.currentAt, climate, `${campaignId}-${Date.now()}`);
    await db.update(campaigns).set({ currentWeather: w.description, weatherLocked: false }).where(eq(campaigns.id, campaignId));
    refresh(worldId);
    return w;
  });
}

// ---------------------------------------------------------------------------
// Random tables
// ---------------------------------------------------------------------------

const tableInput = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(40).default("custom"),
  description: z.string().max(1000).default(""),
  locationId: z.string().uuid().nullable().optional(),
  entries: z.array(z.object({ text: z.string().trim().min(1).max(1000), weight: z.number().int().min(1).max(100).default(1) })).max(500),
});

export async function saveTableAction(worldId: string, raw: z.input<typeof tableInput>, tableId?: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const input = tableInput.parse(raw);
    const db = await getDb();
    if (input.locationId) {
      const [loc] = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.id, input.locationId), eq(entities.worldId, worldId)));
      if (!loc) throw new Error("Location not found");
    }
    const id = await db.transaction(async (tx) => {
      let id = tableId;
      if (id) {
        const [t] = await tx.update(randomTables).set({ name: input.name, category: input.category, description: input.description, locationId: input.locationId ?? null }).where(and(eq(randomTables.id, id), eq(randomTables.worldId, worldId))).returning();
        if (!t) throw new Error("Table not found");
        await tx.delete(randomTableEntries).where(eq(randomTableEntries.tableId, id));
      } else {
        const [t] = await tx.insert(randomTables).values({ worldId, name: input.name, category: input.category, description: input.description, locationId: input.locationId ?? null }).returning();
        id = t!.id;
      }
      if (input.entries.length) await tx.insert(randomTableEntries).values(input.entries.map((e, i) => ({ tableId: id!, text: e.text, weight: e.weight, position: i })));
      return id!;
    });
    refresh(worldId);
    return { id };
  }, "Table saved");
}

export async function deleteTableAction(worldId: string, tableId: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await db.delete(randomTables).where(and(eq(randomTables.id, tableId), eq(randomTables.worldId, worldId)));
    refresh(worldId);
    return null;
  });
}

/** Roll a table; supports inline dice like "2d6" inside entries, e.g. "2d10 silver". */
export async function rollTableAction(worldId: string, tableId: string) {
  return run(async () => {
    await authorizeWorld(worldId, "viewer");
    const db = await getDb();
    const [t] = await db.select().from(randomTables).where(and(eq(randomTables.id, tableId), eq(randomTables.worldId, worldId)));
    if (!t) throw new Error("Table not found");
    const entries = await db.select().from(randomTableEntries).where(eq(randomTableEntries.tableId, tableId)).orderBy(asc(randomTableEntries.position));
    if (!entries.length) throw new Error("This table has no entries yet.");
    const rng = new Rng(hashSeed(tableId, Date.now(), Math.random()));
    const picked = rng.weighted(entries.map((e) => ({ value: e, weight: e.weight })));
    const text = picked.text.replace(/\b(\d{1,2})d(\d{1,3})(?:\s*([+-])\s*(\d{1,3}))?\b/g, (_m, n: string, d: string, sign?: string, mod?: string) => {
      let total = 0;
      for (let i = 0; i < Number(n); i++) total += rng.int(1, Number(d));
      if (sign && mod) total += sign === "+" ? Number(mod) : -Number(mod);
      return `${total}`;
    });
    return { table: t.name, text, original: picked.text };
  });
}

// ---------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------

const SPEEDS: Record<string, number> = { foot: 24, horse: 40, cart: 18, ship: 72, flying: 80, river: 50 };

const travelInput = z.object({
  name: z.string().max(200).default(""),
  originId: z.string().uuid().nullable().optional(),
  destinationId: z.string().uuid().nullable().optional(),
  distance: z.number().min(0).max(100000).nullable().optional(),
  distanceUnit: z.string().max(20).default("miles"),
  method: z.string().max(40).default("foot"),
  speedPerDay: z.number().min(0.1).max(100000).nullable().optional(),
  terrain: z.string().max(500).default(""),
  weather: z.string().max(500).default(""),
  encounterNotes: z.string().max(5000).default(""),
  notes: z.string().max(10000).default(""),
  stops: z.array(z.object({ name: z.string().max(200), entityId: z.string().uuid().nullable().optional(), notes: z.string().max(1000).optional() })).max(30).default([]),
});

export async function saveTravelAction(worldId: string, campaignId: string, raw: z.input<typeof travelInput>, travelId?: string) {
  return run(async () => {
    const { calendar } = await authorizeCampaign(worldId, campaignId, "editor");
    const input = travelInput.parse(raw);
    const db = await getDb();
    await assertOwned(db, worldId, { entities: [input.originId, input.destinationId, ...input.stops.map((s) => s.entityId)] });
    const speed = input.speedPerDay ?? SPEEDS[input.method] ?? 24;
    const estimatedMinutes = input.distance ? Math.round((input.distance / speed) * minutesPerDay(calendar)) : null;
    const values = { ...input, speedPerDay: speed, estimatedMinutes, originId: input.originId ?? null, destinationId: input.destinationId ?? null, distance: input.distance ?? null, stops: input.stops.map((s) => ({ ...s, entityId: s.entityId ?? null })) };
    let id = travelId;
    if (id) await db.update(travelPlans).set(values).where(and(eq(travelPlans.id, id), eq(travelPlans.campaignId, campaignId)));
    else id = (await db.insert(travelPlans).values({ ...values, worldId, campaignId }).returning())[0]!.id;
    refresh(worldId);
    return { id, estimate: estimatedMinutes ? describeDuration(calendar, estimatedMinutes) : null };
  }, "Journey saved");
}

/** Depart: marks the journey underway. Arrival is handled by Advance World (or "Arrive now"). */
export async function departTravelAction(worldId: string, campaignId: string, travelId: string) {
  return run(async () => {
    const { campaign } = await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    await db.update(travelPlans).set({ status: "underway", departedAt: campaign.currentAt }).where(and(eq(travelPlans.id, travelId), eq(travelPlans.campaignId, campaignId)));
    refresh(worldId);
    return null;
  });
}

/**
 * Travel to the destination. The journey's time passes through Advance World,
 * so the world keeps moving while the party is on the road; approving the
 * resulting proposals moves the clock and the party and marks the trip arrived.
 */
export async function arriveTravelAction(worldId: string, campaignId: string, travelId: string) {
  return run(async () => {
    const { user, campaign, calendar } = await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    const [t] = await db.select().from(travelPlans).where(and(eq(travelPlans.id, travelId), eq(travelPlans.campaignId, campaignId), eq(travelPlans.worldId, worldId)));
    if (!t) throw new Error("Journey not found");
    if (t.status === "arrived") throw new Error("The party has already arrived.");
    const departed = t.departedAt ?? campaign.currentAt;
    const duration = t.estimatedMinutes ?? durationToMinutes(calendar, 1, "days");
    await db.update(travelPlans).set({ status: "underway", departedAt: departed, estimatedMinutes: duration }).where(eq(travelPlans.id, t.id));
    const minutes = Math.max(1, departed + duration - campaign.currentAt);
    const [dest] = t.destinationId ? await db.select({ name: entities.name }).from(entities).where(and(eq(entities.id, t.destinationId), eq(entities.worldId, worldId))) : [];
    const note = [
      `The party travels${t.name ? ` (${t.name})` : ""}${dest ? ` to ${dest.name}` : ""}${t.method ? ` by ${t.method}` : ""}.`,
      t.terrain && `Terrain: ${t.terrain}.`,
      t.encounterNotes && `Possible encounters on the way: ${t.encounterNotes}`,
    ]
      .filter(Boolean)
      .join(" ");
    const res = await advanceWorld({ db, worldId, campaignId, userId: user.id, minutes, note });
    refresh(worldId);
    return { batchId: res.batchId, span: describeDuration(calendar, minutes) };
  });
}

export async function deleteTravelAction(worldId: string, campaignId: string, travelId: string) {
  return run(async () => {
    await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    await db.delete(travelPlans).where(and(eq(travelPlans.id, travelId), eq(travelPlans.campaignId, campaignId)));
    refresh(worldId);
    return null;
  });
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

const trackInput = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["music", "ambience", "sfx"]),
  fileId: z.string().uuid().nullable().optional(),
  url: z.string().url().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  loop: z.boolean().default(true),
  volume: z.number().min(0).max(1).default(0.8),
});

export async function saveTrackAction(worldId: string, raw: z.input<typeof trackInput>, trackId?: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const input = trackInput.parse(raw);
    if (!input.fileId && !input.url) throw new Error("Upload a file or paste a link to an audio file.");
    if (input.url && !/^https:\/\//.test(input.url)) throw new Error("Audio links must use https.");
    const db = await getDb();
    await assertOwned(db, worldId, { files: [input.fileId] });
    const values = { ...input, fileId: input.fileId ?? null, url: input.url ?? null };
    if (trackId) await db.update(audioTracks).set(values).where(and(eq(audioTracks.id, trackId), eq(audioTracks.worldId, worldId)));
    else await db.insert(audioTracks).values({ ...values, worldId });
    refresh(worldId);
    return null;
  }, "Track saved");
}

export async function deleteTrackAction(worldId: string, trackId: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await db.delete(audioTracks).where(and(eq(audioTracks.id, trackId), eq(audioTracks.worldId, worldId)));
    refresh(worldId);
    return null;
  });
}

export async function saveAudioProfileAction(worldId: string, raw: { name: string; musicTrackId?: string | null; ambienceTrackId?: string | null; tags?: string[] }, profileId?: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const input = z.object({ name: z.string().trim().min(1).max(120), musicTrackId: z.string().uuid().nullable().optional(), ambienceTrackId: z.string().uuid().nullable().optional(), tags: z.array(z.string()).max(20).default([]) }).parse(raw);
    const db = await getDb();
    await assertOwned(db, worldId, { tracks: [input.musicTrackId, input.ambienceTrackId] });
    const values = { name: input.name, musicTrackId: input.musicTrackId ?? null, ambienceTrackId: input.ambienceTrackId ?? null, tags: input.tags };
    if (profileId) await db.update(audioProfiles).set(values).where(and(eq(audioProfiles.id, profileId), eq(audioProfiles.worldId, worldId)));
    else await db.insert(audioProfiles).values({ ...values, worldId });
    refresh(worldId);
    return null;
  }, "Profile saved");
}

export async function deleteAudioProfileAction(worldId: string, id: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await db.delete(audioProfiles).where(and(eq(audioProfiles.id, id), eq(audioProfiles.worldId, worldId)));
    refresh(worldId);
    return null;
  });
}

// ---------------------------------------------------------------------------
// Encounters
// ---------------------------------------------------------------------------

const encounterInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10000).default(""),
  locationId: z.string().uuid().nullable().optional(),
  questId: z.string().uuid().nullable().optional(),
  rewards: z.string().max(5000).default(""),
  notes: z.string().max(10000).default(""),
  campaignId: z.string().uuid().nullable().optional(),
});

export async function saveEncounterAction(worldId: string, raw: z.input<typeof encounterInput>, encounterId?: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const input = encounterInput.parse(raw);
    const db = await getDb();
    await assertOwned(db, worldId, { entities: [input.locationId, input.questId], campaigns: [input.campaignId] });
    const values = { ...input, locationId: input.locationId ?? null, questId: input.questId ?? null, campaignId: input.campaignId ?? null };
    let id = encounterId;
    if (id) await db.update(encounters).set(values).where(and(eq(encounters.id, id), eq(encounters.worldId, worldId)));
    else id = (await db.insert(encounters).values({ ...values, worldId }).returning())[0]!.id;
    refresh(worldId);
    return { id };
  });
}

export async function deleteEncounterAction(worldId: string, id: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await db.delete(encounters).where(and(eq(encounters.id, id), eq(encounters.worldId, worldId)));
    refresh(worldId);
    return null;
  });
}

async function encounterInWorld(worldId: string, encounterId: string) {
  const db = await getDb();
  const [e] = await db.select().from(encounters).where(and(eq(encounters.id, encounterId), eq(encounters.worldId, worldId)));
  if (!e) throw new Error("Encounter not found");
  return { db, e };
}

const combatantInput = z.object({
  entityId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  side: z.enum(["party", "ally", "enemy", "neutral"]).default("enemy"),
  initiativeBonus: z.number().int().min(-10).max(30).default(0),
  hpMax: z.number().int().min(0).max(100000).nullable().optional(),
  ac: z.number().int().min(0).max(100).nullable().optional(),
  count: z.number().int().min(1).max(30).default(1),
  stats: z.record(z.string(), z.unknown()).default({}),
});

export async function addCombatantsAction(worldId: string, encounterId: string, raw: z.input<typeof combatantInput>) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const input = combatantInput.parse(raw);
    const { db } = await encounterInWorld(worldId, encounterId);
    await assertOwned(db, worldId, { entities: [input.entityId] });
    const existing = await db.select({ position: encounterCombatants.position }).from(encounterCombatants).where(eq(encounterCombatants.encounterId, encounterId));
    let pos = existing.reduce((m, c) => Math.max(m, c.position), -1) + 1;
    const rows = Array.from({ length: input.count }, (_, i) => ({
      encounterId,
      entityId: input.entityId ?? null,
      name: input.count > 1 ? `${input.name} ${i + 1}` : input.name,
      side: input.side,
      initiativeBonus: input.initiativeBonus,
      hpMax: input.hpMax ?? null,
      hpCurrent: input.hpMax ?? null,
      ac: input.ac ?? null,
      stats: input.stats,
      position: pos++,
    }));
    await db.insert(encounterCombatants).values(rows);
    refresh(worldId);
    return null;
  });
}

const combatantPatch = z.object({
  initiative: z.number().nullable().optional(),
  hpCurrent: z.number().int().nullable().optional(),
  hpMax: z.number().int().nullable().optional(),
  tempHp: z.number().int().min(0).optional(),
  ac: z.number().int().nullable().optional(),
  conditions: z.array(z.string().max(40)).max(20).optional(),
  notes: z.string().max(2000).optional(),
  hidden: z.boolean().optional(),
  defeated: z.boolean().optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export async function updateCombatantAction(worldId: string, encounterId: string, combatantId: string, raw: z.input<typeof combatantPatch>) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const patch = combatantPatch.parse(raw);
    const { db } = await encounterInWorld(worldId, encounterId);
    await db.update(encounterCombatants).set(patch).where(and(eq(encounterCombatants.id, combatantId), eq(encounterCombatants.encounterId, encounterId)));
    refresh(worldId);
    return null;
  });
}

export async function removeCombatantAction(worldId: string, encounterId: string, combatantId: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const { db } = await encounterInWorld(worldId, encounterId);
    await db.delete(encounterCombatants).where(and(eq(encounterCombatants.id, combatantId), eq(encounterCombatants.encounterId, encounterId)));
    refresh(worldId);
    return null;
  });
}

/** Start combat: roll initiative for anyone without one and reset the round. */
export async function startEncounterAction(worldId: string, encounterId: string, opts: { rerollAll?: boolean } = {}) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const { db, e } = await encounterInWorld(worldId, encounterId);
    const sys = getGameSystem(e.gameSystem);
    const list = await db.select().from(encounterCombatants).where(eq(encounterCombatants.encounterId, encounterId));
    for (const c of list) {
      if (opts.rerollAll || c.initiative === null) await db.update(encounterCombatants).set({ initiative: sys.rollInitiative(c.initiativeBonus) }).where(eq(encounterCombatants.id, c.id));
    }
    await db.update(encounters).set({ status: "active", round: 1, turnIndex: 0 }).where(eq(encounters.id, encounterId));
    refresh(worldId);
    return null;
  });
}

export async function stepTurnAction(worldId: string, encounterId: string, direction: 1 | -1) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const { db, e } = await encounterInWorld(worldId, encounterId);
    const list = (await db.select().from(encounterCombatants).where(eq(encounterCombatants.encounterId, encounterId))).filter((c) => !c.defeated);
    if (!list.length) throw new Error("No active combatants.");
    let turn = e.turnIndex + direction;
    let round = e.round;
    if (turn >= list.length) {
      turn = 0;
      round += 1;
    } else if (turn < 0) {
      turn = list.length - 1;
      round = Math.max(1, round - 1);
    }
    await db.update(encounters).set({ turnIndex: turn, round }).where(eq(encounters.id, encounterId));
    refresh(worldId);
    return { round, turn };
  });
}

export async function endEncounterAction(worldId: string, encounterId: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const { db } = await encounterInWorld(worldId, encounterId);
    await db.update(encounters).set({ status: "completed" }).where(eq(encounters.id, encounterId));
    refresh(worldId);
    return null;
  }, "Encounter ended");
}

export async function resetEncounterAction(worldId: string, encounterId: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const { db } = await encounterInWorld(worldId, encounterId);
    const list = await db.select().from(encounterCombatants).where(eq(encounterCombatants.encounterId, encounterId));
    for (const c of list) await db.update(encounterCombatants).set({ initiative: null, hpCurrent: c.hpMax, tempHp: 0, conditions: [], defeated: false }).where(eq(encounterCombatants.id, c.id));
    await db.update(encounters).set({ status: "ready", round: 0, turnIndex: 0 }).where(eq(encounters.id, encounterId));
    refresh(worldId);
    return null;
  });
}

/** Add the campaign's player characters to an encounter. */
export async function addPartyAction(worldId: string, encounterId: string, campaignId: string) {
  return run(async () => {
    await authorizeCampaign(worldId, campaignId, "editor");
    const { db } = await encounterInWorld(worldId, encounterId);
    const pcs = await db.select().from(entities).where(and(eq(entities.campaignId, campaignId), eq(entities.type, "pc")));
    const existing = await db.select({ entityId: encounterCombatants.entityId, position: encounterCombatants.position }).from(encounterCombatants).where(eq(encounterCombatants.encounterId, encounterId));
    let pos = existing.reduce((m, c) => Math.max(m, c.position), -1) + 1;
    const toAdd = pcs.filter((p) => !existing.some((x) => x.entityId === p.id) && p.status !== "dead");
    if (toAdd.length)
      await db.insert(encounterCombatants).values(
        toAdd.map((p) => {
          const f = p.fields as Record<string, number | undefined>;
          return { encounterId, entityId: p.id, name: p.name, side: "party" as const, hpMax: f.hpMax ?? null, hpCurrent: f.hpMax ?? null, ac: f.ac ?? null, initiativeBonus: f.initiativeBonus ?? 0, position: pos++ };
        }),
      );
    refresh(worldId);
    return { added: toAdd.length };
  });
}
