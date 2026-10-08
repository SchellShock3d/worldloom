import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { audioTracks, campaigns, entities, files } from "@/server/db/schema";

type Ids = (string | null | undefined)[];

/**
 * Foreign keys only prove a row exists; this proves it belongs to the same
 * world. Call it before storing any client-supplied reference.
 */
export async function assertOwned(db: DB, worldId: string, refs: { entities?: Ids; campaigns?: Ids; files?: Ids; tracks?: Ids }) {
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
}
