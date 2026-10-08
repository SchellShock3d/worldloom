import { NextResponse, type NextRequest } from "next/server";
import { apiWorld } from "@/server/auth/api";
import { listEntities } from "@/server/services/entities";

export async function GET(req: NextRequest, { params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const auth = await apiWorld(worldId);
  if ("error" in auth) return auth.error;
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.slice(0, 100) ?? undefined;
  const types = sp.get("types")?.split(",").filter(Boolean);
  const campaignId = sp.get("campaign") || null;
  const ids = sp.get("ids")?.split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const rows = await listEntities(auth.db, worldId, { q, types, campaignId, limit: Number(sp.get("limit") ?? 20), sort: q ? "name" : "updated" });
  let result = rows;
  if (ids?.length) result = rows.filter((r) => ids.includes(r.id));
  if (q) {
    const ql = q.toLowerCase();
    result = [...result].sort((a, b) => score(b.name, ql) - score(a.name, ql));
  }
  return NextResponse.json(result.map((r) => ({ id: r.id, name: r.name, type: r.type, summary: r.summary, status: r.status })));
}

function score(name: string, q: string) {
  const n = name.toLowerCase();
  if (n === q) return 3;
  if (n.startsWith(q)) return 2;
  if (n.includes(q)) return 1;
  return 0;
}
