import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { campaigns, entities, gameSessions, sceneEntities, scenes, type GameSession, type Scene } from "@/server/db/schema";
import { resolvePlainMentions } from "@/lib/mentions";
import { getNameIndex, recordRevision, syncMentions, type Actor } from "./history";

export async function listSessions(db: DB, campaignId: string) {
  return db.select().from(gameSessions).where(eq(gameSessions.campaignId, campaignId)).orderBy(desc(gameSessions.number));
}

export async function getSession(db: DB, campaignId: string, sessionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const [s] = await db.select().from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.campaignId, campaignId)));
  return s ?? null;
}

export async function createSession(db: DB, worldId: string, campaignId: string, actor: Actor, input: { title?: string; scheduledFor?: Date | null; prep?: string } = {}): Promise<GameSession> {
  const [m] = await db.select({ n: max(gameSessions.number) }).from(gameSessions).where(eq(gameSessions.campaignId, campaignId));
  const [c] = await db.select({ currentAt: campaigns.currentAt }).from(campaigns).where(eq(campaigns.id, campaignId));
  const [row] = await db
    .insert(gameSessions)
    .values({
      campaignId,
      number: (m?.n ?? 0) + 1,
      title: input.title ?? "",
      scheduledFor: input.scheduledFor ?? null,
      prep: input.prep ?? "",
      inWorldStartAt: c?.currentAt ?? null,
    })
    .returning();
  await recordRevision(db, actor, { worldId, campaignId, targetKind: "session", targetId: row!.id, targetLabel: `Session ${row!.number}`, action: "create", summary: `Planned session ${row!.number}` });
  return row!;
}

export async function updateSession(
  db: DB,
  worldId: string,
  campaignId: string,
  sessionId: string,
  patch: Partial<Pick<GameSession, "title" | "notes" | "recap" | "prep" | "status" | "scheduledFor" | "startedAt" | "endedAt" | "inWorldStartAt" | "inWorldEndAt">>,
) {
  const values = { ...patch };
  if (patch.notes !== undefined || patch.recap !== undefined || patch.prep !== undefined) {
    const index = await getNameIndex(db, worldId, campaignId);
    if (patch.notes !== undefined) values.notes = resolvePlainMentions(patch.notes, index);
    if (patch.recap !== undefined) values.recap = resolvePlainMentions(patch.recap, index);
    if (patch.prep !== undefined) values.prep = resolvePlainMentions(patch.prep, index);
  }
  const [row] = await db
    .update(gameSessions)
    .set(values)
    .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.campaignId, campaignId)))
    .returning();
  if (!row) throw new Error("Session not found");
  if (values.notes !== undefined || values.recap !== undefined || values.prep !== undefined) await syncMentions(db, worldId, "session", sessionId, row.notes, row.recap, row.prep);
  await db.update(campaigns).set({ updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
  return row;
}

export async function startSession(db: DB, worldId: string, campaignId: string, actor: Actor, sessionId: string) {
  const s = await getSession(db, campaignId, sessionId);
  if (!s) throw new Error("Session not found");
  if (s.status === "in_progress") return s;
  const [c] = await db.select({ currentAt: campaigns.currentAt }).from(campaigns).where(eq(campaigns.id, campaignId));
  const row = await updateSession(db, worldId, campaignId, sessionId, { status: "in_progress", startedAt: s.startedAt ?? new Date(), inWorldStartAt: s.inWorldStartAt ?? c?.currentAt ?? null });
  await recordRevision(db, actor, { worldId, campaignId, targetKind: "session", targetId: sessionId, targetLabel: `Session ${s.number}`, action: "update", summary: `Session ${s.number} started` });
  return row;
}

/** Find the session to run: the in-progress one, else the next planned, else create one. */
export async function getOrCreateLiveSession(db: DB, worldId: string, campaignId: string, actor: Actor) {
  const list = await db.select().from(gameSessions).where(eq(gameSessions.campaignId, campaignId)).orderBy(desc(gameSessions.number));
  const live = list.find((s) => s.status === "in_progress");
  if (live) return live;
  const planned = [...list].reverse().find((s) => s.status === "planned");
  if (planned) return planned;
  return createSession(db, worldId, campaignId, actor);
}

export async function endSession(db: DB, worldId: string, campaignId: string, actor: Actor, sessionId: string) {
  const [c] = await db.select({ currentAt: campaigns.currentAt }).from(campaigns).where(eq(campaigns.id, campaignId));
  const row = await updateSession(db, worldId, campaignId, sessionId, { status: "completed", endedAt: new Date(), inWorldEndAt: c?.currentAt ?? null });
  await recordRevision(db, actor, { worldId, campaignId, targetKind: "session", targetId: sessionId, targetLabel: `Session ${row.number}`, action: "update", summary: `Session ${row.number} ended` });
  return row;
}

export async function deleteSession(db: DB, campaignId: string, sessionId: string) {
  await db.delete(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.campaignId, campaignId)));
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

