import { requireCampaign } from "@/server/auth/access";
import { getActiveCampaign } from "@/server/context";
import { ActivateCampaign } from "@/components/shell/activate-campaign";

export default async function CampaignLayout({ children, params }: { children: React.ReactNode; params: Promise<{ worldId: string; campaignId: string }> }) {
  const { worldId, campaignId } = await params;
  await requireCampaign(worldId, campaignId);
  const { campaign } = await getActiveCampaign(worldId);
  return (
    <>
      <ActivateCampaign worldId={worldId} campaignId={campaignId} activeId={campaign?.id ?? null} />
      {children}
    </>
  );
}
