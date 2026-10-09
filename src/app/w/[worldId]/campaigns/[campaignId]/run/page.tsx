import { requireCampaign } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getRunData } from "@/server/services/run-data";
import { RunSession } from "./run-session";
import { lyriaConfigured } from "@/server/music/lyria";
import { StartSession } from "./start-session";

export const metadata = { title: "Run session" };

export default async function RunPage({ params }: { params: Promise<{ worldId: string; campaignId: string }> }) {
  const { worldId, campaignId } = await params;
  const { campaign } = await requireCampaign(worldId, campaignId, "editor");
  const db = await getDb();
  const data = await getRunData(db, worldId, campaign);
  if (!data.live) {
    return <StartSession campaignId={campaign.id} campaignName={campaign.name} planned={data.planned.map((s) => ({ id: s.id, number: s.number, title: s.title, prep: s.prep }))} lastRecap={data.lastSession ? { number: data.lastSession.number, recap: data.lastSession.recap } : null} refs={data.refs} />;
  }
  return <RunSession campaign={{ id: campaign.id, name: campaign.name, currentWeather: campaign.currentWeather, partyInventory: campaign.partyInventory }} data={JSON.parse(JSON.stringify(data))} musicReady={lyriaConfigured()} />;
}
