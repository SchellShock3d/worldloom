/** Build the initial value for the entity form from the database (server side). */
import { eq, inArray } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, type Entity } from "@/server/db/schema";
import { getEntityTags } from "./entities";
import { getExtension } from "./entity-detail";
import type { EntityFormValue } from "@/components/entity/entity-form";
import { getEntityType } from "@/lib/entity-types";

export async function formValueFor(db: DB, worldId: string, e: Entity): Promise<EntityFormValue> {
  const refIds = [e.locationId, e.parentId].filter((x): x is string => !!x);
  const ext = await getExtension(db, worldId, e);
  if (ext?.kind === "quest") [ext.quest?.giverId, ext.quest?.threadId].forEach((x) => x && refIds.push(x));
  const refs = refIds.length ? await db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(inArray(entities.id, refIds)) : [];
  const ref = (id: string | null | undefined) => (id ? (refs.find((r) => r.id === id) ?? null) : null);
  const tags = await getEntityTags(db, e.id);
  const v: EntityFormValue = {
    id: e.id,
    type: e.type,
    name: e.name,
    aliases: e.aliases,
    summary: e.summary,
    body: e.body,
    dmNotes: e.dmNotes,
    fields: e.fields,
    status: e.status,
    location: ref(e.locationId),
    parent: ref(e.parentId),
    visibility: e.visibility,
    canonStatus: e.canonStatus,
    importance: e.importance,
    tags: tags.map((t) => t.name),
    imageFileId: e.imageFileId,
    campaignId: e.campaignId,
  };
  if (ext?.kind === "quest" && ext.quest)
    v.quest = {
      status: ext.quest.status,
      priority: ext.quest.priority,
      giver: ref(ext.quest.giverId),
      thread: ref(ext.quest.threadId),
      rewards: ext.quest.rewards,
      prerequisites: ext.quest.prerequisites,
      consequences: ext.quest.consequences,
      playerKnowledge: ext.quest.playerKnowledge,
      objectives: ext.objectives.map((o) => ({ text: o.text, status: o.status, hidden: o.hidden })),
    };
  if (ext?.kind === "thread" && ext.thread)
    v.thread = {
      status: ext.thread.status,
      progress: ext.thread.progress,
      urgency: ext.thread.urgency,
      momentum: ext.thread.momentum,
      goals: ext.thread.goals,
      nextMilestone: ext.thread.nextMilestone,
      nextMilestoneAt: ext.thread.nextMilestoneAt,
      possibleOutcomes: ext.thread.possibleOutcomes,
      triggers: ext.thread.triggers,
      startAt: ext.thread.startAt,
      stages: ext.stages.map((s) => ({ title: s.title, description: s.description })),
    };
  if (ext?.kind === "mystery" && ext.mystery) v.mystery = { question: ext.mystery.question, truth: ext.mystery.truth, status: ext.mystery.status };
  if (ext?.kind === "rumour" && ext.rumour) v.rumour = { claim: ext.rumour.claim, truth: ext.rumour.truth, accuracy: ext.rumour.accuracy, distortion: ext.rumour.distortion, originText: ext.rumour.originText, startedAt: ext.rumour.startedAt, expiresAt: ext.rumour.expiresAt };
  if (ext?.kind === "event" && ext.event) v.event = { startAt: ext.event.startAt, endAt: ext.event.endAt, precision: ext.event.precision, kind: ext.event.kind };
  return v;
}

export async function blankFormValue(db: DB, type: string, opts: { now: number; campaignId: string | null; locationId?: string | null; name?: string }): Promise<EntityFormValue> {
  const def = getEntityType(type);
  let location = null;
  if (opts.locationId) {
    const [l] = await db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(eq(entities.id, opts.locationId));
    location = l ?? null;
  }
  const v: EntityFormValue = {
    type,
    name: opts.name ?? "",
    aliases: [],
    summary: "",
    body: "",
    dmNotes: "",
    fields: {},
    status: def.statuses?.[0] ?? null,
    location,
    parent: null,
    visibility: "secret",
    canonStatus: "canon",
    importance: 0,
    tags: [],
    imageFileId: null,
    campaignId: def.campaignScoped || type === "quest" || type === "mystery" ? opts.campaignId : null,
  };
  if (def.extension === "quest") v.quest = { status: "available", priority: 1, giver: null, thread: null, rewards: "", prerequisites: "", consequences: "", playerKnowledge: "", objectives: [] };
  if (def.extension === "thread") v.thread = { status: "active", progress: 0, urgency: 3, momentum: 10, goals: "", nextMilestone: "", nextMilestoneAt: null, possibleOutcomes: "", triggers: "", startAt: opts.now, stages: [] };
  if (def.extension === "mystery") v.mystery = { question: "", truth: "", status: "open" };
  if (def.extension === "rumour") v.rumour = { claim: "", truth: "", accuracy: 50, distortion: "", originText: "", startedAt: opts.now, expiresAt: null };
  if (def.extension === "event") v.event = { startAt: opts.now, endAt: null, precision: "day", kind: opts.campaignId ? "campaign" : "historical" };
  return v;
}
