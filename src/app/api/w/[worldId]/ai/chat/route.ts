import { type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { apiWorld } from "@/server/auth/api";
import { campaigns, entities } from "@/server/db/schema";
import { assistantTurn } from "@/server/ai/tasks/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.object({
  message: z.string().trim().min(1).max(8000),
  conversationId: z.string().uuid().nullable().optional(),
  campaignId: z.string().uuid().nullable().optional(),
  focusEntityId: z.string().uuid().nullable().optional(),
  roleplayEntityId: z.string().uuid().nullable().optional(),
});

/** Streams newline-delimited JSON events from the copilot. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const auth = await apiWorld(worldId, "editor");
  if ("error" in auth) return auth.error;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { db, user } = auth;
  const input = parsed.data;
  if (input.campaignId) {
    const [c] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, input.campaignId), eq(campaigns.worldId, worldId)));
    if (!c) return Response.json({ error: "Campaign not found" }, { status: 404 });
  }
  for (const id of [input.focusEntityId, input.roleplayEntityId]) {
    if (!id) continue;
    const [e] = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.id, id), eq(entities.worldId, worldId)));
    if (!e) return Response.json({ error: "Entity not found" }, { status: 404 });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of assistantTurn(db, {
          worldId,
          campaignId: input.campaignId ?? null,
          userId: user.id,
          conversationId: input.conversationId ?? null,
          message: input.message,
          focusEntityId: input.focusEntityId ?? null,
          roleplayEntityId: input.roleplayEntityId ?? null,
        })) {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        }
      } catch (err) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Assistant failed" }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
