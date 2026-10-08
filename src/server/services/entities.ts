import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import {
  customEntityTypes,
  entities,
  entityTags,
  events,
  mysteries,
  questObjectives,
  quests,
  rumours,
  tags,
  threadStages,
  worldThreads,
  type Entity,
} from "@/server/db/schema";
import { getEntityType, sanitizeFields, type CustomTypeLike, type EntityTypeDef } from "@/lib/entity-types";
import { resolvePlainMentions } from "@/lib/mentions";
import { slugify } from "@/lib/utils";
import {
  entityInput,
  entityPatch,
  eventExtension,
  mysteryExtension,
  questExtension,
  rumourExtension,
  threadExtension,
  type EntityInput,
  type EntityPatch,
 parsePatch } from "@/lib/validation";
import { diffRecords, getNameIndex, recordRevision, syncMentions, type Actor } from "./history";

export class EntityError extends Error {}

export async function getCustomTypes(db: DB, worldId: string): Promise<CustomTypeLike[]> {
  const rows = await db.select().from(customEntityTypes).where(eq(customEntityTypes.worldId, worldId)).orderBy(asc(customEntityTypes.name));
  return rows.map((r) => ({ key: r.key, name: r.name, pluralName: r.pluralName, icon: r.icon, description: r.description, isPlace: r.isPlace, fields: r.fields }));
}

export async function resolveType(db: DB, worldId: string, type: string): Promise<EntityTypeDef> {
  const def = getEntityType(type);
  if (def.description !== "Unknown type") return def;
  const custom = await getCustomTypes(db, worldId);
  const c = getEntityType(type, custom);
  if (c.description === "Unknown type") throw new EntityError(`Unknown entity type "${type}"`);
  return c;
}

async function uniqueSlug(db: DB, worldId: string, name: string, excludeId?: string) {
  const base = slugify(name);
  const rows = await db
    .select({ slug: entities.slug })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), or(eq(entities.slug, base), ilike(entities.slug, `${base}-%`)), excludeId ? ne(entities.id, excludeId) : undefined));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

async function assertSameWorld(db: DB, worldId: string, ids: (string | null | undefined)[]) {
  const list = ids.filter((x): x is string => !!x);
  if (!list.length) return;
  const rows = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.worldId, worldId), inArray(entities.id, list)));
  if (rows.length !== new Set(list).size) throw new EntityError("A referenced entity does not exist in this world.");
}

async function setTags(db: DB, worldId: string, entityId: string, names: string[]) {
  await db.delete(entityTags).where(eq(entityTags.entityId, entityId));
  const clean = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (!clean.length) return;
  await db.insert(tags).values(clean.map((name) => ({ worldId, name }))).onConflictDoNothing();
  const rows = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.worldId, worldId), inArray(tags.name, clean)));
  await db.insert(entityTags).values(rows.map((r) => ({ entityId, tagId: r.id }))).onConflictDoNothing();
}

export interface CreateEntityOptions {
  /** Skip @Name → token resolution (e.g. bulk import). */
  skipMentionResolution?: boolean;
}

