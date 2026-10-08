import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { authSessions, users, type User } from "@/server/db/schema";

export const SESSION_COOKIE = "wl_session";
const SESSION_DAYS = 30;
const RENEW_WHEN_DAYS_LEFT = 15;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type SessionUser = Pick<User, "id" | "email" | "name" | "preferences">;

/**
 * Whether the browser reached us over HTTPS. Next's server sets x-forwarded-proto for direct
 * connections and proxies pass theirs on, so this is right for http://localhost, a LAN address,
 * and an HTTPS deployment alike. Secure cookies over plain HTTP would silently break sign-in.
 */
async function requestIsHttps() {
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "https";
  return process.env.NODE_ENV === "production";
}

export async function createSession(userId: string) {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db.insert(authSessions).values({ id: hashToken(token), userId, expiresAt, userAgent: ua });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.INSECURE_COOKIES !== "true" && (await requestIsHttps()),
    path: "/",
    expires: expiresAt,
  });
  // Opportunistic cleanup of expired sessions.
  await db.delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
}

/** Validates the session cookie. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const id = hashToken(token);
  const [row] = await db
    .select({ user: { id: users.id, email: users.email, name: users.name, preferences: users.preferences }, expiresAt: authSessions.expiresAt })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.id, id), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt.getTime() - Date.now() < RENEW_WHEN_DAYS_LEFT * 864e5) {
    await db
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) })
      .where(eq(authSessions.id, id));
  }
  return row.user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(authSessions).where(eq(authSessions.id, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}
