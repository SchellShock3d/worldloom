/**
 * Proposal batches: storage, review, and the execution engine that turns an
 * approved proposal into service calls. Every applied change records a
 * revision attributed to the AI *and* the approving DM.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import {
  campaigns,
  entities,
  entityMetrics,
  gameSessions,
  proposalBatches,
  proposals,
  relationships,
  travelPlans,
  type Proposal,
  type ProposalBatch,
  type ProposalSource,
} from "@/server/db/schema";
import { proposalPayloads, validateProposal, type EntityRefValue, type ProposalDraft, type ProposalKind } from "@/lib/proposals";
import { createEntity, updateEntity } from "./entities";
import { createRelationship, deleteRelationship } from "./relationships";
import { createEvent } from "./timeline";
import { createFact } from "./knowledge";
import { advanceThread, setQuestStatus, updateObjectives } from "./quests";
import { setCampaignEntityState, commitStateToCanon } from "./campaigns";
import { createConsequence, updateConsequence, setClueDiscovered, saveNote } from "./play";
import { updateSession } from "./sessions";
import { setCampaignTime } from "./clock";
import { assertOwned } from "@/server/auth/ownership";
import { recordRevision, type Actor } from "./history";
import { mentionToken } from "@/lib/mentions";

export interface BatchInput {
  worldId: string;
  campaignId?: string | null;
  source: ProposalSource;
  title: string;
  summary?: string;
  provider: string;
  fromAt?: number | null;
  toAt?: number | null;
  sessionId?: string | null;
  createdBy: string | null;
}

/**
 * Store a batch. Drafts that fail validation are dropped and reported, never
 * stored half-valid.
 */
export async function createBatch(db: DB, input: BatchInput, drafts: ProposalDraft[]) {
  const valid: { kind: ProposalKind; payload: Record<string, unknown>; rationale: string }[] = [];
  const rejected: { kind: string; error: string }[] = [];
  for (const d of drafts) {
    const v = validateProposal(d.kind, d.payload);
    if (v.ok) valid.push({ kind: d.kind, payload: v.payload, rationale: d.rationale ?? "" });
    else rejected.push({ kind: d.kind, error: v.error });
  }
  const [batch] = await db
    .insert(proposalBatches)
    .values({
      worldId: input.worldId,
      campaignId: input.campaignId ?? null,
      source: input.source,
      title: input.title,
      summary: input.summary ?? "",
      provider: input.provider,
      fromAt: input.fromAt ?? null,
      toAt: input.toAt ?? null,
      sessionId: input.sessionId ?? null,
      createdBy: input.createdBy,
      status: valid.length ? "pending" : "rejected",
    })
    .returning();
  if (valid.length) {
    await db.insert(proposals).values(valid.map((v, i) => ({ batchId: batch!.id, kind: v.kind, payload: v.payload, rationale: v.rationale, position: i })));
  }
  if (rejected.length && process.env.NODE_ENV !== "test") console.warn(`[proposals] dropped ${rejected.length} invalid drafts`, rejected.slice(0, 5));
  return { batch: batch!, accepted: valid.length, rejected };
}

export async function listBatches(db: DB, worldId: string, opts: { status?: ("pending" | "partial" | "applied" | "rejected")[]; campaignId?: string; limit?: number; source?: ProposalSource } = {}) {
  const rows = await db
    .select({
      batch: proposalBatches,
      total: sql<number>`count(${proposals.id})::int`,
      pending: sql<number>`count(${proposals.id}) filter (where ${proposals.status} = 'pending')::int`,
      applied: sql<number>`count(${proposals.id}) filter (where ${proposals.status} = 'applied')::int`,
    })
    .from(proposalBatches)
    .leftJoin(proposals, eq(proposals.batchId, proposalBatches.id))
    .where(
      and(
        eq(proposalBatches.worldId, worldId),
        opts.status?.length ? inArray(proposalBatches.status, opts.status) : undefined,
        opts.campaignId ? eq(proposalBatches.campaignId, opts.campaignId) : undefined,
        opts.source ? eq(proposalBatches.source, opts.source) : undefined,
      ),
    )
    .groupBy(proposalBatches.id)
    .orderBy(desc(proposalBatches.createdAt))
    .limit(opts.limit ?? 50);
  return rows;
}

