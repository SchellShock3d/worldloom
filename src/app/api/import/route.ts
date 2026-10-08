import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { importWorld, ImportError } from "@/server/services/portability";

export const maxDuration = 300;
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
// Imports are memory-heavy (parse, remap, insert); run one at a time per server process.
let importing = false;

/** Create a new world for the signed-in user from a Worldloom export file. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (importing) return NextResponse.json({ error: "Another import is running. Try again in a minute." }, { status: 429 });
  importing = true;
  try {
    return await handleImport(req, user.id);
  } finally {
    importing = false;
  }
}

async function handleImport(req: NextRequest, userId: string) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const name = form?.get("name");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an export file." }, { status: 400 });
  if (file.size > MAX_IMPORT_BYTES) return NextResponse.json({ error: "Export files can be up to 100 MB." }, { status: 413 });
  let doc: unknown;
  try {
    doc = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ error: "That file isn't valid JSON." }, { status: 400 });
  }
  try {
    const db = await getDb();
    const res = await importWorld(db, userId, doc, { name: typeof name === "string" ? name.slice(0, 120) : undefined });
    revalidatePath("/");
    return NextResponse.json({ worldId: res.worldId, skipped: res.skipped });
  } catch (err) {
    if (err instanceof ImportError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[import]", err);
    return NextResponse.json({ error: "The import failed. The file may be damaged or from an incompatible version." }, { status: 400 });
  }
}