export async function createEntity(db: DB, worldId: string, actor: Actor, raw: EntityInput, opts: CreateEntityOptions = {}): Promise<Entity> {
  const input = entityInput.parse(raw);
  const def = await resolveType(db, worldId, input.type);
  if (def.campaignScoped && !input.campaignId) throw new EntityError(`${def.label}s must belong to a campaign.`);
  await assertSameWorld(db, worldId, [input.locationId, input.parentId]);

  let body = input.body;
  let dmNotes = input.dmNotes;
  if (!opts.skipMentionResolution && (body.includes("@") || dmNotes.includes("@"))) {
    const index = await getNameIndex(db, worldId, input.campaignId);
    body = resolvePlainMentions(body, index);
    dmNotes = resolvePlainMentions(dmNotes, index);
  }

  const slug = await uniqueSlug(db, worldId, input.name);
  const [row] = await db
    .insert(entities)
    .values({
      worldId,
      campaignId: input.campaignId ?? null,
      type: def.key,
      name: input.name,
      slug,
      aliases: input.aliases,
      summary: input.summary,
      body,
      dmNotes,
      fields: sanitizeFields(def, input.fields),
      status: input.status ?? def.statuses?.[0] ?? null,
      locationId: input.locationId ?? null,
      parentId: input.parentId ?? null,
      imageFileId: input.imageFileId ?? null,
      canonStatus: input.canonStatus,
      visibility: input.visibility,
      importance: input.importance,
      createdBy: actor.userId,
    })
    .returning();
  if (!row) throw new EntityError("Could not create entity");

  await setTags(db, worldId, row.id, input.tags);
  await syncMentions(db, worldId, "entity", row.id, body, dmNotes);

  // Extension rows
  switch (def.extension) {
    case "quest": {
      const q = questExtension.parse(input.quest ?? {});
      await assertSameWorld(db, worldId, [q.giverId, q.threadId]);
      await db.insert(quests).values({ entityId: row.id, ...omit(q, "objectives"), giverId: q.giverId ?? null, threadId: q.threadId ?? null });
      if (q.objectives.length)
        await db.insert(questObjectives).values(q.objectives.map((o, i) => ({ questId: row.id, text: o.text, status: o.status, hidden: o.hidden, position: i })));
      break;
    }
    case "thread": {
      const t = threadExtension.parse(input.thread ?? {});
      await db.insert(worldThreads).values({ entityId: row.id, ...omit(t, "stages"), nextMilestoneAt: t.nextMilestoneAt ?? null, startAt: t.startAt ?? null });
      if (t.stages.length) await db.insert(threadStages).values(t.stages.map((s, i) => ({ threadId: row.id, position: i, title: s.title, description: s.description })));
      break;
    }
    case "mystery": {
      const m = mysteryExtension.parse(input.mystery ?? {});
      await db.insert(mysteries).values({ entityId: row.id, ...m });
      break;
    }
    case "rumour": {
      const r = rumourExtension.parse(input.rumour ?? { claim: input.summary || input.name });
      await db.insert(rumours).values({ entityId: row.id, ...r, originEventId: r.originEventId ?? null, startedAt: r.startedAt ?? null, expiresAt: r.expiresAt ?? null });
      break;
    }
    case "event": {
      if (!input.event) throw new EntityError("Events need a date.");
      const e = eventExtension.parse(input.event);
      await db.insert(events).values({ entityId: row.id, ...e, endAt: e.endAt ?? null, sessionId: e.sessionId ?? null });
      break;
    }
  }

  await recordRevision(db, actor, {
    worldId,
    campaignId: row.campaignId,
    targetKind: "entity",
    targetId: row.id,
    targetLabel: row.name,
    action: "create",
    summary: `Created ${def.label.toLowerCase()} "${row.name}"`,
    after: snapshot(row),
  });
  return row;
}

function omit<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

/** Fields stored in revision snapshots (drop generated/noisy columns). */
export function snapshot(e: Entity): Record<string, unknown> {
  const { searchVector: _sv, createdAt: _c, updatedAt: _u, ...rest } = e;
  return rest;
}

