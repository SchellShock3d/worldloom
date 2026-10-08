"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { users, worldMembers } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { authorizeWorld } from "@/server/auth/access";
import { createWorld, deleteWorld, updateWorld } from "@/server/services/worlds";
import { setWorldTime } from "@/server/services/clock";
import { updateWorldCalendar } from "@/server/services/calendar-edit";
import { userActor } from "@/server/services/history";
import { type WorldInput } from "@/lib/validation";
import { run } from "./_util";

export async function createWorldAction(input: WorldInput) {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const world = await createWorld(db, { ...userActor(user.id), userId: user.id }, input);
    await db.update(users).set({ preferences: { ...user.preferences, lastWorldId: world.id } }).where(eq(users.id, user.id));
    revalidatePath("/");
    return { id: world.id };
  });
}

export async function updateWorldAction(worldId: string, input: Partial<WorldInput> & { settings?: Record<string, unknown> }) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await updateWorld(db, userActor(user.id), worldId, input);
    revalidatePath(`/w/${worldId}`, "layout");
    return null;
  }, "World updated");
}

export async function deleteWorldAction(worldId: string, confirmName: string) {
  return run(async () => {
    const { world } = await authorizeWorld(worldId, "owner");
    if (confirmName.trim() !== world.name) throw new Error("Type the world's name exactly to confirm.");
    const db = await getDb();
    await deleteWorld(db, worldId);
    revalidatePath("/");
    return null;
  });
}

export async function setThemeAction(theme: "light" | "dark" | "system") {
  z.enum(["light", "dark", "system"]).parse(theme);
  (await cookies()).set("wl_theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

export async function setActiveCampaignAction(worldId: string, campaignId: string | null) {
  await authorizeWorld(worldId, "viewer");
  const jar = await cookies();
  jar.set(`wl_campaign_${worldId}`, campaignId ?? "none", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath(`/w/${worldId}`, "layout");
}

/** Correct the world clock directly (worlds without an active campaign). */
export async function setWorldTimeAction(worldId: string, toAt: number) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await setWorldTime(db, worldId, userActor(user.id), Math.round(z.number().finite().parse(toAt)));
    revalidatePath(`/w/${worldId}`, "layout");
    return null;
  }, "Date updated");
}

/** Replace the world's calendar. keepDates re-encodes stored times so events stay on the same named days. */
export async function updateCalendarAction(worldId: string, definition: unknown, opts: { keepDates: boolean }) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const res = await updateWorldCalendar(db, worldId, userActor(user.id), definition, { keepDates: !!opts.keepDates });
    revalidatePath(`/w/${worldId}`, "layout");
    return res;
  }, "Calendar saved");
}

// Members ---------------------------------------------------------------------
const roleInput = z.enum(["editor", "viewer", "player"]);

/** Add an existing account to the world. (Email invitations need a mail service; see README.) */
export async function addMemberAction(worldId: string, email: string, role: "editor" | "viewer" | "player") {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "owner");
    const r = roleInput.parse(role);
    const addr = z.string().trim().toLowerCase().email("Enter an email address.").parse(email);
    const db = await getDb();
    const [target] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, addr));
    if (!target) throw new Error("No account uses that email yet. Ask them to sign up first, then add them here.");
    if (target.id === user.id) throw new Error("You're already the owner.");
    await db.insert(worldMembers).values({ worldId, userId: target.id, role: r }).onConflictDoUpdate({ target: [worldMembers.worldId, worldMembers.userId], set: { role: r } });
    revalidatePath(`/w/${worldId}`, "layout");
    return { name: target.name };
  }, "Member added");
}

export async function setMemberRoleAction(worldId: string, userId: string, role: "owner" | "editor" | "viewer" | "player") {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "owner");
    const r = z.enum(["owner", "editor", "viewer", "player"]).parse(role);
    const db = await getDb();
    if (userId === user.id && r !== "owner") {
      const owners = await db.select({ id: worldMembers.userId }).from(worldMembers).where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.role, "owner")));
      if (owners.length < 2) throw new Error("Make someone else an owner before stepping down.");
    }
    await db.update(worldMembers).set({ role: r }).where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, userId)));
    revalidatePath(`/w/${worldId}`, "layout");
    return null;
  }, "Role updated");
}

export async function removeMemberAction(worldId: string, userId: string) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, userId === (await requireUser()).id ? "player" : "owner");
    const db = await getDb();
    const [m] = await db.select().from(worldMembers).where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, userId)));
    if (!m) throw new Error("Not a member");
    if (m.role === "owner") {
      const owners = await db.select({ id: worldMembers.userId }).from(worldMembers).where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.role, "owner")));
      if (owners.length < 2) throw new Error("A world needs at least one owner.");
    }
    await db.delete(worldMembers).where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, userId)));
    revalidatePath(userId === user.id ? "/" : `/w/${worldId}`, "layout");
    return null;
  }, "Removed");
}
