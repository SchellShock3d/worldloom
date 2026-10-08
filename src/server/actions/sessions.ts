"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { authorizeCampaign } from "@/server/auth/access";
import { userActor } from "@/server/services/history";
import { activateScene, createSession, deleteScene, deleteSession, endSession, saveScene, startSession, updateSession, type SceneInput } from "@/server/services/sessions";
import { setCampaignTime } from "@/server/services/clock";
import { processSessionNotes } from "@/server/ai/tasks/world-tasks";
import { durationToMinutes, type AdvanceUnit } from "@/lib/calendar";
import { run } from "./_util";

const refresh = (worldId: string) => revalidatePath(`/w/${worldId}`, "layout");

export async function createSessionAction(worldId: string, campaignId: string, input: { title?: string; scheduledFor?: string | null } = {}) {
  return run(async () => {
    const { user } = await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    const s = await createSession(db, worldId, campaignId, userActor(user.id), { title: input.title, scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null });
    refresh(worldId);
    return { id: s.id, number: s.number };
  });
}

export async function startSessionAction(worldId: string, campaignId: string, sessionId?: string) {
  return run(async () => {
    const { user } = await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    const actor = userActor(user.id);
    const id = sessionId ?? (await createSession(db, worldId, campaignId, actor)).id;
    const s = await startSession(db, worldId, campaignId, actor, id);
    refresh(worldId);
    return { id: s.id };
  });
}

const sessionPatch = z.object({
  title: z.string().max(200).optional(),
  notes: z.string().max(500000).optional(),
  recap: z.string().max(100000).optional(),
  prep: z.string().max(200000).optional(),
  scheduledFor: z.string().nullable().optional(),
  status: z.enum(["planned", "in_progress", "completed", "processed"]).optional(),
});

export async function updateSessionAction(worldId: string, campaignId: string, sessionId: string, raw: z.input<typeof sessionPatch>) {
  return run(async () => {
    await authorizeCampaign(worldId, campaignId, "editor");
    const p = sessionPatch.parse(raw);
    const db = await getDb();
    const { scheduledFor, ...rest } = p;
    await updateSession(db, worldId, campaignId, sessionId, { ...rest, ...(scheduledFor !== undefined && { scheduledFor: scheduledFor ? new Date(scheduledFor) : null }) });
    // Notes autosave shouldn't revalidate the whole world on every keystroke.
    if (p.notes === undefined || Object.keys(p).length > 1) refresh(worldId);
    return null;
  });
}

/** End Session workflow: close the session and have the AI propose updates from the notes. */
export async function endSessionAction(worldId: string, campaignId: string, sessionId: string, opts: { process: boolean }) {
  return run(async () => {
    const { user } = await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    const s = await endSession(db, worldId, campaignId, userActor(user.id), sessionId);
    let batchId: string | null = null;
    let accepted = 0;
    if (opts.process && s.notes.trim()) {
      const res = await processSessionNotes({ db, worldId, campaignId, userId: user.id, sessionId });
      batchId = res.batchId;
      accepted = res.accepted;
    }
    refresh(worldId);
    return { batchId, accepted };
  });
}

export async function deleteSessionAction(worldId: string, campaignId: string, sessionId: string) {
  return run(async () => {
    await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    await deleteSession(db, campaignId, sessionId);
    refresh(worldId);
    return null;
  });
}

/** Small clock moves during play (minutes to a day). Longer spans go through Advance World. */
export async function quickAdvanceAction(worldId: string, campaignId: string, amount: number, unit: AdvanceUnit) {
  return run(async () => {
    const { user, campaign, calendar } = await authorizeCampaign(worldId, campaignId, "editor");
    const minutes = durationToMinutes(calendar, amount, unit, campaign.currentAt);
    if (minutes <= 0) throw new Error("Choose a positive amount.");
    if (minutes > durationToMinutes(calendar, 2, "days")) throw new Error("For more than two days, use Advance World so the world can react.");
    const db = await getDb();
    await setCampaignTime(db, worldId, campaignId, userActor(user.id), campaign.currentAt + minutes, `Time passes (${amount} ${unit})`);
    refresh(worldId);
    return { toAt: campaign.currentAt + minutes };
  });
}

// Scenes -----------------------------------------------------------------------
const sceneInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(20000).optional(),
  sessionId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  atTime: z.number().int().nullable().optional(),
  weather: z.string().max(200).optional(),
  mood: z.string().max(200).optional(),
  lighting: z.string().max(200).optional(),
  ambience: z.string().max(500).optional(),
  encounterId: z.string().uuid().nullable().optional(),
  questId: z.string().uuid().nullable().optional(),
  audioProfileId: z.string().uuid().nullable().optional(),
  notes: z.string().max(20000).optional(),
  status: z.enum(["planned", "active", "done"]).optional(),
  presentIds: z.array(z.string().uuid()).max(50).optional(),
  threadIds: z.array(z.string().uuid()).max(20).optional(),
});

export async function saveSceneAction(worldId: string, campaignId: string, raw: z.input<typeof sceneInput>, sceneId?: string) {
  return run(async () => {
    await authorizeCampaign(worldId, campaignId, "editor");
    const input = sceneInput.parse(raw) as SceneInput;
    const db = await getDb();
    const s = await saveScene(db, worldId, campaignId, input, sceneId);
    refresh(worldId);
    return { id: s.id };
  }, "Scene saved");
}

export async function activateSceneAction(worldId: string, campaignId: string, sceneId: string | null) {
  return run(async () => {
    await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    await activateScene(db, campaignId, sceneId);
    refresh(worldId);
    return null;
  });
}

export async function deleteSceneAction(worldId: string, campaignId: string, sceneId: string) {
  return run(async () => {
    await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    await deleteScene(db, campaignId, sceneId);
    refresh(worldId);
    return null;
  });
}
