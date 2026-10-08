import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { listWorldsForUser } from "@/server/services/worlds";
import { getCustomTypes } from "@/server/services/entities";
import { countPendingBatches } from "@/server/services/proposals";
import { listPeoples } from "@/server/services/peoples";
import { getAIProvider, providerInfo } from "@/server/ai/provider";
import { WorldShell } from "@/components/shell/world-shell";

export async function generateMetadata({ params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { world } = await requireWorld(worldId);
  return { title: { default: world.name, template: `%s · ${world.name}` } };
}

export default async function WorldLayout({ children, params }: { children: React.ReactNode; params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { user, world, role, calendar } = await requireWorld(worldId);
  const db = await getDb();
  const [{ campaign, all }, worlds, customTypes, pending, ai, peoples] = await Promise.all([
    getActiveCampaign(worldId),
    listWorldsForUser(db, user.id),
    getCustomTypes(db, worldId),
    countPendingBatches(db, worldId),
    getAIProvider(),
    listPeoples(db, worldId),
  ]);
  const toShell = (c: (typeof all)[number]) => ({ id: c.id, name: c.name, status: c.status, currentAt: c.currentAt });
  return (
    <WorldShell
      worldId={world.id}
      worldName={world.name}
      role={role}
      calendar={calendar}
      worldNow={world.currentAt}
      campaigns={all.map(toShell)}
      activeCampaign={campaign ? toShell(campaign) : null}
      customTypes={customTypes}
      peopleNames={{ races: peoples.races.map((r) => r.name), classes: peoples.classes.map((c) => c.name) }}
      aiProvider={{ name: providerInfo(ai).name, live: providerInfo(ai).live, problem: providerInfo(ai).problem }}
      worlds={worlds.map((w) => ({ id: w.id, name: w.name }))}
      pendingProposals={pending}
      user={{ name: user.name, email: user.email }}
    >
      {children}
    </WorldShell>
  );
}
