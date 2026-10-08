import { requireCampaign } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { listNotes } from "@/server/services/play";
import { collectRefs } from "@/server/services/refs";
import { NotesView } from "./notes-view";

export const metadata = { title: "Notes" };

export default async function NotesPage({ params }: { params: Promise<{ worldId: string; campaignId: string }> }) {
  const { worldId, campaignId } = await params;
  const { campaign } = await requireCampaign(worldId, campaignId);
  const db = await getDb();
  const notes = await listNotes(db, worldId, campaign.id);
  const refs = await collectRefs(db, worldId, ...notes.map((n) => n.body));
  return <NotesView campaignId={campaign.id} notes={notes.map((n) => ({ id: n.id, title: n.title, body: n.body, pinned: n.pinned, updatedAt: n.updatedAt.toISOString() }))} refs={refs} />;
}
