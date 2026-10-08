import { NextResponse, type NextRequest } from "next/server";
import { apiWorld } from "@/server/auth/api";
import { saveFile, MAX_UPLOAD_BYTES } from "@/server/services/files";

export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const auth = await apiWorld(worldId, "editor");
  if ("error" in auth) return auth.error;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Files can be up to 25 MB." }, { status: 413 });
  try {
    const row = await saveFile(auth.db, {
      worldId,
      ownerId: auth.user.id,
      filename: file.name,
      mimeType: file.type,
      data: Buffer.from(await file.arrayBuffer()),
      kind: kind === "map" ? "map" : undefined,
    });
    return NextResponse.json({ id: row.id, url: `/api/files/${row.id}`, width: row.width, height: row.height, mimeType: row.mimeType, filename: row.filename });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
