import { NextResponse, type NextRequest } from "next/server";
import { apiWorld } from "@/server/auth/api";
import { exportWorld } from "@/server/services/portability";
import { slugify } from "@/lib/utils";

export const maxDuration = 120;

/** Download a complete JSON backup of a world (editors and owners). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const auth = await apiWorld(worldId, "editor");
  if ("error" in auth) return auth.error;
  const includeFiles = req.nextUrl.searchParams.get("files") !== "0";
  const dump = await exportWorld(auth.db, worldId, { includeFiles });
  const name = `${slugify(dump.worldName) || "world"}-${new Date().toISOString().slice(0, 10)}.worldloom.json`;
  return new NextResponse(JSON.stringify(dump), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
