import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { requireCampaign } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { mentions, proposalBatches, entities } from "@/server/db/schema";
import { getSession, listScenes } from "@/server/services/sessions";
import { collectRefs } from "@/server/services/refs";
import { listTimeline } from "@/server/services/timeline";
import { SessionView } from "./session-view";

export async function generateMetadata({ params }: { params: Promise<{ worldId: string; campaignId: string; sessionId: string }> }) {
  const { worldId, campaignId, sessionId } = await params;
  await requireCampaign(worldId, campaignId);
  const db = await getDb();
  const s = await getSession(db, campaignId, sessionId);
  return { title: s ? `Session ${s.number}` : "Session" };
}

export default async function SessionPage({ params }: { params: Promise<{ worldId: string; campaignId: string; sessionId: string }> }) {
  const { worldId, campaignId, sessionId } = await params;
  const { campaign } = await requireCampaign(worldId, campaignId);
  const db = await getDb();
  const s = await getSession(db, campaign.id, sessionId);
  if (!s) notFound();
  const [scenes, batches, mentioned, events, refs] = await Promise.all([
    listScenes(db, campaign.id, s.id),
    db.select().from(proposalBatches).where(and(eq(proposalBatches.worldId, worldId), eq(proposalBatches.sessionId, s.id))).orderBy(desc(proposalBatches.createdAt)),
    db.select({ id: entities.id, name: entities.name, type: entities.type }).from(mentions).innerJoin(entities, eq(entities.id, mentions.entityId)).where(and(eq(mentions.sourceKind, "session"), eq(mentions.sourceId, s.id))),
    listTimeline(db, worldId, { campaignId: campaign.id }).then((list) => list.filter((e) => e.sessionId === s.id)),
    collectRefs(db, worldId, s.notes, s.recap, s.prep),
  ]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href={`/w/${worldId}/campaigns/${campaign.id}/sessions`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" /> Sessions
      </Link>
      <SessionView
        campaignId={campaign.id}
        session={JSON.parse(JSON.stringify(s))}
        scenes={scenes.map((x) => ({ id: x.id, name: x.name, status: x.status, mood: x.mood }))}
        batches={batches.map((b) => ({ id: b.id, title: b.title, status: b.status, createdAt: b.createdAt.toISOString() }))}
        mentioned={mentioned}
        events={events.map((e) => ({ id: e.id, name: e.name, startAt: e.startAt }))}
        refs={refs}
      />
    </div>
  );
}
