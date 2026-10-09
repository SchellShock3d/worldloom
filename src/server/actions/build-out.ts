"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { authorizeWorld } from "@/server/auth/access";
import { getActiveCampaign } from "@/server/context";
import { draftBuildSection } from "@/server/ai/tasks/build-out";
import { applyBuildOut } from "@/server/services/build-out";
import { buildSectionSchema } from "@/lib/build-out";
import { run } from "./_util";

const key = z.string().regex(/^[a-z_]{2,30}$/);
const written = z.record(key, buildSectionSchema);
const sectionInput = z.object({
  key,
  chosen: z.array(key).max(10),
  depth: z.enum(["essentials", "deep"]),
  direction: z.string().max(1000).optional(),
  written,
  previous: buildSectionSchema.optional(),
  notes: z.array(z.string().max(1000)).max(20).optional(),
  mode: z.enum(["new", "redo", "steer", "refresh"]),
});

/** Write several sections of a build-out at once (those that don't depend on each other). */
export async function draftBuildSectionsAction(worldId: string, entityId: string, inputs: z.input<typeof sectionInput>[]) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const reqs = z.array(sectionInput).min(1).max(8).parse(inputs);
    const id = z.string().uuid().parse(entityId);
    const { campaign } = await getActiveCampaign(worldId);
    const db = await getDb();
    const settled = await Promise.allSettled(reqs.map((r) => draftBuildSection(db, { ...r, worldId, entityId: id, campaignId: campaign?.id ?? null })));
    return settled.map((r, i) => (r.status === "fulfilled" ? { key: reqs[i]!.key, ok: true as const, data: r.value.data, provider: r.value.provider } : { key: reqs[i]!.key, ok: false as const, error: r.reason instanceof Error ? r.reason.message : "Couldn't write this section." }));
  });
}

const applyInput = z.object({ sections: written, reveal: z.boolean().default(false), provider: z.string().max(40).optional() });

/** Add a reviewed build-out to the world. */
export async function applyBuildOutAction(worldId: string, entityId: string, input: z.input<typeof applyInput>) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const res = await applyBuildOut(db, worldId, user.id, { entityId: z.string().uuid().parse(entityId), ...applyInput.parse(input) });
    revalidatePath(`/w/${worldId}`, "layout");
    return res;
  });
}
