import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { worldMembers } from "@/server/db/schema";
import { getCurrentUser } from "@/server/auth/session";
import { getFileRow, storage } from "@/server/services/files";

/** Serves uploaded files to members of the owning world only. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = await getDb();
  const f = await getFileRow(db, fileId);
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (f.worldId) {
    const [m] = await db.select({ role: worldMembers.role }).from(worldMembers).where(and(eq(worldMembers.worldId, f.worldId), eq(worldMembers.userId, user.id)));
    if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  } else if (f.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const data = await storage().get(f.storageKey).catch(() => null);
  if (!data) return NextResponse.json({ error: "File missing from storage" }, { status: 410 });
  const headers: Record<string, string> = {
    "Content-Type": f.mimeType,
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
  // Audio needs range support for seeking.
  const range = req.headers.get("range");
  if (range && f.mimeType.startsWith("audio/")) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m?.[1] ? Number(m[1]) : 0;
    const end = m?.[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
    return new NextResponse(new Uint8Array(data.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${data.length}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) },
    });
  }
  return new NextResponse(new Uint8Array(data), { headers: { ...headers, "Content-Length": String(data.length), "Accept-Ranges": "bytes" } });
}
