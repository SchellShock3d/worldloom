/**
 * The player's side of the world: only what the party could know. Everything
 * here is filtered on the server; DM-only text never reaches the browser.
 *
 * Rules: an entity is known when it's public / discovered / partially known,
 * or secret but discovered in this campaign. DM-only entries never appear.
 * :::dm blocks and DM-section fields are stripped; mentions of unknown
 * entities render as plain text.
 */
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { campaigns, entities, gameSessions, questObjectives, quests, rumours, type Campaign } from "@/server/db/schema";
import { getPlayerKnownEntities } from "./knowledge";
import { listRelationshipsFor } from "./relationships";
import { listTimeline } from "./timeline";
import { getCustomTypes } from "./entities";
import { fieldToText, getEntityType } from "@/lib/entity-types";
import { toPlayerMarkdown } from "@/lib/mentions";

const OPEN_VIS = ["public", "discovered", "partially_known"] as const;

export async function pickPlayerCampaign(db: DB, worldId: string, requested?: string | null): Promise<{ campaign: Campaign | null; all: Campaign[] }> {
  const all = await db.select().from(campaigns).where(eq(campaigns.worldId, worldId)).orderBy(desc(campaigns.updatedAt));
  const campaign = all.find((c) => c.id === requested) ?? all.find((c) => c.status === "active") ?? all[0] ?? null;
  return { campaign, all };
}

export type KnownMap = Map<string, { name: string; type: string; summary: string; visibility: string }>;

export async function knownToPlayers(db: DB, worldId: string, campaignId: string | null): Promise<KnownMap> {
  if (campaignId) {
    const rows = await getPlayerKnownEntities(db, worldId, campaignId);
    return new Map(rows.map((r) => [r.id, { name: r.name, type: r.type, summary: r.summary, visibility: r.visibility }]));
  }
  const rows = await db
    .select({ id: entities.id, name: entities.name, type: entities.type, summary: entities.summary, visibility: entities.visibility })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), isNull(entities.campaignId), ne(entities.canonStatus, "archived"), inArray(entities.visibility, [...OPEN_VIS])));
  return new Map(rows.map((r) => [r.id, { name: r.name, type: r.type, summary: r.summary, visibility: r.visibility }]));
}

export async function playerOverview(db: DB, worldId: string, campaign: Campaign | null) {
  const known = await knownToPlayers(db, worldId, campaign?.id ?? null);
  const ids = [...known.keys()];

  const questRows = ids.length
    ? await db
        .select({ id: entities.id, name: entities.name, summary: entities.summary, status: quests.status, playerKnowledge: quests.playerKnowledge, rewards: quests.rewards, giverId: quests.giverId })
        .from(quests)
        .innerJoin(entities, eq(entities.id, quests.entityId))
        .where(and(inArray(entities.id, ids), inArray(quests.status, ["available", "active", "completed", "failed"])))
        .orderBy(desc(entities.updatedAt))
    : [];
  const objectives = questRows.length
    ? await db.select().from(questObjectives).where(and(inArray(questObjectives.questId, questRows.map((q) => q.id)), eq(questObjectives.hidden, false))).orderBy(asc(questObjectives.position))
    : [];

  const rumourRows = ids.length
    ? await db
        .select({ id: entities.id, claim: rumours.claim, name: entities.name, startedAt: rumours.startedAt, locationId: entities.locationId })
        .from(rumours)
        .innerJoin(entities, eq(entities.id, rumours.entityId))
        .where(inArray(entities.id, ids))
        .orderBy(desc(rumours.startedAt))
        .limit(12)
    : [];

  const timeline = (await listTimeline(db, worldId, { campaignId: campaign?.id ?? null, visibleOnly: true, order: "desc", limit: 40, to: campaign?.currentAt })).filter(
    (e) => e.canonStatus === "canon" && known.has(e.id),
  );

  const recaps = campaign
    ? await db
        .select({ id: gameSessions.id, number: gameSessions.number, title: gameSessions.title, recap: gameSessions.recap })
        .from(gameSessions)
        .where(and(eq(gameSessions.campaignId, campaign.id), inArray(gameSessions.status, ["completed", "processed"])))
        .orderBy(desc(gameSessions.number))
        .limit(5)
    : [];

  const party = campaign
    ? await db.select({ id: entities.id, name: entities.name, summary: entities.summary, fields: entities.fields, status: entities.status }).from(entities).where(and(eq(entities.campaignId, campaign.id), eq(entities.type, "pc"))).orderBy(asc(entities.name))
    : [];

  return {
    known,
    quests: questRows.map((q) => ({
      ...q,
      giver: q.giverId && known.has(q.giverId) ? { id: q.giverId, name: known.get(q.giverId)!.name } : null,
      objectives: objectives.filter((o) => o.questId === q.id).map((o) => ({ id: o.id, text: o.text, status: o.status })),
    })),
    rumours: rumourRows.map((r) => ({ id: r.id, claim: r.claim || r.name, startedAt: r.startedAt, location: r.locationId && known.has(r.locationId) ? { id: r.locationId, name: known.get(r.locationId)!.name } : null })),
    timeline: timeline.map((e) => ({ id: e.id, name: e.name, summary: e.summary, startAt: e.startAt, precision: e.precision })),
    recaps: recaps.filter((r) => r.recap.trim()).map((r) => ({ ...r, recap: toPlayerMarkdown(r.recap) })),
    party: party.map((p) => ({ id: p.id, name: p.name, summary: p.summary, className: String((p.fields as Record<string, unknown>).className ?? ""), level: (p.fields as Record<string, unknown>).level ?? null, status: p.status })),
    location: campaign?.currentLocationId && known.has(campaign.currentLocationId) ? { id: campaign.currentLocationId, name: known.get(campaign.currentLocationId)!.name } : null,
  };
}

