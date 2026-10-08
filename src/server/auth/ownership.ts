import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { audioProfiles, audioTracks, campaigns, encounters, entities, facts, files, gameSessions, scenes } from "@/server/db/schema";

type Ids = (string | null | undefined)[];

export interface OwnedRefs {
  entities?: Ids;
  campaigns?: Ids;
  files?: Ids;
  tracks?: Ids;
  profiles?: Ids;
  encounters?: Ids;
  facts?: Ids;
  /** game sessions (scoped through their campaign) */
  sessions?: Ids;
  /** scenes (scoped through their campaign) */
  scenes?: Ids;
}

/**
 * Foreign keys only prove a row exists; this proves it belongs to the same
 * world. Call it before storing any client-supplied (or AI-supplied) reference.
 */
export async function assertOwned(db: DB, worldId: string, refs: OwnedRefs) {
  const check = async (ids: Ids | undefined, label: string, count: (list: string[]) => Promise<number>) => {
    const list = Array.from(new Set((ids ?? []).filter((x): x is string => !!x)));
    if (!list.length) return;
    if (list.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error(`${label} not found in this world`);
    if ((await count(list)) !== list.length) throw new Error(`${label} not found in this world`);
  };
  await check(refs.entities, "Entry", async (l) => (await db.select({ id: entities.id }).from(entities).where(and(eq(entities.worldId, worldId), inArray(entities.id, l)))).length);
  await check(refs.campaigns, "Campaign", async (l) => (await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.worldId, worldId), inArray(campaigns.id, l)))).length);
  await check(refs.files, "File", async (l) => (await db.select({ id: files.id }).from(files).where(and(eq(files.worldId, worldId), inArray(files.id, l)))).length);
  await check(refs.tracks, "Track", async (l) => (await db.select({ id: audioTracks.id }).from(audioTracks).where(and(eq(audioTracks.worldId, worldId), inArray(audioTracks.id, l)))).length);
  await check(refs.profiles, "Audio profile", async (l) => (await db.select({ id: audioProfiles.id }).from(audioProfiles).where(and(eq(audioProfiles.worldId, worldId), inArray(audioProfiles.id, l)))).length);
  await check(refs.encounters, "Encounter", async (l) => (await db.select({ id: encounters.id }).from(encounters).where(and(eq(encounters.worldId, worldId), inArray(encounters.id, l)))).length);
  await check(refs.facts, "Fact", async (l) => (await db.select({ id: facts.id }).from(facts).where(and(eq(facts.worldId, worldId), inArray(facts.id, l)))).length);
  await check(
    refs.sessions,
    "Session",
    async (l) =>
      (await db.select({ id: gameSessions.id }).from(gameSessions).innerJoin(campaigns, eq(campaigns.id, gameSessions.campaignId)).where(and(eq(campaigns.worldId, worldId), inArray(gameSessions.id, l)))).length,
  );
  await check(
    refs.scenes,
    "Scene",
    async (l) => (await db.select({ id: scenes.id }).from(scenes).innerJoin(campaigns, eq(campaigns.id, scenes.campaignId)).where(and(eq(campaigns.worldId, worldId), inArray(scenes.id, l)))).length,
  );
}
