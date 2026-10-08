import { TriangleAlert } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { continuityIssues, forgottenThreads } from "@/server/services/insights";
import { PageHeader } from "@/components/ui/display";
import { ContinuityView } from "./continuity-view";

export const metadata = { title: "Continuity" };

export default async function ContinuityPage({ params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { calendar, role } = await requireWorld(worldId, "editor");
  const db = await getDb();
  const { campaign } = await getActiveCampaign(worldId);
  const [issues, forgotten] = await Promise.all([
    continuityIssues(db, worldId, campaign?.id ?? null, calendar),
    campaign ? forgottenThreads(db, worldId, campaign.id, calendar) : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<TriangleAlert />}
        title="Continuity"
        description="Contradictions in your canon, and threads worth picking back up. Nothing here changes your world: you decide what to fix."
      />
      <ContinuityView issues={issues} forgotten={forgotten} campaign={campaign ? { id: campaign.id, name: campaign.name } : null} canEdit={role === "owner" || role === "editor"} />
    </div>
  );
}