export async function playerEntity(db: DB, worldId: string, campaign: Campaign | null, entityId: string) {
  const known = await knownToPlayers(db, worldId, campaign?.id ?? null);
  if (!known.has(entityId)) return null;
  const [e] = await db.select().from(entities).where(and(eq(entities.id, entityId), eq(entities.worldId, worldId)));
  if (!e) return null;
  const custom = await getCustomTypes(db, worldId);
  const def = getEntityType(e.type, custom);
  const fields = def.fields
    .filter((f) => f.section !== "dm" && !/secret/i.test(f.key))
    .map((f) => ({ label: f.label, text: fieldToText(f, (e.fields as Record<string, unknown>)[f.key]) }))
    .filter((f) => f.text);
  const rels = (await listRelationshipsFor(db, worldId, e.id, campaign?.id ?? null)).filter((r) => (OPEN_VIS as readonly string[]).includes(r.visibility) && known.has(r.other.id) && r.canonStatus === "canon");
  // Location chain, but only the places players know about.
  const chain: { id: string; name: string }[] = [];
  let cur = e.locationId;
  for (let i = 0; cur && i < 12; i++) {
    const k = known.get(cur);
    if (!k) break;
    chain.unshift({ id: cur, name: k.name });
    const [row] = await db.select({ next: entities.locationId }).from(entities).where(eq(entities.id, cur));
    cur = row?.next ?? null;
  }
  const inside = [...known.entries()].length
    ? await db
        .select({ id: entities.id, name: entities.name, type: entities.type, summary: entities.summary })
        .from(entities)
        .where(and(eq(entities.worldId, worldId), eq(entities.locationId, e.id), inArray(entities.id, [...known.keys()])))
        .orderBy(asc(entities.name))
    : [];
  const refs = Object.fromEntries([...known.entries()].map(([id, k]) => [id, { name: k.name, type: k.type, summary: k.summary }]));
  return {
    entity: { id: e.id, name: e.name, type: e.type, summary: e.summary, status: e.status, aliases: e.aliases, partial: e.visibility === "partially_known", imageFileId: e.imageFileId },
    label: def.label,
    body: toPlayerMarkdown(e.body),
    fields,
    relationships: rels.map((r) => ({ id: r.id, label: r.label, other: { id: r.other.id, name: r.other.name, type: r.other.type } })),
    chain,
    inside,
    refs,
  };
}
