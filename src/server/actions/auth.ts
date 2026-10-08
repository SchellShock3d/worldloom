"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, destroySession } from "@/server/auth/session";
import { clear, hit } from "@/server/auth/rate-limit";

async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

const tooMany = (ms: number) => `Too many attempts. Try again in ${Math.max(1, Math.ceil(ms / 60000))} minute${ms > 60000 ? "s" : ""}.`;

/** Only same-site paths: no scheme, no protocol-relative or backslash tricks. */
function safeNext(next: string) {
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\s]/.test(next) || /[\u0000-\u001f]/.test(next)) return "/";
  try {
    const u = new URL(next, "http://worldloom.local");
    return u.origin === "http://worldloom.local" ? `${u.pathname}${u.search}${u.hash}` : "/";
  } catch {
    return "/";
  }
}

// A real hash to compare against when the email is unknown, so timing doesn't reveal which accounts exist.
let dummyHash: Promise<string> | null = null;

export type AuthState = { error?: string; fields?: { email?: string; name?: string } } | undefined;

const signupSchema = z.object({
  name: z.string().trim().min(1, "Tell us what to call you").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export async function signup(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse({ name: form.get("name"), email: form.get("email"), password: form.get("password") });
  const fields = { email: String(form.get("email") ?? ""), name: String(form.get("name") ?? "") };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, fields };
  const limited = hit(`signup:${await clientIp()}`, 10, 60 * 60 * 1000);
  if (!limited.ok) return { error: tooMany(limited.retryAfterMs), fields };
  const db = await getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email));
  if (existing) return { error: "An account with that email already exists. Sign in instead.", fields };
  const [user] = await db
    .insert(users)
    .values({ email: parsed.data.email, name: parsed.data.name, passwordHash: await hashPassword(parsed.data.password) })
    .returning({ id: users.id });
  await createSession(user!.id);
  redirect("/onboarding");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password").max(200, "That password is too long"),
});

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  const fields = { email: String(form.get("email") ?? "") };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, fields };
  const ip = await clientIp();
  const byIp = hit(`login-ip:${ip}`, 30, 15 * 60 * 1000);
  const byEmail = hit(`login-email:${parsed.data.email}`, 10, 15 * 60 * 1000);
  if (!byIp.ok || !byEmail.ok) return { error: tooMany(Math.max(byIp.retryAfterMs, byEmail.retryAfterMs)), fields };
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));
  dummyHash ??= hashPassword("not-a-real-password");
  const valid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : (await verifyPassword(parsed.data.password, await dummyHash), false);
  // Same message either way so accounts can't be enumerated.
  if (!user || !valid) {
    return { error: "That email and password don't match.", fields };
  }
  clear(`login-email:${parsed.data.email}`);
  await createSession(user.id);
  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
