import { NextResponse } from "next/server";
import { apiWorld } from "@/server/auth/api";
import { getEntity } from "@/server/services/entities";

export async function GET(_req: Request, { params }: { params: Promise<{ worldId: string; entityId: string }> }) {
  const { worldId, entityId } = await params;
  const auth = await apiWorld(worldId);
  if ("error" in auth) return auth.error;
  const e = await getEntity(auth.db, worldId, entityId);
  if (!e) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id: e.id, name: e.name, type: e.type, summary: e.summary, status: e.status, fields: e.fields, visibility: e.visibility });
}
