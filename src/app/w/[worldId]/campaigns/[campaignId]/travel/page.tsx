import { and, eq, inArray } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { requireCampaign } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { entities, travelPlans } from "@/server/db/schema";
import { TravelView } from "./travel-view";

export const metadata = { title: "Travel" };

export default async function TravelPage({ params }: { params: Promise<{ worldId: string; campaignId: string }> }) {
  const { worldId, campaignId } = await params;
  const { campaign } = await requireCampaign(worldId, campaignId);
  const db = await getDb();
  const plans = await db.select().from(travelPlans).where(and(eq(travelPlans.campaignId, campaign.id))).orderBy(desc(travelPlans.createdAt));
  const ids = Array.from(new Set(plans.flatMap((p) => [p.originId, p.destinationId]).filter((x): x is string => !!x)));
  const names = ids.length ? await db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(inArray(entities.id, ids)) : [];
  return <TravelView campaignId={campaign.id} now={campaign.currentAt} plans={JSON.parse(JSON.stringify(plans))} places={names} />;
}