export async function countPendingBatches(db: DB, worldId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(proposalBatches)
    .where(and(eq(proposalBatches.worldId, worldId), inArray(proposalBatches.status, ["pending", "partial"])));
  return r?.n ?? 0;
}

export async function getBatch(db: DB, worldId: string, batchId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) return null;
  const [batch] = await db.select().from(proposalBatches).where(and(eq(proposalBatches.id, batchId), eq(proposalBatches.worldId, worldId)));
  if (!batch) return null;
  const items = await db.select().from(proposals).where(eq(proposals.batchId, batchId)).orderBy(asc(proposals.position));
  return { batch, items };
}

export async function editProposal(db: DB, worldId: string, proposalId: string, payload: unknown) {
  const [p] = await db
    .select({ p: proposals })
    .from(proposals)
    .innerJoin(proposalBatches, eq(proposalBatches.id, proposals.batchId))
    .where(and(eq(proposals.id, proposalId), eq(proposalBatches.worldId, worldId)));
  if (!p) throw new Error("Proposal not found");
  if (p.p.status !== "pending") throw new Error("Only pending proposals can be edited.");
  const v = validateProposal(p.p.kind, payload);
  if (!v.ok) throw new Error(v.error);
  await db
    .update(proposals)
    .set({ payload: v.payload, originalPayload: p.p.originalPayload ?? p.p.payload })
    .where(eq(proposals.id, proposalId));
}

export async function rejectProposals(db: DB, worldId: string, batchId: string, ids: string[]) {
  const b = await getBatch(db, worldId, batchId);
  if (!b) throw new Error("Batch not found");
  const target = b.items.filter((i) => ids.includes(i.id) && i.status === "pending").map((i) => i.id);
  if (target.length) await db.update(proposals).set({ status: "rejected" }).where(inArray(proposals.id, target));
  await refreshBatchStatus(db, batchId);
}

async function refreshBatchStatus(db: DB, batchId: string) {
  const items = await db.select({ status: proposals.status }).from(proposals).where(eq(proposals.batchId, batchId));
  const pending = items.filter((i) => i.status === "pending").length;
  const applied = items.filter((i) => i.status === "applied").length;
  const status = pending === items.length ? "pending" : pending > 0 ? "partial" : applied > 0 ? "applied" : "rejected";
  await db
    .update(proposalBatches)
    .set({ status, resolvedAt: pending === 0 ? new Date() : null })
    .where(eq(proposalBatches.id, batchId));
  return status;
}

export interface ApplyResult {
  applied: number;
  failed: { id: string; error: string }[];
}

/**
 * Apply selected proposals in batch order inside one transaction per proposal
 * (so a single failure doesn't roll back the rest). `refs` created earlier in
 * the batch resolve for later proposals, including ones applied in a previous
 * call.
 */