export async function updateEntity(db: DB, worldId: string, actor: Actor, entityId: string, raw: EntityPatch): Promise<Entity> {
  const patch = parsePatch(entityPatch, raw);
  const [before] = await db.select().from(entities).where(and(eq(entities.id, entityId), eq(entities.worldId, worldId)));
  if (!before) throw new EntityError("Entity not found");
  const def = await resolveType(db, worldId, before.type);
  if (patch.locationId === entityId || patch.parentId === entityId) throw new EntityError("An entity can't contain itself.");
  await assertSameWorld(db, worldId, [patch.locationId, patch.parentId]);
  if (patch.locationId) await assertNoCycle(db, entityId, patch.locationId, "locationId");
  if (patch.parentId) await assertNoCycle(db, entityId, patch.parentId, "parentId");

  const values: Partial<typeof entities.$inferInsert> = {};
  const assign = <K extends keyof typeof values>(k: K, v: (typeof values)[K] | undefined) => {
    if (v !== undefined) values[k] = v;
  };
  let index: Awaited<ReturnType<typeof getNameIndex>> | null = null;
  const resolve = async (md: string | undefined) => {
    if (md === undefined || !md.includes("@")) return md;
    index ??= await getNameIndex(db, worldId, before.campaignId);
    return resolvePlainMentions(md, index);
  };

  assign("name", patch.name);
  assign("summary", patch.summary);
  assign("body", await resolve(patch.body));
  assign("dmNotes", await resolve(patch.dmNotes));
  assign("aliases", patch.aliases);
  if (patch.fields !== undefined) values.fields = sanitizeFields(def, patch.fields);
  assign("status", patch.status);
  assign("locationId", patch.locationId);
  assign("parentId", patch.parentId);
  assign("imageFileId", patch.imageFileId);
  assign("canonStatus", patch.canonStatus);
  assign("visibility", patch.visibility);
  assign("importance", patch.importance);
  if (patch.name && patch.name !== before.name) values.slug = await uniqueSlug(db, worldId, patch.name, entityId);

  let after = before;
  if (Object.keys(values).length) {
    const [row] = await db.update(entities).set(values).where(eq(entities.id, entityId)).returning();
    after = row!;
  }
  if (patch.tags) await setTags(db, worldId, entityId, patch.tags);
  if (values.body !== undefined || values.dmNotes !== undefined) await syncMentions(db, worldId, "entity", entityId, after.body, after.dmNotes);

  const extChanges = await updateExtension(db, worldId, def, entityId, patch);

  const diff = diffRecords(snapshot(before), snapshot(after));
  if (diff.changed.length || extChanges.length || patch.tags) {
    await recordRevision(db, actor, {
      worldId,
      campaignId: after.campaignId,
      targetKind: "entity",
      targetId: entityId,
      targetLabel: after.name,
      action: "update",
      summary: describeChange([...diff.changed, ...extChanges, ...(patch.tags ? ["tags"] : [])]),
      before: { ...diff.before },
      after: { ...diff.after, ...(extChanges.length ? { extension: raw[(def.extension ?? "x") as keyof EntityPatch] } : {}) },
    });
  }
  return after;
}

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  summary: "summary",
  body: "article",
  dmNotes: "DM notes",
  aliases: "aliases",
  fields: "details",
  status: "status",
  locationId: "location",
  parentId: "parent page",
  imageFileId: "image",
  canonStatus: "canon status",
  visibility: "visibility",
  importance: "importance",
  slug: "",
};

function describeChange(keys: string[]) {
  const labels = Array.from(new Set(keys.map((k) => FIELD_LABELS[k] ?? k).filter(Boolean)));
  if (!labels.length) return "Updated";
  return `Changed ${labels.join(", ")}`;
}

async function assertNoCycle(db: DB, entityId: string, targetId: string, column: "locationId" | "parentId") {
  // Walk up from target; if we reach entityId it's a cycle.
  let current: string | null = targetId;
  for (let depth = 0; current && depth < 50; depth++) {
    if (current === entityId) throw new EntityError(column === "locationId" ? "That would place this inside itself." : "That would make a page its own ancestor.");
    const [row] = await db.select({ next: entities[column] }).from(entities).where(eq(entities.id, current));
    current = row?.next ?? null;
  }
}

