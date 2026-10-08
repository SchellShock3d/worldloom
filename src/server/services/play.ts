/** Campaign play records: consequences & promises, clues, notes. */
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DB } from "@/server/db/client";
import { campaigns, clueKnowers, clues, consequences, entities, notes, type Consequence } from "@/server/db/schema";
import { clueInput, consequenceInput, type ClueInput, type ConsequenceInput, parsePatch } from "@/lib/validation";
import { getNameIndex, recordRevision, syncMentions, type Actor } from "./history";
import { resolvePlainMentions } from "@/lib/mentions";

export async function createConsequence(db: DB, worldId: string, campaignId: string | null, actor: Actor, raw: ConsequenceInput): Promise<Consequence> {
  const input = consequenceInput.parse(raw);
  const index = await getNameIndex(db, worldId, campaignId);
  const description = resolvePlainMentions(input.description, index);
  const [row] = await db
    .insert(consequences)
    .values({
      worldId,
      campaignId,
      kind: input.kind,
      title: input.title,
      description,
      cause: input.cause,
      actorId: input.actorId ?? null,
      causeEventId: input.causeEventId ?? null,
      sessionId: input.sessionId ?? null,
      status: input.status,
      severity: input.severity,
      dueAt: input.dueAt ?? null,
    })
    .returning();
  await syncMentions(db, worldId, "consequence", row!.id, description, input.title);
  await recordRevision(db, actor, {
    worldId,
    campaignId,
    targetKind: "consequence",
    targetId: row!.id,
    targetLabel: row!.title,
    action: "create",
    summary: `${row!.kind === "promise" ? "Promise" : row!.kind === "reaction" ? "Pending reaction" : "Consequence"}: ${row!.title}`,
  });
  return row!;
}

export async function updateConsequence(db: DB, worldId: string, actor: Actor, id: string, patch: Partial<ConsequenceInput>) {
  const [before] = await db.select().from(consequences).where(and(eq(consequences.id, id), eq(consequences.worldId, worldId)));
  if (!before) throw new Error("Consequence not found");
  const p = parsePatch(consequenceInput.partial(), patch);
  const [after] = await db.update(consequences).set(p).where(eq(consequences.id, id)).returning();
  if (p.description !== undefined || p.title !== undefined) await syncMentions(db, worldId, "consequence", id, after!.description, after!.title);
  if (p.status && p.status !== before.status)
    await recordRevision(db, actor, {
      worldId,
      campaignId: before.campaignId,
      targetKind: "consequence",
      targetId: id,
      targetLabel: before.title,
      action: "update",
      summary: `${before.title}: ${before.status} → ${p.status}`,
      before: { status: before.status },
      after: { status: p.status },
    });
  return after!;
}

export async function deleteConsequence(db: DB, worldId: string, id: string) {
  await db.delete(consequences).where(and(eq(consequences.id, id), eq(consequences.worldId, worldId)));
}

export async function listConsequences(db: DB, worldId: string, campaignId?: string | null, statuses?: string[]) {
  const actorE = alias(entities, "actor");
  return db
    .select({ c: consequences, actorName: actorE.name, actorType: actorE.type })
    .from(consequences)
    .leftJoin(actorE, eq(actorE.id, consequences.actorId))
    .where(
      and(
        eq(consequences.worldId, worldId),
        campaignId ? or(isNull(consequences.campaignId), eq(consequences.campaignId, campaignId)) : undefined,
        statuses?.length ? inArray(consequences.status, statuses as never[]) : undefined,
      ),
    )
    .orderBy(asc(consequences.dueAt), desc(consequences.severity), desc(consequences.createdAt));
}

// ---------------------------------------------------------------------------
// Clues
// ---------------------------------------------------------------------------

export async function createClue(db: DB, worldId: string, campaignId: string | null, actor: Actor, raw: ClueInput) {
  const input = clueInput.parse(raw);
  const [row] = await db
    .insert(clues)
    .values({
      worldId,
      campaignId,
      mysteryId: input.mysteryId ?? null,
      questId: input.questId ?? null,
      description: input.description,
      locationId: input.locationId ?? null,
      sourceEntityId: input.sourceEntityId ?? null,
      sourceText: input.sourceText,
      isRedHerring: input.isRedHerring,
      discovered: input.discovered,
    })
    .returning();
  await syncMentions(db, worldId, "clue", row!.id, row!.description);
  await recordRevision(db, actor, { worldId, campaignId, targetKind: "clue", targetId: row!.id, targetLabel: row!.description.slice(0, 60), action: "create", summary: "Added a clue" });
  return row!;
}

