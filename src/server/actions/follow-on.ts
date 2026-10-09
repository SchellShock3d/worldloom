"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { authorizeWorld } from "@/server/auth/access";
import { getActiveCampaign } from "@/server/context";
import { followOnChanges } from "@/server/ai/tasks/follow-on";
import { markFollowOnHandled, pendingFollowOns } from "@/server/services/follow-on";
import { run } from "./_util";

const input = z.object({
  entityId: z.string().uuid(),
  /** The recorded change to follow up (from the callout), or a change the DM describes. */
  revisionId: z.string().uuid().optional(),
  change: z.string().trim().min(3).max(1000).optional(),
});

/** Ask Claude for the follow-on changes a big change needs. Returns the proposal batch to review. */
export async function followOnAction(worldId: string, raw: z.input<typeof input>) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const p = input.parse(raw);
    const db = await getDb();
    const { campaign } = await getActiveCampaign(worldId);
    let change = p.change ?? "";
    let campaignOnly = false;
    let campaignId = campaign?.id ?? null;
    if (p.revisionId) {
      const found = (await pendingFollowOns(db, worldId, { entityId: p.entityId })).find((c) => c.revisionId === p.revisionId);
      if (!found) throw new Error("That change has already been followed up.");
      change = found.description;
      if (found.campaign) {
        campaignOnly = true;
        campaignId = found.campaign.id;
      }
    }
    if (!change) throw new Error("Describe what changed.");
    const res = await followOnChanges({ db, worldId, campaignId, userId: user.id, entityId: p.entityId, change, campaignOnly });
    if (p.revisionId) await markFollowOnHandled(db, worldId, p.revisionId);
    revalidatePath(`/w/${worldId}`, "layout");
    return res;
  });
}

/** "Not now": stop suggesting follow-ons for this change. */
export async function dismissFollowOnAction(worldId: string, revisionId: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    await markFollowOnHandled(await getDb(), worldId, z.string().uuid().parse(revisionId));
    revalidatePath(`/w/${worldId}`, "layout");
    return { ok: true };
  });
}
