/**
 * Authorization. Every world-scoped read or write resolves the caller's
 * membership first; there is no code path that reads world data by id alone.
 * Roles: owner > editor > viewer > player. DM tools require "editor".
 * Players (future portal) only ever receive player-safe projections.
 */
import { cache } from "react";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { campaigns, calendars, worldMembers, worlds, type MemberRole, type World, type Campaign } from "@/server/db/schema";
import { requireUser, type SessionUser } from "./session";
import { DEFAULT_CALENDAR, type CalendarDefinition } from "@/lib/calendar";

const RANK: Record<MemberRole, number> = { player: 0, viewer: 1, editor: 2, owner: 3 };

export function roleAtLeast(role: MemberRole, min: MemberRole) {
  return RANK[role] >= RANK[min];
}

export class AccessError extends Error {
  constructor(message = "You don't have access to this world.") {
    super(message);
  }
}

export interface WorldContext {
  user: SessionUser;
  world: World;
  role: MemberRole;
  calendar: CalendarDefinition;
}

async function loadWorldContext(userId: string, worldId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(worldId)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ world: worlds, role: worldMembers.role, calendar: calendars.definition })
    .from(worldMembers)
    .innerJoin(worlds, eq(worlds.id, worldMembers.worldId))
    .leftJoin(calendars, eq(calendars.id, worlds.calendarId))
    .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

const cachedWorldContext = cache(loadWorldContext);

/** For pages: 404s if the user can't see the world. */
export async function requireWorld(worldId: string, min: MemberRole = "viewer"): Promise<WorldContext> {
  const user = await requireUser();
  const row = await cachedWorldContext(user.id, worldId);
  if (!row || !roleAtLeast(row.role, min)) notFound();
  return { user, world: row.world, role: row.role, calendar: row.calendar ?? DEFAULT_CALENDAR };
}

/** For server actions: throws AccessError (turned into a friendly error) instead of 404. */
export async function authorizeWorld(worldId: string, min: MemberRole = "editor"): Promise<WorldContext> {
  const user = await requireUser();
  const row = await cachedWorldContext(user.id, worldId);
  if (!row) throw new AccessError();
  if (!roleAtLeast(row.role, min)) throw new AccessError("You don't have permission to change this world.");
  return { user, world: row.world, role: row.role, calendar: row.calendar ?? DEFAULT_CALENDAR };
}

export interface CampaignContext extends WorldContext {
  campaign: Campaign;
}

export async function requireCampaign(worldId: string, campaignId: string, min: MemberRole = "viewer"): Promise<CampaignContext> {
  const ctx = await requireWorld(worldId, min);
  const campaign = await loadCampaign(worldId, campaignId);
  if (!campaign) notFound();
  return { ...ctx, campaign };
}

export async function authorizeCampaign(worldId: string, campaignId: string, min: MemberRole = "editor"): Promise<CampaignContext> {
  const ctx = await authorizeWorld(worldId, min);
  const campaign = await loadCampaign(worldId, campaignId);
  if (!campaign) throw new AccessError("Campaign not found.");
  return { ...ctx, campaign };
}

/** World access plus, when a campaign is named, proof that it belongs to this world. */
export async function authorizeScope(worldId: string, campaignId: string | null | undefined, min: MemberRole = "editor"): Promise<WorldContext & { campaignId: string | null }> {
  if (campaignId) {
    const ctx = await authorizeCampaign(worldId, campaignId, min);
    return { ...ctx, campaignId: ctx.campaign.id };
  }
  return { ...(await authorizeWorld(worldId, min)), campaignId: null };
}

const loadCampaign = cache(async (worldId: string, campaignId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return null;
  const db = await getDb();
  const [c] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.worldId, worldId)))
    .limit(1);
  return c ?? null;
});
