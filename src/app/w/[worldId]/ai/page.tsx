import { and, eq } from "drizzle-orm";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { entities } from "@/server/db/schema";
import { listConversations, getConversation } from "@/server/ai/tasks/assistant";
import { AssistantPage } from "./assistant-page";

export const metadata = { title: "AI assistant" };

export default async function AiPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<{ c?: string; q?: string; roleplay?: string }> }) {
  const { worldId } = await params;
  const sp = await searchParams;
  const { user } = await requireWorld(worldId, "editor");
  const db = await getDb();
  const conversations = await listConversations(db, worldId, user.id);
  const current = sp.c ? await getConversation(db, worldId, user.id, sp.c) : null;
  let roleplay: { id: string; name: string; type: string } | null = null;
  const rpId = sp.roleplay ?? current?.conversation.roleplayEntityId ?? null;
  if (rpId && /^[0-9a-f-]{36}$/i.test(rpId)) {
    const [e] = await db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(and(eq(entities.id, rpId), eq(entities.worldId, worldId)));
    roleplay = e ?? null;
  }
  return (
    <AssistantPage
      key={current?.conversation.id ?? `new-${rpId ?? ""}-${sp.q ?? ""}`}
      conversations={conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString(), roleplay: !!c.roleplayEntityId }))}
      currentId={current?.conversation.id ?? null}
      initialMessages={(current?.messages ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content, refs: m.contextRefs, batch: m.proposalBatchId ? { id: m.proposalBatchId, count: 0 } : undefined }))}
      initialPrompt={sp.q}
      roleplay={roleplay}
    />
  );
}
