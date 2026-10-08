"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { authorizeCampaign, authorizeWorld } from "@/server/auth/access";
import { commitStateToCanon, createCampaign, deleteCampaign, setCampaignEntityState, updateCampaign, type CampaignPatch } from "@/server/services/campaigns";
import { createEntity } from "@/server/services/entities";
import { userActor } from "@/server/services/history";
import { type CampaignInput, type CampaignStateInput } from "@/lib/validation";
import { run } from "./_util";

const pcInput = z.object({
  name: z.string().trim().min(1).max(120),
  playerName: z.string().trim().max(120).optional(),
  className: z.string().trim().max(120).optional(),
  level: z.number().int().min(1).max(30).optional(),
  species: z.string().trim().max(120).optional(),
});

export async function createCampaignAction(worldId: string, input: CampaignInput & { characters?: z.input<typeof pcInput>[] }) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const actor = userActor(user.id);
    const campaign = await db.transaction(async (tx) => {
      const c = await createCampaign(tx, worldId, actor, input);
      for (const raw of input.characters ?? []) {
        const pc = pcInput.parse(raw);
        await createEntity(tx, worldId, actor, {
          type: "pc",
          name: pc.name,
          campaignId: c.id,
          visibility: "public",
          fields: { playerName: pc.playerName, className: pc.className, level: pc.level, species: pc.species },
        });
      }
      return c;
    });
    (await cookies()).set(`wl_campaign_${worldId}`, campaign.id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    revalidatePath(`/w/${worldId}`, "layout");
    return { id: campaign.id };
  });
}

export async function updateCampaignAction(worldId: string, campaignId: string, patch: CampaignPatch) {
  return run(async () => {
    const { user } = await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    const c = await updateCampaign(db, worldId, userActor(user.id), campaignId, patch);
    revalidatePath(`/w/${worldId}`, "layout");
    return c;
  });
}

export async function deleteCampaignAction(worldId: string, campaignId: string) {
  return run(async () => {
    await authorizeCampaign(worldId, campaignId, "owner");
    const db = await getDb();
    await deleteCampaign(db, worldId, campaignId);
    const jar = await cookies();
    if (jar.get(`wl_campaign_${worldId}`)?.value === campaignId) jar.delete(`wl_campaign_${worldId}`);
    revalidatePath(`/w/${worldId}`, "layout");
    return null;
  });
}

export async function setCampaignEntityStateAction(worldId: string, campaignId: string, input: CampaignStateInput) {
  return run(async () => {
    const { user } = await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    await setCampaignEntityState(db, worldId, campaignId, userActor(user.id), input);
    revalidatePath(`/w/${worldId}`, "layout");
    return null;
  });
}

export async function commitStateToCanonAction(worldId: string, campaignId: string, entityId: string) {
  return run(async () => {
    const { user } = await authorizeCampaign(worldId, campaignId, "editor");
    const db = await getDb();
    await commitStateToCanon(db, worldId, campaignId, userActor(user.id), entityId);
    revalidatePath(`/w/${worldId}`, "layout");
    return null;
  }, "Committed to world canon");
}