async function updateExtension(db: DB, worldId: string, def: EntityTypeDef, entityId: string, patch: ReturnType<typeof entityPatch.parse>): Promise<string[]> {
  const changed: string[] = [];
  switch (def.extension) {
    case "quest": {
      if (!patch.quest) break;
      const { objectives, ...rest } = patch.quest;
      await assertSameWorld(db, worldId, [rest.giverId, rest.threadId]);
      if (Object.keys(rest).length) {
        if (rest.status === "completed") Object.assign(rest, {});
        await db.insert(quests).values({ entityId, ...rest }).onConflictDoUpdate({ target: quests.entityId, set: rest });
        changed.push(...Object.keys(rest));
      }
      if (objectives) {
        await db.delete(questObjectives).where(eq(questObjectives.questId, entityId));
        if (objectives.length)
          await db.insert(questObjectives).values(objectives.map((o, i) => ({ questId: entityId, text: o.text, status: o.status ?? "open", hidden: o.hidden ?? false, position: i })));
        changed.push("objectives");
      }
      break;
    }
    case "thread": {
      if (!patch.thread) break;
      const { stages, ...rest } = patch.thread;
      if (Object.keys(rest).length) {
        await db.insert(worldThreads).values({ entityId, ...rest }).onConflictDoUpdate({ target: worldThreads.entityId, set: rest });
        changed.push(...Object.keys(rest));
      }
      if (stages) {
        const existing = await db.select().from(threadStages).where(eq(threadStages.threadId, entityId));
        await db.delete(threadStages).where(eq(threadStages.threadId, entityId));
        if (stages.length)
          await db.insert(threadStages).values(
            stages.map((s, i) => ({
              threadId: entityId,
              position: i,
              title: s.title,
              description: s.description ?? "",
              reachedAt: existing.find((e) => e.title === s.title)?.reachedAt ?? null,
            })),
          );
        changed.push("stages");
      }
      break;
    }
    case "mystery":
      if (patch.mystery && Object.keys(patch.mystery).length) {
        await db.insert(mysteries).values({ entityId, ...patch.mystery }).onConflictDoUpdate({ target: mysteries.entityId, set: patch.mystery });
        changed.push(...Object.keys(patch.mystery));
      }
      break;
    case "rumour":
      if (patch.rumour && Object.keys(patch.rumour).length) {
        const [existing] = await db.select().from(rumours).where(eq(rumours.entityId, entityId));
        if (existing) await db.update(rumours).set(patch.rumour).where(eq(rumours.entityId, entityId));
        else await db.insert(rumours).values({ entityId, claim: patch.rumour.claim ?? "", ...patch.rumour });
        changed.push(...Object.keys(patch.rumour));
      }
      break;
    case "event":
      if (patch.event && Object.keys(patch.event).length) {
        const [existing] = await db.select().from(events).where(eq(events.entityId, entityId));
        if (existing) await db.update(events).set(patch.event).where(eq(events.entityId, entityId));
        else if (patch.event.startAt !== undefined) await db.insert(events).values({ entityId, startAt: patch.event.startAt, ...patch.event });
        changed.push(...Object.keys(patch.event));
      }
      break;
  }
  return changed;
}

