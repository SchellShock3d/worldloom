import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DB } from "@/server/db/client";
import { campaigns, clues, entities, mysteries, questObjectives, quests, threadStages, worldThreads, type QuestStatus } from "@/server/db/schema";
import { recordRevision, type Actor } from "./history";

export async function listQuests(db: DB, worldId: string, campaignId?: string | null, statuses?: QuestStatus[]) {
  const giver = alias(entities, "giver");
  const rows = await db
    .select({
      id: entities.id,
      name: entities.name,
      summary: entities.summary,
      campaignId: entities.campaignId,
      visibility: entities.visibility,
      updatedAt: entities.updatedAt,
      status: quests.status,
      priority: quests.priority,
      giverId: quests.giverId,
      giverName: giver.name,
      rewards: quests.rewards,
      threadId: quests.threadId,
    })
    .from(quests)
    .innerJoin(entities, eq(entities.id, quests.entityId))
    .leftJoin(giver, eq(giver.id, quests.giverId))
    .where(
      and(
        eq(entities.worldId, worldId),
        ne(entities.canonStatus, "archived"),
        campaignId ? or(isNull(entities.campaignId), eq(entities.campaignId, campaignId)) : undefined,
        statuses?.length ? inArray(quests.status, statuses) : undefined,
      ),
    )
    .orderBy(desc(quests.priority), desc(entities.updatedAt));
  if (!rows.length) return [];
  const objs = await db.select().from(questObjectives).where(inArray(questObjectives.questId, rows.map((r) => r.id))).orderBy(asc(questObjectives.position));
  return rows.map((r) => ({ ...r, objectives: objs.filter((o) => o.questId === r.id) }));
}

export type QuestListItem = Awaited<ReturnType<typeof listQuests>>[number];

export async function setQuestStatus(db: DB, worldId: string, actor: Actor, questId: string, status: QuestStatus, at?: number | null) {
  const [row] = await db
    .select({ status: quests.status, name: entities.name, campaignId: entities.campaignId })
    .from(quests)
    .innerJoin(entities, eq(entities.id, quests.entityId))
    .where(and(eq(quests.entityId, questId), eq(entities.worldId, worldId)));
  if (!row) throw new Error("Quest not found");
  if (row.status === status) return;
  await db
    .update(quests)
    .set({ status, completedAt: ["completed", "failed", "abandoned"].includes(status) ? (at ?? null) : null })
    .where(eq(quests.entityId, questId));
  await db.update(entities).set({ updatedAt: new Date() }).where(eq(entities.id, questId));
  await recordRevision(db, actor, {
    worldId,
    campaignId: row.campaignId,
    targetKind: "entity",
    targetId: questId,
    targetLabel: row.name,
    action: "update",
    summary: `Quest ${status === "active" ? "started" : status}: ${row.name}`,
    before: { status: row.status },
    after: { status },
  });
}

export async function updateObjectives(
  db: DB,
  worldId: string,
  actor: Actor,
  questId: string,
  changes: { text: string; status: "open" | "done" | "failed" }[],
  additions: string[] = [],
) {
  const [q] = await db.select({ name: entities.name, campaignId: entities.campaignId }).from(entities).where(and(eq(entities.id, questId), eq(entities.worldId, worldId)));
  if (!q) throw new Error("Quest not found");
  const existing = await db.select().from(questObjectives).where(eq(questObjectives.questId, questId)).orderBy(asc(questObjectives.position));
  const changed: string[] = [];
  for (const c of changes) {
    const match = existing.find((o) => o.text.trim().toLowerCase() === c.text.trim().toLowerCase()) ?? existing.find((o) => similar(o.text, c.text));
    if (match && match.status !== c.status) {
      await db.update(questObjectives).set({ status: c.status }).where(eq(questObjectives.id, match.id));
      changed.push(`${match.text} → ${c.status}`);
    }
  }
  let pos = existing.length;
  for (const text of additions) {
    if (existing.some((o) => o.text.toLowerCase() === text.toLowerCase())) continue;
    await db.insert(questObjectives).values({ questId, text, position: pos++ });
    changed.push(`+ ${text}`);
  }
  if (changed.length)
    await recordRevision(db, actor, {
      worldId,
      campaignId: q.campaignId,
      targetKind: "entity",
      targetId: questId,
      targetLabel: q.name,
      action: "update",
      summary: `Objectives: ${changed.join("; ")}`,
    });
  return changed;
}

