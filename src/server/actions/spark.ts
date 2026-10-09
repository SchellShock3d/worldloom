"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { userActor } from "@/server/services/history";
import { createWorldFromDraft } from "@/server/services/spark-world";
import { draftSection, pitchWorlds } from "@/server/ai/tasks/spark";
import { SECTION_SCHEMAS, pitchSchema, type SectionKey } from "@/lib/spark-schema";
import { run } from "./_util";

const dialsSchema = z.object({ tone: z.number().int().min(-2).max(2), realism: z.number().int().min(-2).max(2), novelty: z.number().int().min(-2).max(2), scale: z.number().int().min(-2).max(2) });
const sectionKey = z.enum(Object.keys(SECTION_SCHEMAS) as [SectionKey, ...SectionKey[]]);
const sectionsSchema = z.object({
  overview: SECTION_SCHEMAS.overview.optional(),
  land: SECTION_SCHEMAS.land.optional(),
  peoples: SECTION_SCHEMAS.peoples.optional(),
  powers: SECTION_SCHEMAS.powers.optional(),
  history: SECTION_SCHEMAS.history.optional(),
  start: SECTION_SCHEMAS.start.optional(),
});

const pitchInput = z.object({
  seed: z.string().max(1000).default(""),
  dials: dialsSchema,
  steer: z.string().max(1000).optional(),
  like: pitchSchema.optional(),
  blend: z.array(pitchSchema).max(3).optional(),
  avoid: z.array(z.string().max(200)).max(30).optional(),
});

/** Three world pitches (or one blended pitch) from a seed and the vibe dials. */
export async function pitchWorldsAction(input: z.input<typeof pitchInput>) {
  return run(async () => {
    await requireUser();
    return pitchWorlds(pitchInput.parse(input));
  });
}

const sectionInput = z.object({
  key: sectionKey,
  pitch: pitchSchema,
  dials: dialsSchema,
  sections: sectionsSchema,
  previous: z.unknown().optional(),
  notes: z.array(z.string().max(1000)).max(20).optional(),
  mode: z.enum(["new", "redo", "steer", "refresh"]),
});

/** Write several sections at once (those that don't depend on each other), in parallel. */
export async function draftSectionsAction(inputs: z.input<typeof sectionInput>[]) {
  return run(async () => {
    await requireUser();
    const reqs = z.array(sectionInput).min(1).max(6).parse(inputs);
    const settled = await Promise.allSettled(
      reqs.map((req) => {
        const previous = req.previous === undefined ? undefined : SECTION_SCHEMAS[req.key].parse(req.previous);
        return draftSection({ ...req, previous: previous as never });
      }),
    );
    return settled.map((r, i) => (r.status === "fulfilled" ? { key: reqs[i]!.key, ok: true as const, data: r.value.data, provider: r.value.provider } : { key: reqs[i]!.key, ok: false as const, error: r.reason instanceof Error ? r.reason.message : "Couldn't write this section." }));
  });
}

const finishedInput = z.object({
  seed: z.string().max(1000).default(""),
  dials: dialsSchema,
  pitch: pitchSchema,
  sections: sectionsSchema.required(),
  calendarPreset: z.string().max(40).optional(),
  provider: z.string().max(40).optional(),
});

/** Create the world from a finished draft. */
export async function createWorldFromDraftAction(input: z.input<typeof finishedInput>) {
  return run(async () => {
    const user = await requireUser();
    const draft = finishedInput.parse(input);
    const db = await getDb();
    const res = await createWorldFromDraft(db, { ...userActor(user.id), userId: user.id }, draft);
    await db.update(users).set({ preferences: { ...user.preferences, lastWorldId: res.worldId } }).where(eq(users.id, user.id));
    revalidatePath("/");
    return res;
  });
}
