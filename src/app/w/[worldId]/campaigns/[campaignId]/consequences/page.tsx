import { requireCampaign } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { listConsequences } from "@/server/services/play";
import { ConsequencesView } from "./consequences-view";

export const metadata = { title: "Consequences" };

export default async function ConsequencesPage({ params }: { params: Promise<{ worldId: string; campaignId: string }> }) {
  const { worldId, campaignId } = await params;
  const { campaign } = await requireCampaign(worldId, campaignId);
  const db = await getDb();
  const rows = await listConsequences(db, worldId, campaign.id);
  return <ConsequencesView campaignId={campaign.id} now={campaign.currentAt} rows={rows.map(({ c, actorName, actorType }) => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), actorName, actorType }))} />;
}
