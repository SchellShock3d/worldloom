import { cache } from "react";
import { cookies } from "next/headers";
import { getDb } from "@/server/db/client";
import { listCampaigns } from "@/server/services/campaigns";

/** The campaign the DM is working in for this world (cookie), falling back to the most recent active one. */
export const getActiveCampaign = cache(async (worldId: string) => {
  const db = await getDb();
  const all = await listCampaigns(db, worldId);
  const id = (await cookies()).get(`wl_campaign_${worldId}`)?.value;
  // "none" = the DM explicitly chose the world view.
  const chosen = id === "none" ? null : (all.find((c) => c.id === id) ?? all.find((c) => c.status === "active") ?? null);
  return { campaign: chosen, all };
});
