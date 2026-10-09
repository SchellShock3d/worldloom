"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { authorizeWorld } from "@/server/auth/access";
import { setThinSpotDismissed } from "@/server/services/thin-spots";
import { run } from "./_util";

/** Hide a thin spot the DM would rather leave sketchy (or bring it back; null = bring all back). */
export async function dismissThinSpotAction(worldId: string, id: string | null, dismissed = true) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const spot = id === null ? null : z.string().regex(/^[a-z-]+:[0-9a-f-]{36}$/).parse(id);
    await setThinSpotDismissed(await getDb(), worldId, spot, dismissed);
    revalidatePath(`/w/${worldId}`, "layout");
    return { ok: true };
  });
}
