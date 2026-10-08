import { requireWorld } from "@/server/auth/access";
import { NewCampaignForm } from "./new-campaign-form";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<{ onboarding?: string }> }) {
  const { worldId } = await params;
  const { onboarding } = await searchParams;
  const { world } = await requireWorld(worldId, "editor");
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-4xl font-semibold tracking-[-0.01em]">{onboarding ? "Your first campaign" : "New campaign"}</h1>
      <p className="mt-2 text-md text-muted">Campaigns live inside {world.name}. They share its canon but keep their own state, sessions and party.</p>
      <NewCampaignForm worldId={worldId} />
    </div>
  );
}
