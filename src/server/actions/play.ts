"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { authorizeCampaign, authorizeWorld } from "@/server/auth/access";
import { userActor } from "@/server/services/history";
import { createFact, deleteFact, updateFact } from "@/server/services/knowledge";
import { advanceThread, setQuestStatus, toggleObjective } from "@/server/services/quests";
import { createClue, createConsequence, deleteClue, deleteConsequence, deleteNote, saveNote, setClueDiscovered, updateClue, updateConsequence } from "@/server/services/play";
import { setCampaignTime } from "@/server/services/clock";
import type { ClueInput, ConsequenceInput, FactInput } from "@/lib/validation";
import type { QuestStatus } from "@/server/db/schema";
import { run } from "./_util";

const refresh = (worldId: string) => revalidatePath(`/w/${worldId}`, "layout");

// Knowledge ---------------------------------------------------------------
export async function createFactAction(worldId: string, input: FactInput) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await createFact(db, worldId, userActor(user.id), input);
    refresh(worldId);
    return null;
  }, "Knowledge added");
}
export async function updateFactAction(worldId: string, id: string, input: Partial<FactInput>) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await updateFact(db, worldId, userActor(user.id), id, input);
    refresh(worldId);
    return null;
  });
}
export async function deleteFactAction(worldId: string, id: string) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await deleteFact(db, worldId, userActor(user.id), id);
    refresh(worldId);
    return null;
  });
}

// Quests ----------------------------------------------------------------------
export async function setQuestStatusAction(worldId: string, questId: string, status: QuestStatus, campaignId?: string | null) {
  return run(async () => {
    const { user, world } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    let at = world.currentAt;
    if (campaignId) at = (await authorizeCampaign(worldId, campaignId, "editor")).campaign.currentAt;
    await setQuestStatus(db, worldId, userActor(user.id), questId, status, at);
    refresh(worldId);
    return null;
  });
}
export async function toggleObjectiveAction(worldId: string, objectiveId: string, status: "open" | "done" | "failed") {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await toggleObjective(db, worldId, objectiveId, status);
    refresh(worldId);
    return null;
  });
}

// Threads ----------------------------------------------------------------------
const threadMove = z.object({
  progress: z.number().int().min(0).max(100).optional(),
  progressDelta: z.number().int().min(-100).max(100).optional(),
  status: z.enum(["dormant", "active", "escalating", "resolved", "failed", "paused"]).optional(),
  urgency: z.number().int().min(1).max(5).optional(),
});

export async function moveThreadAction(worldId: string, threadId: string, raw: z.input<typeof threadMove>) {
  return run(async () => {
    const { user, world } = await authorizeWorld(worldId, "editor");
    const change = threadMove.parse(raw);
    const db = await getDb();
    await advanceThread(db, worldId, userActor(user.id), threadId, change, world.currentAt);
    refresh(worldId);
    return null;
  });
}

// Clues ------------------------------------------------------------------------
export async function createClueAction(worldId: string, campaignId: string | null, input: ClueInput) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await createClue(db, worldId, campaignId, userActor(user.id), input);
    refresh(worldId);
    return null;
  }, "Clue added");
}
export async function updateClueAction(worldId: string, id: string, input: Partial<ClueInput>) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await updateClue(db, worldId, userActor(user.id), id, input);
    refresh(worldId);
    return null;
  });
}
export async function setClueDiscoveredAction(worldId: string, id: string, discovered: boolean, opts: { sessionId?: string | null; knowerIds?: string[] } = {}) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await setClueDiscovered(db, worldId, userActor(user.id), id, discovered, opts);
    refresh(worldId);
    return null;
  });
}
export async function deleteClueAction(worldId: string, id: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await deleteClue(db, worldId, id);
    refresh(worldId);
    return null;
  });
}

// Consequences -----------------------------------------------------------------
export async function createConsequenceAction(worldId: string, campaignId: string | null, input: ConsequenceInput) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await createConsequence(db, worldId, campaignId, userActor(user.id), input);
    refresh(worldId);
    return null;
  }, "Saved");
}
export async function updateConsequenceAction(worldId: string, id: string, input: Partial<ConsequenceInput>) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await updateConsequence(db, worldId, userActor(user.id), id, input);
    refresh(worldId);
    return null;
  });
}
export async function deleteConsequenceAction(worldId: string, id: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await deleteConsequence(db, worldId, id);
    refresh(worldId);
    return null;
  });
}

// Notes ------------------------------------------------------------------------
const noteInput = z.object({ id: z.string().uuid().optional(), title: z.string().max(200), body: z.string().max(100000), pinned: z.boolean().optional() });
export async function saveNoteAction(worldId: string, campaignId: string | null, input: z.input<typeof noteInput>) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const id = await saveNote(db, worldId, campaignId, user.id, noteInput.parse(input));
    refresh(worldId);
    return { id };
  });
}
export async function deleteNoteAction(worldId: string, id: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await deleteNote(db, worldId, id);
    refresh(worldId);
    return null;
  });
}

// Clock (manual set, e.g. correcting the date) ----------------------------------
export async function setCampaignTimeAction(worldId: string, campaignId: string, toAt: number) {
  return run(async () => {
    const { user } = await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    await setCampaignTime(db, worldId, campaignId, userActor(user.id), Math.round(z.number().finite().parse(toAt)), "Clock set by the DM");
    refresh(worldId);
    return null;
  }, "Date updated");
}
