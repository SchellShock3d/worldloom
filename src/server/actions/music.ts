"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { authorizeWorld } from "@/server/auth/access";
import { composeForScene } from "@/server/services/music-gen";
import { run } from "./_util";

const composeInput = z.object({
  sceneId: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).optional(),
  kinds: z.array(z.enum(["music", "ambience"])).min(1).max(2),
  length: z.enum(["loop", "long"]).default("loop"),
  note: z.string().max(500).optional(),
});

/** Compose scene music and/or ambience with Google Lyria and add them to the world's library. */
export async function composeMusicAction(worldId: string, input: z.input<typeof composeInput>) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const res = await composeForScene(db, { worldId, userId: user.id, ...composeInput.parse(input) });
    revalidatePath(`/w/${worldId}`, "layout");
    return res;
  });
}