export async function updateClue(db: DB, worldId: string, actor: Actor, id: string, patch: Partial<ClueInput>) {
  const [before] = await db.select().from(clues).where(and(eq(clues.id, id), eq(clues.worldId, worldId)));
  if (!before) throw new Error("Clue not found");
  const p = parsePatch(clueInput.partial(), patch);
  const [after] = await db.update(clues).set(p).where(eq(clues.id, id)).returning();
  if (p.description !== undefined) await syncMentions(db, worldId, "clue", id, after!.description);
  return after!;
}

export async function setClueDiscovered(db: DB, worldId: string, actor: Actor, clueId: string, discovered: boolean, opts: { sessionId?: string | null; knowerIds?: string[] } = {}) {
  const [before] = await db.select().from(clues).where(and(eq(clues.id, clueId), eq(clues.worldId, worldId)));
  if (!before) throw new Error("Clue not found");
  let at: number | null = null;
  if (discovered && before.campaignId) {
    const [c] = await db.select({ currentAt: campaigns.currentAt }).from(campaigns).where(eq(campaigns.id, before.campaignId));
    at = c?.currentAt ?? null;
  }
  await db
    .update(clues)
    .set({ discovered, discoveredAt: discovered ? at : null, discoveredSessionId: discovered ? (opts.sessionId ?? before.discoveredSessionId) : null })
    .where(eq(clues.id, clueId));
  if (opts.knowerIds) {
    await db.delete(clueKnowers).where(eq(clueKnowers.clueId, clueId));
    if (opts.knowerIds.length) await db.insert(clueKnowers).values(opts.knowerIds.map((entityId) => ({ clueId, entityId }))).onConflictDoNothing();
  }
  if (before.discovered !== discovered)
    await recordRevision(db, actor, {
      worldId,
      campaignId: before.campaignId,
      targetKind: "clue",
      targetId: clueId,
      targetLabel: before.description.slice(0, 60),
      action: "update",
      summary: discovered ? `Clue discovered: ${before.description.slice(0, 80)}` : "Clue marked undiscovered",
      before: { discovered: before.discovered },
      after: { discovered },
    });
}

export async function deleteClue(db: DB, worldId: string, id: string) {
  await db.delete(clues).where(and(eq(clues.id, id), eq(clues.worldId, worldId)));
}

export async function getClueKnowers(db: DB, clueIds: string[]) {
  if (!clueIds.length) return [];
  return db
    .select({ clueId: clueKnowers.clueId, id: entities.id, name: entities.name })
    .from(clueKnowers)
    .innerJoin(entities, eq(entities.id, clueKnowers.entityId))
    .where(inArray(clueKnowers.clueId, clueIds));
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function saveNote(db: DB, worldId: string, campaignId: string | null, userId: string, input: { id?: string; title: string; body: string; pinned?: boolean }) {
  const index = await getNameIndex(db, worldId, campaignId);
  const body = resolvePlainMentions(input.body, index);
  let id = input.id;
  if (id) {
    await db
      .update(notes)
      .set({ title: input.title, body, pinned: input.pinned ?? false })
      .where(and(eq(notes.id, id), eq(notes.worldId, worldId)));
  } else {
    const [row] = await db.insert(notes).values({ worldId, campaignId, title: input.title, body, pinned: input.pinned ?? false, createdBy: userId }).returning({ id: notes.id });
    id = row!.id;
  }
  await syncMentions(db, worldId, "note", id, body);
  return id;
}

export async function listNotes(db: DB, worldId: string, campaignId?: string | null) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.worldId, worldId), campaignId ? eq(notes.campaignId, campaignId) : isNull(notes.campaignId)))
    .orderBy(desc(notes.pinned), desc(notes.updatedAt));
}

export async function deleteNote(db: DB, worldId: string, id: string) {
  await db.delete(notes).where(and(eq(notes.id, id), eq(notes.worldId, worldId)));
}
