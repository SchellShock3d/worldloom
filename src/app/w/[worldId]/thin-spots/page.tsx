import { Sprout } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { findThinSpots } from "@/server/services/thin-spots";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { ThinSpotList } from "./thin-spot-list";

export const metadata = { title: "Thin spots" };

export default async function ThinSpotsPage({ params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { role } = await requireWorld(worldId);
  const { campaign } = await getActiveCampaign(worldId);
  const { spots, dismissed } = await findThinSpots(await getDb(), worldId, { campaignId: campaign?.id ?? null });
  const canEdit = role === "owner" || role === "editor";
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader icon={<Sprout />} title="Thin spots" description="The parts of your world that are only sketched in: towns with nobody to meet, factions with no members, gods nobody worships. Fill one in with Claude, or dismiss it if you'd rather leave it a mystery." />
      {spots.length ? (
        <ThinSpotList spots={spots} dismissed={dismissed} canEdit={canEdit} partyPlace={campaign ? campaign.name : null} />
      ) : (
        <EmptyState icon={<Sprout />} title="No thin spots">
          Every town has people, every faction has members, and every important entry has an article. {dismissed ? `(${dismissed} dismissed.)` : ""}
          {dismissed > 0 && canEdit && <ThinSpotList spots={[]} dismissed={dismissed} canEdit={canEdit} partyPlace={null} />}
        </EmptyState>
      )}
    </div>
  );
}
