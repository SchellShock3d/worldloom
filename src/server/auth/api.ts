import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { worldMembers, type MemberRole } from "@/server/db/schema";
import { getCurrentUser } from "./session";
import { roleAtLeast } from "./access";

/** Route-handler variant of requireWorld: returns a JSON error response instead of redirecting. */
export async function apiWorld(worldId: string, min: MemberRole = "viewer") {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  if (!/^[0-9a-f-]{36}$/i.test(worldId)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  const db = await getDb();
  const [m] = await db
    .select({ role: worldMembers.role })
    .from(worldMembers)
    .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, user.id)));
  if (!m || !roleAtLeast(m.role, min)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { user, role: m.role, db } as const;
}