export async function applyProposals(db: DB, worldId: string, batchId: string, ids: string[], approverId: string): Promise<ApplyResult> {
  const b = await getBatch(db, worldId, batchId);
  if (!b) throw new Error("Batch not found");
  const refMap = new Map<string, string>();
  for (const item of b.items) {
    for (const r of item.resultRefs) if (r.label?.startsWith("ref:")) refMap.set(r.label.slice(4), r.id);
  }
  const result: ApplyResult = { applied: 0, failed: [] };
  for (const item of b.items) {
    if (!ids.includes(item.id) || item.status !== "pending") continue;
    try {
      const refs = await db.transaction(async (tx) => {
        // Claim the proposal first so a double-click or a second reviewer can't apply it twice.
        const claimed = await tx
          .update(proposals)
          .set({ status: "applied", appliedAt: new Date(), appliedBy: approverId, error: null })
          .where(and(eq(proposals.id, item.id), eq(proposals.status, "pending")))
          .returning({ id: proposals.id });
        if (!claimed.length) return null;
        const actor: Actor = { type: "ai", userId: approverId, proposalId: item.id };
        const out = await applyOne(tx, { worldId, campaignId: b.batch.campaignId, sessionId: b.batch.sessionId, actor, refMap }, item);
        await tx.update(proposals).set({ resultRefs: out }).where(eq(proposals.id, item.id));
        return out;
      });
      if (!refs) continue; // already applied or rejected elsewhere
      for (const r of refs) if (r.label?.startsWith("ref:")) refMap.set(r.label.slice(4), r.id);
      result.applied++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(proposals).set({ error: msg }).where(eq(proposals.id, item.id));
      result.failed.push({ id: item.id, error: msg });
    }
  }
  await refreshBatchStatus(db, batchId);
  return result;
}

interface ApplyCtx {
  worldId: string;
  campaignId: string | null;
  sessionId: string | null;
  actor: Actor;
  refMap: Map<string, string>;
}

function resolveRef(ctx: ApplyCtx, r: EntityRefValue | null | undefined): string | null {
  if (!r) return null;
  if (r.id) return r.id;
  if (r.ref) {
    const id = ctx.refMap.get(r.ref);
    if (!id) throw new Error(`“${r.name ?? r.ref}” must be approved first (it's created by another proposal in this batch).`);
    return id;
  }
  return null;
}

function requireCampaign(ctx: ApplyCtx) {
  if (!ctx.campaignId) throw new Error("This change needs a campaign.");
  return ctx.campaignId;
}

async function campaignNow(db: DB, ctx: ApplyCtx) {
  if (!ctx.campaignId) return null;
  const [c] = await db.select({ currentAt: campaigns.currentAt }).from(campaigns).where(eq(campaigns.id, ctx.campaignId));
  return c?.currentAt ?? null;
}

type Ref = { kind: string; id: string; label?: string };

