"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { authorizeWorld } from "@/server/auth/access";
import { createWorld } from "@/server/services/worlds";
import { addCorePeoples, addHomebrewPeoples, listPeoples } from "@/server/services/peoples";
import { userActor } from "@/server/services/history";
import { worldFoundation } from "@/server/ai/tasks/world-tasks";
import { SUGGEST_FIELDS, suggestForField, suggestPeoples, type CreatorDraft, type SuggestField } from "@/server/ai/tasks/creator";
import { buildDmContext } from "@/server/ai/context";
import { worldInput } from "@/lib/validation";
import { worldProfileSchema } from "@/lib/world-profile";
import { PREVALENCE } from "@/lib/peoples";
import { run } from "./_util";

const draftSchema = z.object({
  name: z.string().max(120).optional(),
  genre: z.string().max(80).optional(),
  tone: z.string().max(200).optional(),
  magicLevel: z.string().max(60).optional(),
  techLevel: z.string().max(60).optional(),
  description: z.string().max(5000).optional(),
  profile: worldProfileSchema.optional(),
  races: z.array(z.string().max(80)).max(40).optional(),
  classes: z.array(z.string().max(80)).max(40).optional(),
});

const suggestionSchema = z.object({
  kind: z.enum(["race", "class"]),
  name: z.string().trim().min(1).max(120),
  summary: z.string().max(1000).default(""),
  prevalence: z.enum(PREVALENCE),
  reason: z.string().max(1000).default(""),
  fields: z.record(z.string(), z.string().max(2000)).default({}),
});

const choiceSchema = z.record(z.string().max(60), z.enum([...PREVALENCE, "Absent"]));

/** Suggestions for one field of the world creator, based on everything written so far. */
export async function suggestFieldAction(field: string, draft: CreatorDraft) {
  return run(async () => {
    await requireUser();
    if (!(field in SUGGEST_FIELDS)) throw new Error("Nothing to suggest for that field.");
    return suggestForField(field as SuggestField, draftSchema.parse(draft));
  });
}

/** Homebrew races and classes for a world that doesn't exist yet (the creator). */
export async function suggestPeoplesAction(draft: CreatorDraft, existing: string[], kind?: "race" | "class") {
  return run(async () => {
    await requireUser();
    return suggestPeoples({ draft: draftSchema.parse(draft), existing: z.array(z.string().max(120)).max(80).parse(existing), kind });
  });
}

/** Homebrew races and classes for an existing world, grounded in its records. */
export async function suggestWorldPeoplesAction(worldId: string, kind?: "race" | "class") {
  return run(async () => {
    const { world } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const { races, classes } = await listPeoples(db, worldId);
    const ctx = await buildDmContext(db, { worldId, campaignId: null, budgetChars: 8000, maxEntities: 8, sections: { threads: true, sessions: false, timeline: false, quests: false, consequences: false, mysteries: false, truths: false, rumours: false } });
    return suggestPeoples({
      draft: { name: world.name, genre: world.genre, tone: world.tone, magicLevel: world.magicLevel, techLevel: world.techLevel, description: world.description, profile: world.settings.profile, races: races.map((r) => r.name), classes: classes.map((c) => c.name) },
      existing: [...races, ...classes].map((p) => p.name),
      kind,
      context: ctx.text,
    });
  });
}

const wizardSchema = z.object({
  world: worldInput,
  races: choiceSchema.default({}),
  classes: choiceSchema.default({}),
  homebrew: z.array(suggestionSchema).max(30).default([]),
  foundation: z.boolean().default(false),
});

/**
 * Create a world from the step-by-step creator: the world and its profile, the chosen races and
 * classes, and (optionally) a proposed foundation built from all of it.
 */
export async function createWorldFromCreatorAction(input: z.input<typeof wizardSchema>) {
  return run(async () => {
    const user = await requireUser();
    const parsed = wizardSchema.parse(input);
    const db = await getDb();
    const actor = { ...userActor(user.id), userId: user.id };
    const world = await createWorld(db, actor, parsed.world);
    await db.update(users).set({ preferences: { ...user.preferences, lastWorldId: world.id } }).where(eq(users.id, user.id));
    await addCorePeoples(db, world.id, actor, { races: parsed.races, classes: parsed.classes });
    if (parsed.homebrew.length) await addHomebrewPeoples(db, world.id, actor, parsed.homebrew);
    let batchId: string | null = null;
    if (parsed.foundation) {
      const res = await worldFoundation({ db, worldId: world.id, campaignId: null, userId: user.id });
      batchId = res.batchId;
    }
    revalidatePath("/");
    return { worldId: world.id, batchId };
  });
}

export async function addCorePeoplesAction(worldId: string, choice: { races: Record<string, string>; classes: Record<string, string> }) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const created = await addCorePeoples(db, worldId, userActor(user.id), { races: choiceSchema.parse(choice.races), classes: choiceSchema.parse(choice.classes) });
    revalidatePath(`/w/${worldId}`, "layout");
    return { created: created.length };
  });
}

export async function addHomebrewPeoplesAction(worldId: string, items: unknown[]) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const created = await addHomebrewPeoples(db, worldId, userActor(user.id), z.array(suggestionSchema).max(30).parse(items));
    revalidatePath(`/w/${worldId}`, "layout");
    return { created };
  });
}