function similar(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").filter((w) => w.length > 3);
  const A = new Set(norm(a));
  const B = norm(b);
  if (!A.size || !B.length) return false;
  return B.filter((w) => A.has(w)).length / Math.max(A.size, B.length) >= 0.6;
}

export async function toggleObjective(db: DB, worldId: string, objectiveId: string, status: "open" | "done" | "failed") {
  const [o] = await db
    .select({ id: questObjectives.id })
    .from(questObjectives)
    .innerJoin(entities, eq(entities.id, questObjectives.questId))
    .where(and(eq(questObjectives.id, objectiveId), eq(entities.worldId, worldId)));
  if (!o) throw new Error("Objective not found");
  await db.update(questObjectives).set({ status }).where(eq(questObjectives.id, objectiveId));
}

// ---------------------------------------------------------------------------
// World threads
// ---------------------------------------------------------------------------

export async function listThreads(db: DB, worldId: string, opts: { statuses?: string[] } = {}) {
  const rows = await db
    .select({
      id: entities.id,
      name: entities.name,
      summary: entities.summary,
      visibility: entities.visibility,
      importance: entities.importance,
      updatedAt: entities.updatedAt,
      locationId: entities.locationId,
      thread: worldThreads,
    })
    .from(worldThreads)
    .innerJoin(entities, eq(entities.id, worldThreads.entityId))
    .where(
      and(
        eq(entities.worldId, worldId),
        ne(entities.canonStatus, "archived"),
        opts.statuses?.length ? inArray(worldThreads.status, opts.statuses as never[]) : undefined,
      ),
    )
    .orderBy(sql`case ${worldThreads.status} when 'escalating' then 0 when 'active' then 1 when 'paused' then 2 when 'dormant' then 3 else 4 end`, desc(worldThreads.urgency), desc(worldThreads.progress));
  if (!rows.length) return [];
  const stages = await db.select().from(threadStages).where(inArray(threadStages.threadId, rows.map((r) => r.id))).orderBy(asc(threadStages.position));
  const actors = await db.execute(sql`
    select r.source_id as thread_id, r.target_id as id, e.name, e.type, 'involves' as role from relationships r join entities e on e.id = r.target_id
      where r.type = 'involves' and r.source_id in (${sql.join(rows.map((r) => sql`${r.id}`), sql`, `)})
    union all
    select r.target_id as thread_id, r.source_id as id, e.name, e.type, 'drives' as role from relationships r join entities e on e.id = r.source_id
      where r.type = 'drives' and r.target_id in (${sql.join(rows.map((r) => sql`${r.id}`), sql`, `)})
  `);
  const actorRows = (Array.isArray(actors) ? actors : (actors as { rows: unknown[] }).rows) as { thread_id: string; id: string; name: string; type: string; role: string }[];
  return rows.map((r) => ({
    ...r,
    stages: stages.filter((s) => s.threadId === r.id),
    actors: actorRows.filter((a) => a.thread_id === r.id).map((a) => ({ id: a.id, name: a.name, type: a.type, role: a.role })),
  }));
}

export type ThreadListItem = Awaited<ReturnType<typeof listThreads>>[number];

export interface ThreadChange {
  progress?: number;
  progressDelta?: number;
  status?: "dormant" | "active" | "escalating" | "resolved" | "failed" | "paused";
  stageIndex?: number;
  nextMilestone?: string;
  nextMilestoneAt?: number | null;
  urgency?: number;
}

