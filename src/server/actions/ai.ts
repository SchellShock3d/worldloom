"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { z } from "zod";
import { authorizeCampaign, authorizeScope, authorizeWorld } from "@/server/auth/access";
import { requireUser } from "@/server/auth/session";
import { assertOwned } from "@/server/auth/ownership";
import { applyProposals, editProposal, rejectProposals } from "@/server/services/proposals";
import { advanceWorld, generateContent, loreAction, processSessionNotes, suggestConsequences, type LoreAction } from "@/server/ai/tasks/world-tasks";
import { EMERGENCY_KINDS, needSomethingNow, prepareSession, runContinuity, type EmergencyKind } from "@/server/ai/tasks/dm-tools";
import { getAIProvider, providerInfo } from "@/server/ai/provider";
import { durationToMinutes, type AdvanceUnit } from "@/lib/calendar";
import { loadWorldBundle } from "@/server/ai/context";
import { endSession } from "@/server/services/sessions";
import { userActor } from "@/server/services/history";
import { run } from "./_util";

const text = (max: number) => z.string().max(max, `Keep it under ${max} characters.`);

const refresh = (worldId: string) => revalidatePath(`/w/${worldId}`, "layout");

export async function aiStatusAction() {
  await requireUser();
  return providerInfo(await getAIProvider());
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export async function applyProposalsAction(worldId: string, batchId: string, ids: string[]) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const res = await applyProposals(db, worldId, batchId, ids, user.id);
    refresh(worldId);
    return res;
  });
}

export async function rejectProposalsAction(worldId: string, batchId: string, ids: string[]) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await rejectProposals(db, worldId, batchId, ids);
    refresh(worldId);
    return null;
  });
}

export async function editProposalAction(worldId: string, proposalId: string, payload: unknown) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await editProposal(db, worldId, proposalId, payload);
    refresh(worldId);
    return null;
  }, "Proposal updated");
}

// ---------------------------------------------------------------------------
// Tasks that create proposal batches
// ---------------------------------------------------------------------------

export async function generateAction(worldId: string, input: { request: string; type?: string | null; count?: number; locationId?: string | null; campaignId?: string | null }) {
  return run(async () => {
    const { user, campaignId } = await authorizeScope(worldId, input.campaignId, "editor");
    const request = text(4000).parse(input.request);
    if (!request.trim()) throw new Error("Describe what you'd like to create.");
    const count = input.count === undefined ? undefined : z.number().int().min(1).max(12).parse(input.count);
    const type = z.string().max(40).nullable().optional().parse(input.type);
    const db = await getDb();
    await assertOwned(db, worldId, { entities: [input.locationId] });
    const res = await generateContent({ db, worldId, campaignId, userId: user.id, request, type, count, locationId: input.locationId });
    refresh(worldId);
    return res;
  });
}

export async function processSessionAction(worldId: string, campaignId: string, sessionId: string, opts: { endSession?: boolean } = {}) {
  return run(async () => {
    const { user } = await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    if (opts.endSession) await endSession(db, worldId, campaignId, userActor(user.id), sessionId);
    const res = await processSessionNotes({ db, worldId, campaignId, userId: user.id, sessionId });
    refresh(worldId);
    return res;
  });
}

/** Advance a campaign's world (campaignId) or, with no campaign, the world itself. */
export async function advanceWorldAction(worldId: string, campaignId: string | null, input: { amount: number; unit: AdvanceUnit; note?: string }) {
  return run(async () => {
    const { user, calendar, world, campaignId: cid } = await authorizeScope(worldId, campaignId, "editor");
    const amount = z.number().int("Use a whole number of hours, days, weeks…").min(1, "Choose an amount between 1 and 1000.").max(1000, "Choose an amount between 1 and 1000.").parse(input.amount);
    const unit = z.enum(["minutes", "hours", "days", "weeks", "months", "years"]).parse(input.unit);
    const db = await getDb();
    const from = cid ? (await loadWorldBundle(db, worldId, cid)).now : world.currentAt;
    const minutes = durationToMinutes(calendar, amount, unit, from);
    const res = await advanceWorld({ db, worldId, campaignId: cid, userId: user.id, minutes, note: text(2000).optional().parse(input.note) });
    refresh(worldId);
    return res;
  });
}

export async function consequencesAction(worldId: string, input: { action: string; campaignId?: string | null; focusIds?: string[] }) {
  return run(async () => {
    const { user, campaignId } = await authorizeScope(worldId, input.campaignId, "editor");
    const action = text(4000).parse(input.action);
    if (!action.trim()) throw new Error("Describe what the players did.");
    const db = await getDb();
    const res = await suggestConsequences({ db, worldId, campaignId, userId: user.id, action, focusIds: z.array(z.string().uuid()).max(20).optional().parse(input.focusIds) });
    refresh(worldId);
    return res;
  });
}

export async function loreAction_(worldId: string, input: { entityId: string; action: LoreAction; guidance?: string; campaignId?: string | null }) {
  return run(async () => {
    const { user, campaignId } = await authorizeScope(worldId, input.campaignId, "editor");
    const action = z.enum(["expand", "summarize", "connect", "motivations", "secrets"]).parse(input.action);
    const db = await getDb();
    const res = await loreAction({ db, worldId, campaignId, userId: user.id, entityId: input.entityId, action, guidance: text(2000).optional().parse(input.guidance) });
    refresh(worldId);
    return res;
  });
}

// ---------------------------------------------------------------------------
// Read-only tools
// ---------------------------------------------------------------------------

export async function prepareSessionAction(worldId: string, campaignId: string, focus?: string) {
  return run(async () => {
    const { user } = await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    return prepareSession(db, { worldId, campaignId, userId: user.id, focus });
  });
}

export async function needSomethingAction(worldId: string, input: { kind: EmergencyKind; hint?: string; campaignId?: string | null }) {
  return run(async () => {
    const { campaignId } = await authorizeScope(worldId, input.campaignId, "editor");
    const db = await getDb();
    return needSomethingNow(db, { worldId, campaignId, kind: z.enum(EMERGENCY_KINDS).parse(input.kind), hint: text(500).optional().parse(input.hint) });
  });
}

export async function continuityAction(worldId: string, input: { campaignId?: string | null; deep?: boolean }) {
  return run(async () => {
    const { campaignId } = await authorizeScope(worldId, input.campaignId, "editor");
    const db = await getDb();
    return runContinuity(db, { worldId, campaignId, deep: !!input.deep });
  });
}
