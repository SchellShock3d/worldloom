import { desc, eq } from "drizzle-orm";
import { requireCampaign } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { gameSessions } from "@/server/db/schema";
import { PrepareView } from "./prepare-view";

export const metadata = { title: "Prepare next session" };

export default async function PreparePage({ params }: { params: Promise<{ worldId: string; campaignId: string }> }) {
  const { worldId, campaignId } = await params;
  const { campaign } = await requireCampaign(worldId, campaignId, "editor");
  const db = await getDb();
  const sessions = await db.select({ id: gameSessions.id, number: gameSessions.number, status: gameSessions.status, title: gameSessions.title, prep: gameSessions.prep }).from(gameSessions).where(eq(gameSessions.campaignId, campaign.id)).orderBy(desc(gameSessions.number));
  const next = [...sessions].reverse().find((s) => s.status === "planned") ?? null;
  return <PrepareView campaignId={campaign.id} campaignName={campaign.name} nextSession={next} nextNumber={(sessions[0]?.number ?? 0) + 1} />;
}
