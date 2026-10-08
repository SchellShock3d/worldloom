/** Everything Run Session mode needs, in one load. */
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { audioProfiles, audioTracks, encounterCombatants, encounters, entities, gameSessions, randomTables } from "@/server/db/schema";
import { listScenes } from "./sessions";
import { listPartyMembers } from "./campaigns";
import { listQuests, listMysteries } from "./quests";
import { getLocationChain } from "./entities";
import { collectRefs } from "./refs";
import type { Campaign } from "@/server/db/schema";

export async function getRunData(db: DB, worldId: string, campaign: Campaign) {
  const sessions = await db.select().from(gameSessions).where(eq(gameSessions.campaignId, campaign.id)).orderBy(desc(gameSessions.number));
  const live = sessions.find((s) => s.status === "in_progress") ?? null;
  const planned = [...sessions].reverse().filter((s) => s.status === "planned");
  const [scenes, party, quests, mysteries, chain, encounterRows, tables, tracks, profiles] = await Promise.all([
    listScenes(db, campaign.id),
    listPartyMembers(db, worldId, campaign.id),
    listQuests(db, worldId, campaign.id, ["active", "available"]),
    listMysteries(db, worldId, campaign.id),
    getLocationChain(db, worldId, campaign.currentLocationId),
    db.select().from(encounters).where(and(eq(encounters.worldId, worldId), or(isNull(encounters.campaignId), eq(encounters.campaignId, campaign.id)), inArray(encounters.status, ["ready", "active", "draft"]))).orderBy(desc(encounters.updatedAt)),
    db.select().from(randomTables).where(eq(randomTables.worldId, worldId)).orderBy(asc(randomTables.name)),
    db.select().from(audioTracks).where(eq(audioTracks.worldId, worldId)).orderBy(asc(audioTracks.name)),
    db.select().from(audioProfiles).where(eq(audioProfiles.worldId, worldId)).orderBy(asc(audioProfiles.name)),
  ]);
  const activeScene = scenes.find((s) => s.id === campaign.activeSceneId) ?? null;
  const presentIds = activeScene?.entities.filter((e) => e.role === "present").map((e) => e.id) ?? [];
  const present = presentIds.length ? await db.select().from(entities).where(inArray(entities.id, presentIds)) : [];
  const activeEncounter = encounterRows.find((e) => e.status === "active") ?? (activeScene?.encounterId ? encounterRows.find((e) => e.id === activeScene.encounterId) : null) ?? null;
  const combatants = activeEncounter ? await db.select().from(encounterCombatants).where(eq(encounterCombatants.encounterId, activeEncounter.id)) : [];
  const chainIds = new Set(chain.map((c) => c.id));
  const lastSession = sessions.find((s) => s.status !== "planned" && s.status !== "in_progress") ?? null;
  const refs = await collectRefs(db, worldId, live?.notes, live?.prep, activeScene?.description, planned[0]?.prep, lastSession?.recap, ...scenes.map((s) => s.description));
  return {
    live,
    planned,
    lastSession,
    scenes,
    activeScene,
    present,
    party,
    quests,
    mysteries: mysteries.filter((m) => m.mystery.status !== "solved" && m.mystery.status !== "abandoned"),
    chain,
    encounters: encounterRows,
    activeEncounter,
    combatants,
    tables: tables.map((t) => ({ id: t.id, name: t.name, category: t.category, local: !!t.locationId && chainIds.has(t.locationId) })).sort((a, b) => Number(b.local) - Number(a.local)),
    tracks: tracks.filter((t) => t.fileId || t.url).map((t) => ({ id: t.id, name: t.name, kind: t.kind, src: t.fileId ? `/api/files/${t.fileId}` : t.url!, tags: t.tags, loop: t.loop, volume: t.volume })),
    profiles: profiles.map((p) => ({ id: p.id, name: p.name, musicTrackId: p.musicTrackId, ambienceTrackId: p.ambienceTrackId })),
    refs,
  };
}

export type RunData = Awaited<ReturnType<typeof getRunData>>;
