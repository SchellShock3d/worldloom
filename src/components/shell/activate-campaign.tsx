"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setActiveCampaignAction } from "@/server/actions/worlds";

/** Visiting a campaign page makes it the active campaign context. */
export function ActivateCampaign({ worldId, campaignId, activeId }: { worldId: string; campaignId: string; activeId: string | null }) {
  const router = useRouter();
  React.useEffect(() => {
    if (campaignId !== activeId) setActiveCampaignAction(worldId, campaignId).then(() => router.refresh());
  }, [worldId, campaignId, activeId, router]);
  return null;
}
