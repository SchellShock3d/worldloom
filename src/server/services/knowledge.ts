/**
 * Knowledge: world truths (holder = null), what individual NPCs/factions/PCs
 * know or believe, and the player-facing projection of the world.
 */
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DB } from "@/server/db/client";
import { assertOwned } from "@/server/auth/ownership";
import { campaignEntityStates, entities, facts, type Fact } from "@/server/db/schema";
import { factInput, type FactInput, parsePatch } from "@/lib/validation";
import { diffRecords, recordRevision, type Actor } from "./history";

export async function createFact(db: DB, worldId: string, actor: Actor, raw: FactInput): Promise<Fact> {
  const input = factInput.parse(raw);
  await assertOwned(db, worldId, { entities: [input.holderId, input.subjectId, input.sourceEntityId], campaigns: [input.campaignId], facts: [input.truthRefId], sessions: [input.learnedSessionId] });
  const [row] = await db
    .insert(facts)
    .values({
      worldId,
      campaignId: input.campaignId ?? null,
      holderId: input.holderId ?? null,
      subjectId: input.subjectId ?? null,
      statement: input.statement,
      truthStatus: input.truthStatus,
      confidence: input.confidence,
      source: input.source,
      sourceEntityId: input.sourceEntityId ?? null,
      truthRefId: input.truthRefId ?? null,
      learnedAt: input.learnedAt ?? null,
      learnedSessionId: input.learnedSessionId ?? null,
      visibility: input.visibility,
    })
    .returning();
  let holderName = "World truth";
  if (row!.holderId) {
    const [h] = await db.select({ name: entities.name }).from(entities).where(eq(entities.id, row!.holderId));
    holderName = h?.name ?? "Someone";
  }
  await recordRevision(db, actor, {
    worldId,
    campaignId: row!.campaignId,
    targetKind: "fact",
    targetId: row!.id,
    targetLabel: holderName,
    action: "create",
    summary: `${holderName} ${row!.holderId ? (row!.truthStatus === "false" ? "believes" : "knows") : "records"}: “${row!.statement}”`,
    after: row as unknown as Record<string, unknown>,
  });
  return row!;
}

export async function updateFact(db: DB, worldId: string, actor: Actor, id: string, raw: Partial<FactInput>) {
  const [before] = await db.select().from(facts).where(and(eq(facts.id, id), eq(facts.worldId, worldId)));
  if (!before) throw new Error("Fact not found");
  const patch = parsePatch(factInput.partial(), raw);
  await assertOwned(db, worldId, { entities: [patch.holderId, patch.subjectId, patch.sourceEntityId], campaigns: [patch.campaignId], facts: [patch.truthRefId], sessions: [patch.learnedSessionId] });
  const [after] = await db.update(facts).set(patch).where(eq(facts.id, id)).returning();
  const d = diffRecords(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, Object.keys(patch));
  if (d.changed.length)
    await recordRevision(db, actor, { worldId, targetKind: "fact", targetId: id, targetLabel: before.statement.slice(0, 60), action: "update", summary: "Updated knowledge", before: d.before, after: d.after });
  return after!;
}

export async function deleteFact(db: DB, worldId: string, actor: Actor, id: string) {
  const [before] = await db.select().from(facts).where(and(eq(facts.id, id), eq(facts.worldId, worldId)));
  if (!before) throw new Error("Fact not found");
  await db.delete(facts).where(eq(facts.id, id));
  await recordRevision(db, actor, { worldId, targetKind: "fact", targetId: id, targetLabel: before.statement.slice(0, 60), action: "delete", summary: "Removed knowledge", before: before as unknown as Record<string, unknown> });
}

/** World truths (the DM ledger), optionally about a subject. */
export async function listTruths(db: DB, worldId: string, subjectId?: string) {
  const subject = alias(entities, "subject");
  return db
    .select({ fact: facts, subjectName: subject.name, subjectType: subject.type })
    .from(facts)
    .leftJoin(subject, eq(subject.id, facts.subjectId))
    .where(and(eq(facts.worldId, worldId), isNull(facts.holderId), subjectId ? eq(facts.subjectId, subjectId) : undefined))
    .orderBy(desc(facts.updatedAt));
}

/**
 * The knowledge boundary for roleplaying a character: only what this holder
 * knows or believes, plus what is common knowledge. World truths they don't
 * hold are never included.
 */
export async function getKnowledgeBoundary(db: DB, worldId: string, holderId: string, campaignId?: string | null) {
  const subject = alias(entities, "subject");
  const own = await db
    .select({ fact: facts, subjectName: subject.name })
    .from(facts)
    .leftJoin(subject, eq(subject.id, facts.subjectId))
    .where(
      and(
        eq(facts.worldId, worldId),
        eq(facts.holderId, holderId),
        campaignId ? or(isNull(facts.campaignId), eq(facts.campaignId, campaignId)) : isNull(facts.campaignId),
      ),
    )
    .orderBy(asc(facts.createdAt));
  // Group knowledge: facts held by factions this character belongs to (they'd plausibly know them).
  const groups = await db.execute(sql`
    select r.target_id as id from relationships r
    where r.source_id = ${holderId} and r.type in ('member_of', 'leads', 'serves') and r.world_id = ${worldId}
  `);
  const groupIds = (Array.isArray(groups) ? groups : (groups as { rows: { id: string }[] }).rows).map((g: { id: string }) => g.id);
  const viaGroups = groupIds.length
    ? await db
        .select({ fact: facts, subjectName: subject.name, holderName: entities.name })
        .from(facts)
        .innerJoin(entities, eq(entities.id, facts.holderId))
        .leftJoin(subject, eq(subject.id, facts.subjectId))
        .where(and(eq(facts.worldId, worldId), inArray(facts.holderId, groupIds), ne(facts.truthStatus, "unknown")))
    : [];
  return { own, viaGroups };
}

/** What the players know in a campaign: public entities + discovered ones. Never DM-only. */
export async function getPlayerKnownEntities(db: DB, worldId: string, campaignId: string) {
  return db
    .select({
      id: entities.id,
      name: entities.name,
      type: entities.type,
      summary: entities.summary,
      visibility: entities.visibility,
      knowledge: campaignEntityStates.knowledge,
    })
    .from(entities)
    .leftJoin(campaignEntityStates, and(eq(campaignEntityStates.entityId, entities.id), eq(campaignEntityStates.campaignId, campaignId)))
    .where(
      and(
        eq(entities.worldId, worldId),
        ne(entities.canonStatus, "archived"),
        or(isNull(entities.campaignId), eq(entities.campaignId, campaignId)),
        // public/discovered/partially known are visible to everyone; secrets only once this campaign discovered them.
        or(
          inArray(entities.visibility, ["public", "discovered", "partially_known"]),
          and(eq(entities.visibility, "secret"), inArray(campaignEntityStates.knowledge, ["rumoured", "partial", "discovered"])),
        ),
      ),
    )
    .orderBy(asc(entities.name));
}