async function applyOne(db: DB, ctx: ApplyCtx, item: Proposal): Promise<Ref[]> {
  const kind = item.kind as ProposalKind;
  const raw = item.payload;
  switch (kind) {
    case "create_entity": {
      const p = proposalPayloads.create_entity.parse(raw);
      const e = await createEntity(db, ctx.worldId, ctx.actor, {
        ...p.entity,
        // Campaign-scoped types automatically attach to the batch's campaign.
        campaignId: p.entity.campaignId ?? (["pc"].includes(p.entity.type) ? ctx.campaignId : null),
      });
      return [{ kind: "entity", id: e.id, label: p.ref ? `ref:${p.ref}` : e.name }];
    }
    case "update_entity": {
      const p = proposalPayloads.update_entity.parse(raw);
      const targetId = resolveRef(ctx, p.target)!;
      const [current] = await db.select().from(entities).where(and(eq(entities.id, targetId), eq(entities.worldId, ctx.worldId)));
      if (!current) throw new Error("Entity no longer exists.");
      const patch: Parameters<typeof updateEntity>[4] = {};
      if (p.summary !== undefined) patch.summary = p.summary;
      if (p.appendBody) patch.body = current.body ? `${current.body.trimEnd()}\n\n${p.appendBody}` : p.appendBody;
      if (p.status !== undefined) patch.status = p.status;
      if (p.location !== undefined) patch.locationId = resolveRef(ctx, p.location);
      if (p.fields) patch.fields = { ...current.fields, ...p.fields };
      if (p.importance !== undefined) patch.importance = p.importance;
      if (p.visibility !== undefined) patch.visibility = p.visibility;
      await updateEntity(db, ctx.worldId, ctx.actor, targetId, patch);
      return [{ kind: "entity", id: targetId, label: current.name }];
    }
    case "create_relationship": {
      const p = proposalPayloads.create_relationship.parse(raw);
      const r = await createRelationship(db, ctx.worldId, ctx.actor, {
        sourceId: resolveRef(ctx, p.source)!,
        targetId: resolveRef(ctx, p.target)!,
        type: p.type,
        description: p.description,
        strength: p.strength ?? null,
        campaignId: p.campaignScoped ? ctx.campaignId : null,
      });
      return [{ kind: "relationship", id: r.id }];
    }
    case "end_relationship": {
      const p = proposalPayloads.end_relationship.parse(raw);
      const [rel] = await db.select().from(relationships).where(and(eq(relationships.id, p.relationshipId), eq(relationships.worldId, ctx.worldId)));
      if (!rel) throw new Error("Relationship no longer exists.");
      await deleteRelationship(db, ctx.worldId, ctx.actor, p.relationshipId);
      return [];
    }
    case "create_event": {
      const p = proposalPayloads.create_event.parse(raw);
      const e = await createEvent(db, ctx.worldId, ctx.actor, {
        title: p.title,
        summary: p.summary,
        kind: p.kind,
        startAt: p.startAt,
        endAt: p.endAt ?? null,
        locationId: resolveRef(ctx, p.location ?? null),
        involvedIds: p.involved.map((r) => resolveRef(ctx, r)!).filter(Boolean),
        campaignId: p.campaignScoped ? ctx.campaignId : null,
        sessionId: ctx.sessionId,
        visibility: p.visibility,
        origin: "ai",
      });
      return [{ kind: "entity", id: e.id, label: p.ref ? `ref:${p.ref}` : e.name }];
    }
    case "update_thread": {
      const p = proposalPayloads.update_thread.parse(raw);
      const threadId = resolveRef(ctx, p.thread)!;
      const now = await campaignNow(db, ctx);
      await advanceThread(db, ctx.worldId, ctx.actor, threadId, { progress: p.progress, progressDelta: p.progressDelta, status: p.status, nextMilestone: p.nextMilestone }, now);
      return [{ kind: "entity", id: threadId }];
    }
    case "create_rumour": {
      const p = proposalPayloads.create_rumour.parse(raw);
      const now = await campaignNow(db, ctx);
      const e = await createEntity(db, ctx.worldId, ctx.actor, {
        type: "rumour",
        name: p.title,
        summary: p.claim,
        visibility: "public",
        rumour: { claim: p.claim, truth: p.truth, accuracy: p.accuracy, distortion: p.distortion, originEventId: resolveRef(ctx, p.originEvent ?? null), startedAt: now },
      });
      for (const loc of p.circulatesIn) {
        await createRelationship(db, ctx.worldId, ctx.actor, { sourceId: e.id, targetId: resolveRef(ctx, loc)!, type: "circulates_in" }).catch(() => undefined);
      }
      for (const s of p.spreadBy) {
        await createRelationship(db, ctx.worldId, ctx.actor, { sourceId: resolveRef(ctx, s)!, targetId: e.id, type: "spreads" }).catch(() => undefined);
      }
      return [{ kind: "entity", id: e.id, label: p.ref ? `ref:${p.ref}` : e.name }];
    }
    case "create_fact": {
      const p = proposalPayloads.create_fact.parse(raw);
      const now = await campaignNow(db, ctx);
      const f = await createFact(db, ctx.worldId, ctx.actor, {
        holderId: resolveRef(ctx, p.holder ?? null),
        subjectId: resolveRef(ctx, p.subject ?? null),
        statement: p.statement,
        truthStatus: p.truthStatus,
        confidence: p.confidence,
        source: p.source,
        campaignId: p.campaignScoped ? ctx.campaignId : null,
        learnedAt: p.holder ? now : null,
        learnedSessionId: p.holder ? ctx.sessionId : null,
      });
      return [{ kind: "fact", id: f.id }];
    }
    case "quest_update": {
      const p = proposalPayloads.quest_update.parse(raw);
      const questId = resolveRef(ctx, p.quest)!;
      if (p.objectives.length || p.addObjectives.length) await updateObjectives(db, ctx.worldId, ctx.actor, questId, p.objectives, p.addObjectives);
      if (p.status) await setQuestStatus(db, ctx.worldId, ctx.actor, questId, p.status, await campaignNow(db, ctx));
      return [{ kind: "entity", id: questId }];
    }
    case "campaign_state": {
      const p = proposalPayloads.campaign_state.parse(raw);
      const campaignId = requireCampaign(ctx);
      const entityId = resolveRef(ctx, p.entity)!;
      let reputation: number | undefined;
      if (p.reputationDelta !== undefined) {
        const [cur] = await db.execute(sql`select reputation from campaign_entity_states where campaign_id = ${campaignId} and entity_id = ${entityId}`).then((r) => (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as { reputation: number | null }[]);
        reputation = Math.max(-100, Math.min(100, (cur?.reputation ?? 0) + p.reputationDelta));
      }
      await setCampaignEntityState(db, ctx.worldId, campaignId, ctx.actor, {
        entityId,
        ...(p.status !== undefined && { status: p.status }),
        ...(p.location !== undefined && { locationId: resolveRef(ctx, p.location) }),
        ...(reputation !== undefined && { reputation }),
        ...(p.attitude !== undefined && { attitude: p.attitude }),
        ...(p.knowledge !== undefined && { knowledge: p.knowledge }),
      });
      if (p.commitToCanon && (p.status !== undefined || p.location !== undefined)) await commitStateToCanon(db, ctx.worldId, campaignId, ctx.actor, entityId);
      return [{ kind: "entity", id: entityId }];
    }
    case "metric_change": {
      const p = proposalPayloads.metric_change.parse(raw);
      const entityId = resolveRef(ctx, p.entity)!;
      const [ent] = await db.select({ name: entities.name }).from(entities).where(and(eq(entities.id, entityId), eq(entities.worldId, ctx.worldId)));
      if (!ent) throw new Error("Entity no longer exists.");
      const key = p.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const [cur] = await db.select().from(entityMetrics).where(and(eq(entityMetrics.entityId, entityId), eq(entityMetrics.key, key)));
      const before = cur?.value ?? 50;
      const value = Math.max(cur?.min ?? 0, Math.min(cur?.max ?? 100, before + p.delta));
      await db
        .insert(entityMetrics)
        .values({ worldId: ctx.worldId, entityId, key, label: p.label, value })
        .onConflictDoUpdate({ target: [entityMetrics.entityId, entityMetrics.key], set: { value } });
      await recordRevision(db, ctx.actor, {
        worldId: ctx.worldId,
        campaignId: ctx.campaignId,
        targetKind: "metric",
        targetId: entityId,
        targetLabel: `${ent.name}: ${p.label}`,
        action: "update",
        summary: `${ent.name} ${p.label} ${p.delta > 0 ? "↑" : "↓"} (${before} → ${value})${p.reason ? `: ${p.reason}` : ""}`,
        before: { value: before },
        after: { value },
      });
      return [{ kind: "metric", id: entityId, label: p.label }];
    }
    case "create_consequence": {
      const p = proposalPayloads.create_consequence.parse(raw);
      const c = await createConsequence(db, ctx.worldId, ctx.campaignId, ctx.actor, {
        kind: p.kind,
        title: p.title,
        description: p.description,
        cause: p.cause,
        actorId: resolveRef(ctx, p.actor ?? null),
        sessionId: ctx.sessionId,
        severity: p.severity,
        dueAt: p.dueAt ?? null,
      });
      return [{ kind: "consequence", id: c.id }];
    }
    case "consequence_update": {
      const p = proposalPayloads.consequence_update.parse(raw);
      await updateConsequence(db, ctx.worldId, ctx.actor, p.consequenceId, { status: p.status });
      return [{ kind: "consequence", id: p.consequenceId }];
    }
    case "clue_update": {
      const p = proposalPayloads.clue_update.parse(raw);
      await setClueDiscovered(db, ctx.worldId, ctx.actor, p.clueId, p.discovered, { sessionId: ctx.sessionId });
      return [{ kind: "clue", id: p.clueId }];
    }
    case "session_recap": {
      const p = proposalPayloads.session_recap.parse(raw);
      const campaignId = requireCampaign(ctx);
      const [s] = await db.select().from(gameSessions).where(and(eq(gameSessions.id, p.sessionId), eq(gameSessions.campaignId, campaignId)));
      if (!s) throw new Error("Session not found");
      await updateSession(db, ctx.worldId, campaignId, p.sessionId, { recap: p.recap, status: "processed" });
      await recordRevision(db, ctx.actor, { worldId: ctx.worldId, campaignId, targetKind: "session", targetId: s.id, targetLabel: `Session ${s.number}`, action: "update", summary: `Recap written for session ${s.number}` });
      return [{ kind: "session", id: s.id }];
    }
    case "party_inventory": {
      const p = proposalPayloads.party_inventory.parse(raw);
      const campaignId = requireCampaign(ctx);
      const [c] = await db.select({ inv: campaigns.partyInventory }).from(campaigns).where(eq(campaigns.id, campaignId));
      let lines = (c?.inv ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
      for (const r of p.remove) lines = lines.filter((l) => !l.replace(/^[-*]\s*/, "").toLowerCase().includes(r.toLowerCase()));
      for (const a of p.add) lines.push(`- ${a}`);
      await db.update(campaigns).set({ partyInventory: lines.join("\n") }).where(eq(campaigns.id, campaignId));
      await recordRevision(db, ctx.actor, {
        worldId: ctx.worldId,
        campaignId,
        targetKind: "campaign",
        targetId: campaignId,
        targetLabel: "Party inventory",
        action: "update",
        summary: [p.add.length ? `+ ${p.add.join(", ")}` : "", p.remove.length ? `− ${p.remove.join(", ")}` : ""].filter(Boolean).join("; "),
      });
      return [{ kind: "campaign", id: campaignId }];
    }
    case "advance_clock": {
      const p = proposalPayloads.advance_clock.parse(raw);
      const campaignId = requireCampaign(ctx);
      const arrivals = p.arrivals ?? [];
      // Move the party first so the new weather reflects where they end up.
      const last = [...arrivals].reverse().find((x) => x.destinationId);
      if (last?.destinationId) {
        await assertOwned(db, ctx.worldId, { entities: [last.destinationId] });
        await db.update(campaigns).set({ currentLocationId: last.destinationId }).where(eq(campaigns.id, campaignId));
      }
      await setCampaignTime(db, ctx.worldId, campaignId, ctx.actor, p.toAt, arrivals.length ? `Advance world; the party arrives at ${arrivals.map((x) => x.name).join(", ")}` : "Advance world");
      for (const x of arrivals) {
        await db
          .update(travelPlans)
          .set({ status: "arrived", arrivedAt: p.toAt })
          .where(and(eq(travelPlans.id, x.travelId), eq(travelPlans.campaignId, campaignId), eq(travelPlans.worldId, ctx.worldId)));
      }
      return [{ kind: "campaign", id: campaignId }];
    }
    case "create_note": {
      const p = proposalPayloads.create_note.parse(raw);
      const id = await saveNote(db, ctx.worldId, ctx.campaignId, ctx.actor.userId!, { title: p.title, body: p.body });
      return [{ kind: "note", id }];
    }
  }
}

/** Build a ref that points at an existing entity, for drafts. */
export const existing = (id: string, name?: string): EntityRefValue => ({ id, name });
export const pending = (ref: string, name?: string): EntityRefValue => ({ ref, name });
export { mentionToken };

export type BatchWithItems = NonNullable<Awaited<ReturnType<typeof getBatch>>>;
export type { ProposalBatch };
