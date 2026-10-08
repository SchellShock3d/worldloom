import { NextResponse, type NextRequest } from "next/server";
import { apiWorld } from "@/server/auth/api";
import { searchWorld } from "@/server/services/search";

export async function GET(req: NextRequest, { params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const auth = await apiWorld(worldId);
  if ("error" in auth) return auth.error;
  const q = req.nextUrl.searchParams.get("q")?.slice(0, 200) ?? "";
  const campaignId = req.nextUrl.searchParams.get("campaign") || null;
  const results = await searchWorld(auth.db, worldId, q, { campaignId, limit: 24 });
  return NextResponse.json(results);
}