export interface SceneInput {
  name: string;
  description?: string;
  sessionId?: string | null;
  locationId?: string | null;
  atTime?: number | null;
  weather?: string;
  mood?: string;
  lighting?: string;
  ambience?: string;
  encounterId?: string | null;
  questId?: string | null;
  audioProfileId?: string | null;
  notes?: string;
  status?: "planned" | "active" | "done";
  presentIds?: string[];
  threadIds?: string[];
}

export async function saveScene(db: DB, worldId: string, campaignId: string, input: SceneInput, sceneId?: string): Promise<Scene> {
  const idsToCheck = [input.locationId, input.questId, ...(input.presentIds ?? []), ...(input.threadIds ?? [])].filter((x): x is string => !!x);
  if (idsToCheck.length) {
    const found = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.worldId, worldId), inArray(entities.id, idsToCheck)));
    if (found.length !== new Set(idsToCheck).size) throw new Error("A scene reference is not in this world.");
  }
  const index = await getNameIndex(db, worldId, campaignId);
  const values = {
    name: input.name,
    description: resolvePlainMentions(input.description ?? "", index),
    sessionId: input.sessionId ?? null,
    locationId: input.locationId ?? null,
    atTime: input.atTime ?? null,
    weather: input.weather ?? "",
    mood: input.mood ?? "",
    lighting: input.lighting ?? "",
    ambience: input.ambience ?? "",
    encounterId: input.encounterId ?? null,
    questId: input.questId ?? null,
    audioProfileId: input.audioProfileId ?? null,
    notes: input.notes ?? "",
    ...(input.status && { status: input.status }),
  };
  let row: Scene;
  if (sceneId) {
    const [r] = await db.update(scenes).set(values).where(and(eq(scenes.id, sceneId), eq(scenes.campaignId, campaignId))).returning();
    if (!r) throw new Error("Scene not found");
    row = r;
  } else {
    const [pos] = await db.select({ n: sql<number>`coalesce(max(${scenes.position}), -1) + 1` }).from(scenes).where(eq(scenes.campaignId, campaignId));
    const [r] = await db.insert(scenes).values({ ...values, campaignId, position: pos?.n ?? 0 }).returning();
    row = r!;
  }
  if (input.presentIds || input.threadIds) {
    await db.delete(sceneEntities).where(eq(sceneEntities.sceneId, row.id));
    const rows = [
      ...(input.presentIds ?? []).map((entityId) => ({ sceneId: row.id, entityId, role: "present" as const })),
      ...(input.threadIds ?? []).map((entityId) => ({ sceneId: row.id, entityId, role: "thread" as const })),
    ];
    if (rows.length) await db.insert(sceneEntities).values(rows).onConflictDoNothing();
  }
  await syncMentions(db, worldId, "scene", row.id, row.description, row.notes);
  return row;
}

export async function listScenes(db: DB, campaignId: string, sessionId?: string | null) {
  const rows = await db
    .select()
    .from(scenes)
    .where(and(eq(scenes.campaignId, campaignId), sessionId ? eq(scenes.sessionId, sessionId) : undefined))
    .orderBy(asc(scenes.position), asc(scenes.createdAt));
  if (!rows.length) return [];
  const ents = await db
    .select({ sceneId: sceneEntities.sceneId, role: sceneEntities.role, id: entities.id, name: entities.name, type: entities.type })
    .from(sceneEntities)
    .innerJoin(entities, eq(entities.id, sceneEntities.entityId))
    .where(inArray(sceneEntities.sceneId, rows.map((r) => r.id)));
  return rows.map((r) => ({ ...r, entities: ents.filter((e) => e.sceneId === r.id) }));
}

export type SceneWithEntities = Awaited<ReturnType<typeof listScenes>>[number];

export async function activateScene(db: DB, campaignId: string, sceneId: string | null) {
  if (sceneId) {
    await db.update(scenes).set({ status: "done" }).where(and(eq(scenes.campaignId, campaignId), eq(scenes.status, "active")));
    await db.update(scenes).set({ status: "active" }).where(and(eq(scenes.id, sceneId), eq(scenes.campaignId, campaignId)));
    const [s] = await db.select({ locationId: scenes.locationId }).from(scenes).where(eq(scenes.id, sceneId));
    await db
      .update(campaigns)
      .set({ activeSceneId: sceneId, ...(s?.locationId ? { currentLocationId: s.locationId } : {}) })
      .where(eq(campaigns.id, campaignId));
  } else {
    await db.update(campaigns).set({ activeSceneId: null }).where(eq(campaigns.id, campaignId));
  }
}

export async function deleteScene(db: DB, campaignId: string, sceneId: string) {
  await db.delete(scenes).where(and(eq(scenes.id, sceneId), eq(scenes.campaignId, campaignId)));
}