/** Move a thread; reaching a stage boundary stamps the stage with the in-world time. */
export async function advanceThread(db: DB, worldId: string, actor: Actor, threadId: string, change: ThreadChange, at?: number | null) {
  const [row] = await db
    .select({ t: worldThreads, name: entities.name })
    .from(worldThreads)
    .innerJoin(entities, eq(entities.id, worldThreads.entityId))
    .where(and(eq(worldThreads.entityId, threadId), eq(entities.worldId, worldId)));
  if (!row) throw new Error("World thread not found");
  const before = row.t;
  let progress = change.progress ?? before.progress + (change.progressDelta ?? 0);
  progress = Math.max(0, Math.min(100, Math.round(progress)));
  const stages = await db.select().from(threadStages).where(eq(threadStages.threadId, threadId)).orderBy(asc(threadStages.position));
  let stageIndex = change.stageIndex ?? before.stageIndex;
  if (change.stageIndex === undefined && stages.length > 1) {
    // Stages divide the 0–100 track evenly.
    const computed = Math.min(stages.length - 1, Math.floor((progress / 100) * stages.length));
    stageIndex = Math.max(stageIndex, computed);
  }
  let status = change.status ?? before.status;
  if (!change.status && progress >= 100 && !["resolved", "failed"].includes(status)) status = "resolved";
  const patch = {
    progress,
    stageIndex,
    status,
    ...(change.nextMilestone !== undefined && { nextMilestone: change.nextMilestone }),
    ...(change.nextMilestoneAt !== undefined && { nextMilestoneAt: change.nextMilestoneAt }),
    ...(change.urgency !== undefined && { urgency: change.urgency }),
    lastAdvancedAt: at ?? before.lastAdvancedAt,
  };
  await db.update(worldThreads).set(patch).where(eq(worldThreads.entityId, threadId));
  for (const s of stages) {
    if (s.position <= stageIndex && s.reachedAt === null && at !== undefined && at !== null) {
      await db.update(threadStages).set({ reachedAt: at }).where(eq(threadStages.id, s.id));
    }
  }
  await db.update(entities).set({ updatedAt: new Date() }).where(eq(entities.id, threadId));
  const parts: string[] = [];
  if (progress !== before.progress) parts.push(`progress ${before.progress}% → ${progress}%`);
  if (status !== before.status) parts.push(`${before.status} → ${status}`);
  if (stageIndex !== before.stageIndex && stages[stageIndex]) parts.push(`reached “${stages[stageIndex]!.title}”`);
  await recordRevision(db, actor, {
    worldId,
    targetKind: "thread",
    targetId: threadId,
    targetLabel: row.name,
    action: "update",
    summary: `${row.name}: ${parts.join(", ") || "updated"}`,
    before: { progress: before.progress, status: before.status, stageIndex: before.stageIndex },
    after: { progress, status, stageIndex },
  });
  return { before, after: { ...before, ...patch }, stage: stages[stageIndex] ?? null };
}

// ---------------------------------------------------------------------------
// Mysteries & clues
// ---------------------------------------------------------------------------

export async function listMysteries(db: DB, worldId: string, campaignId?: string | null) {
  const rows = await db
    .select({ id: entities.id, name: entities.name, summary: entities.summary, campaignId: entities.campaignId, mystery: mysteries, updatedAt: entities.updatedAt })
    .from(mysteries)
    .innerJoin(entities, eq(entities.id, mysteries.entityId))
    .where(and(eq(entities.worldId, worldId), ne(entities.canonStatus, "archived"), campaignId ? or(isNull(entities.campaignId), eq(entities.campaignId, campaignId)) : undefined))
    .orderBy(desc(entities.updatedAt));
  if (!rows.length) return [];
  const cl = await db
    .select()
    .from(clues)
    .where(and(eq(clues.worldId, worldId), inArray(clues.mysteryId, rows.map((r) => r.id)), campaignId ? or(isNull(clues.campaignId), eq(clues.campaignId, campaignId)) : undefined))
    .orderBy(asc(clues.position), asc(clues.createdAt));
  return rows.map((r) => ({ ...r, clues: cl.filter((c) => c.mysteryId === r.id) }));
}

export type MysteryListItem = Awaited<ReturnType<typeof listMysteries>>[number];

export async function campaignTime(db: DB, campaignId: string) {
  const [c] = await db.select({ currentAt: campaigns.currentAt }).from(campaigns).where(eq(campaigns.id, campaignId));
  return c?.currentAt ?? null;
}