export async function deleteEntity(db: DB, worldId: string, actor: Actor, entityId: string) {
  const [before] = await db.select().from(entities).where(and(eq(entities.id, entityId), eq(entities.worldId, worldId)));
  if (!before) throw new EntityError("Entity not found");
  await db.delete(entities).where(eq(entities.id, entityId));
  await recordRevision(db, actor, {
    worldId,
    campaignId: before.campaignId,
    targetKind: "entity",
    targetId: entityId,
    targetLabel: before.name,
    action: "delete",
    summary: `Deleted ${before.type} "${before.name}"`,
    before: snapshot(before),
  });
  return before;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface ListEntitiesOptions {
  types?: string[];
  campaignId?: string | null;
  /** include world canon + this campaign's entities (default) or only campaign entities */
  campaignOnly?: boolean;
  q?: string;
  tag?: string;
  status?: string;
  locationId?: string;
  canon?: ("draft" | "proposed" | "canon" | "archived")[];
  sort?: "name" | "updated" | "created" | "importance";
  limit?: number;
  offset?: number;
}

export function campaignScope(campaignId: string | null | undefined, campaignOnly = false): SQL {
  if (campaignOnly && campaignId) return eq(entities.campaignId, campaignId);
  if (campaignId) return sql`(${entities.campaignId} is null or ${entities.campaignId} = ${campaignId})`;
  return isNull(entities.campaignId);
}

export async function listEntities(db: DB, worldId: string, opts: ListEntitiesOptions = {}) {
  const where: (SQL | undefined)[] = [eq(entities.worldId, worldId), campaignScope(opts.campaignId, opts.campaignOnly)];
  if (opts.types?.length) where.push(inArray(entities.type, opts.types));
  if (opts.status) where.push(eq(entities.status, opts.status));
  if (opts.locationId) where.push(eq(entities.locationId, opts.locationId));
  if (opts.canon?.length) where.push(inArray(entities.canonStatus, opts.canon));
  else where.push(ne(entities.canonStatus, "archived"));
  if (opts.q) {
    const q = opts.q.trim();
    where.push(or(ilike(entities.name, `%${q}%`), sql`${q} ilike any(${entities.aliases})`, sql`similarity(${entities.name}, ${q}) > 0.3`));
  }
  if (opts.tag) {
    where.push(
      sql`exists (select 1 from ${entityTags} et join ${tags} t on t.id = et.tag_id where et.entity_id = ${entities.id} and t.name = ${opts.tag})`,
    );
  }
  const order =
    opts.sort === "updated"
      ? [desc(entities.updatedAt)]
      : opts.sort === "created"
        ? [desc(entities.createdAt)]
        : opts.sort === "importance"
          ? [desc(entities.importance), desc(entities.updatedAt)]
          : [asc(sql`lower(${entities.name})`)];
  return db
    .select({
      id: entities.id,
      type: entities.type,
      name: entities.name,
      summary: entities.summary,
      status: entities.status,
      fields: entities.fields,
      locationId: entities.locationId,
      campaignId: entities.campaignId,
      canonStatus: entities.canonStatus,
      visibility: entities.visibility,
      importance: entities.importance,
      imageFileId: entities.imageFileId,
      aliases: entities.aliases,
      updatedAt: entities.updatedAt,
    })
    .from(entities)
    .where(and(...where))
    .orderBy(...order)
    .limit(opts.limit ?? 500)
    .offset(opts.offset ?? 0);
}

export type EntityListItem = Awaited<ReturnType<typeof listEntities>>[number];

export async function getEntity(db: DB, worldId: string, entityId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(entityId)) return null;
  const [row] = await db.select().from(entities).where(and(eq(entities.id, entityId), eq(entities.worldId, worldId)));
  return row ?? null;
}

export async function getEntityTags(db: DB, entityId: string) {
  const rows = await db
    .select({ name: tags.name, color: tags.color })
    .from(entityTags)
    .innerJoin(tags, eq(tags.id, entityTags.tagId))
    .where(eq(entityTags.entityId, entityId))
    .orderBy(asc(tags.name));
  return rows;
}

export async function listTags(db: DB, worldId: string) {
  return db
    .select({ name: tags.name, n: sql<number>`count(${entityTags.entityId})::int` })
    .from(tags)
    .leftJoin(entityTags, eq(entityTags.tagId, tags.id))
    .where(eq(tags.worldId, worldId))
    .groupBy(tags.id, tags.name)
    .orderBy(asc(tags.name));
}

/** Breadcrumb of containing locations, outermost first. */
export async function getLocationChain(db: DB, locationId: string | null) {
  const chain: { id: string; name: string; type: string }[] = [];
  let current = locationId;
  for (let i = 0; current && i < 12; i++) {
    const [row] = await db.select({ id: entities.id, name: entities.name, type: entities.type, next: entities.locationId }).from(entities).where(eq(entities.id, current));
    if (!row) break;
    chain.unshift({ id: row.id, name: row.name, type: row.type });
    current = row.next;
  }
  return chain;
}

/** Lightweight lookup used by mention rendering and pickers. */
export async function getEntityRefs(db: DB, worldId: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({ id: entities.id, name: entities.name, type: entities.type, summary: entities.summary, status: entities.status, visibility: entities.visibility })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), inArray(entities.id, ids)));
}

export type EntityRef = Awaited<ReturnType<typeof getEntityRefs>>[number];
