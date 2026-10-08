"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { customEntityTypes, entityMetrics, revisions, entities } from "@/server/db/schema";
import { authorizeWorld } from "@/server/auth/access";
import { createEntity, deleteEntity, updateEntity } from "@/server/services/entities";
import { createRelationship, deleteRelationship, updateRelationship } from "@/server/services/relationships";
import { recordRevision, userActor } from "@/server/services/history";
import { type EntityInput, type EntityPatch, type RelationshipInput } from "@/lib/validation";
import { slugify } from "@/lib/utils";
import { z } from "zod";
import { assertOwned } from "@/server/auth/ownership";
import { run } from "./_util";

const refresh = (worldId: string) => revalidatePath(`/w/${worldId}`, "layout");

export async function createEntityAction(worldId: string, input: EntityInput) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const e = await db.transaction((tx) => createEntity(tx, worldId, userActor(user.id), input));
    refresh(worldId);
    return { id: e.id, name: e.name, type: e.type };
  });
}

export async function updateEntityAction(worldId: string, entityId: string, patch: EntityPatch) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const e = await db.transaction((tx) => updateEntity(tx, worldId, userActor(user.id), entityId, patch));
    refresh(worldId);
    return { id: e.id, name: e.name };
  });
}

export async function deleteEntityAction(worldId: string, entityId: string) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const e = await db.transaction((tx) => deleteEntity(tx, worldId, userActor(user.id), entityId));
    refresh(worldId);
    return { name: e.name, type: e.type };
  });
}

/** Restore an entity's fields from a revision's "before" snapshot. */
export async function restoreRevisionAction(worldId: string, revisionId: string) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const [rev] = await db.select().from(revisions).where(and(eq(revisions.id, revisionId), eq(revisions.worldId, worldId)));
    if (!rev || rev.targetKind !== "entity" || !rev.before) throw new Error("This revision can't be restored.");
    const before = rev.before as Record<string, unknown>;
    if (rev.action === "delete") {
      // Recreate the deleted entry with its old id, through the normal validated create path.
      const [exists] = await db.select({ id: entities.id }).from(entities).where(eq(entities.id, rev.targetId));
      if (exists) throw new Error("That entry already exists.");
      const keys = ["type", "name", "summary", "body", "dmNotes", "aliases", "fields", "status", "locationId", "parentId", "campaignId", "imageFileId", "canonStatus", "visibility", "importance", "tags", "quest", "thread", "mystery", "rumour", "event"];
      const input = Object.fromEntries(Object.entries(before).filter(([k, v]) => keys.includes(k) && v !== undefined)) as EntityInput;
      const created = await db.transaction(async (tx) => {
        // References to things that were deleted since are dropped rather than blocking the restore.
        for (const k of ["locationId", "parentId", "campaignId", "imageFileId"] as const) {
          const v = (input as Record<string, unknown>)[k];
          if (typeof v !== "string") continue;
          try {
            await assertOwned(tx, worldId, k === "campaignId" ? { campaigns: [v] } : k === "imageFileId" ? { files: [v] } : { entities: [v] });
          } catch {
            (input as Record<string, unknown>)[k] = null;
          }
        }
        const nested: [Record<string, unknown> | undefined, string][] = [
          [input.quest as Record<string, unknown> | undefined, "giverId"],
          [input.quest as Record<string, unknown> | undefined, "threadId"],
          [input.rumour as Record<string, unknown> | undefined, "originEventId"],
        ];
        for (const [obj, k] of nested) {
          if (!obj || typeof obj[k] !== "string") continue;
          try {
            await assertOwned(tx, worldId, { entities: [obj[k] as string] });
          } catch {
            obj[k] = null;
          }
        }
        if (input.event?.sessionId) {
          try {
            await assertOwned(tx, worldId, { sessions: [input.event.sessionId] });
          } catch {
            input.event.sessionId = null;
          }
        }
        return createEntity(tx, worldId, userActor(user.id), input, { id: rev.targetId, skipMentionResolution: true });
      });
      refresh(worldId);
      return { id: created.id };
    }
    const allowed = ["name", "summary", "body", "dmNotes", "aliases", "fields", "status", "locationId", "parentId", "canonStatus", "visibility", "importance"];
    const patch = Object.fromEntries(Object.entries(before).filter(([k]) => allowed.includes(k)));
    if (!Object.keys(patch).length) throw new Error("Nothing to restore in this revision.");
    await db.transaction((tx) => updateEntity(tx, worldId, userActor(user.id), rev.targetId, patch as EntityPatch));
    refresh(worldId);
    return { id: rev.targetId };
  }, "Restored");
}

export async function createRelationshipAction(worldId: string, input: RelationshipInput) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const r = await createRelationship(db, worldId, userActor(user.id), input);
    refresh(worldId);
    return { id: r.id };
  });
}

export async function updateRelationshipAction(worldId: string, id: string, input: Partial<RelationshipInput>) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await updateRelationship(db, worldId, userActor(user.id), id, input);
    refresh(worldId);
    return null;
  });
}

export async function deleteRelationshipAction(worldId: string, id: string) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await deleteRelationship(db, worldId, userActor(user.id), id);
    refresh(worldId);
    return null;
  });
}

// ---------------------------------------------------------------------------
// Metrics (world-state trackers)
// ---------------------------------------------------------------------------

const metricInput = z.object({
  entityId: z.string().uuid(),
  label: z.string().trim().min(1).max(60),
  value: z.number().int(),
  min: z.number().int().default(0),
  max: z.number().int().default(100),
});

export async function upsertMetricAction(worldId: string, raw: z.input<typeof metricInput>) {
  return run(async () => {
    const { user } = await authorizeWorld(worldId, "editor");
    const input = metricInput.parse(raw);
    const db = await getDb();
    const [ent] = await db.select().from(entities).where(and(eq(entities.id, input.entityId), eq(entities.worldId, worldId)));
    if (!ent) throw new Error("Entity not found");
    const key = slugify(input.label).replace(/-/g, "_");
    const [before] = await db.select().from(entityMetrics).where(and(eq(entityMetrics.entityId, input.entityId), eq(entityMetrics.key, key)));
    const value = Math.max(input.min, Math.min(input.max, input.value));
    await db
      .insert(entityMetrics)
      .values({ worldId, entityId: input.entityId, key, label: input.label, value, min: input.min, max: input.max })
      .onConflictDoUpdate({ target: [entityMetrics.entityId, entityMetrics.key], set: { label: input.label, value, min: input.min, max: input.max } });
    await recordRevision(db, userActor(user.id), {
      worldId,
      targetKind: "metric",
      targetId: input.entityId,
      targetLabel: `${ent.name}: ${input.label}`,
      action: before ? "update" : "create",
      summary: `${ent.name} ${input.label}: ${before ? `${before.value} → ` : ""}${value}`,
      before: before ? { value: before.value } : null,
      after: { value },
    });
    refresh(worldId);
    return null;
  });
}

export async function deleteMetricAction(worldId: string, metricId: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const db = await getDb();
    await db.delete(entityMetrics).where(and(eq(entityMetrics.id, metricId), eq(entityMetrics.worldId, worldId)));
    refresh(worldId);
    return null;
  });
}

// ---------------------------------------------------------------------------
// Custom entity types
// ---------------------------------------------------------------------------

const customTypeInput = z.object({
  name: z.string().trim().min(1).max(60),
  pluralName: z.string().trim().max(60).optional(),
  description: z.string().trim().max(300).optional(),
  icon: z.string().max(40).optional(),
  isPlace: z.boolean().default(false),
  fields: z
    .array(
      z.object({
        key: z.string().max(60),
        label: z.string().trim().min(1).max(60),
        kind: z.enum(["text", "textarea", "number", "select", "boolean", "tags"]),
        options: z.array(z.string().max(60)).optional(),
        section: z.enum(["details", "dm"]).optional(),
        inList: z.boolean().optional(),
      }),
    )
    .max(40)
    .default([]),
});

export async function saveCustomTypeAction(worldId: string, raw: z.input<typeof customTypeInput>, id?: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const input = customTypeInput.parse(raw);
    const db = await getDb();
    const fields = input.fields.map((f) => ({ ...f, key: f.key || slugify(f.label).replace(/-/g, "_") }));
    if (id) {
      await db
        .update(customEntityTypes)
        .set({ name: input.name, pluralName: input.pluralName, description: input.description, icon: input.icon, isPlace: input.isPlace, fields })
        .where(and(eq(customEntityTypes.id, id), eq(customEntityTypes.worldId, worldId)));
    } else {
      const key = `custom_${slugify(input.name).replace(/-/g, "_")}`;
      await db.insert(customEntityTypes).values({ worldId, key, name: input.name, pluralName: input.pluralName, description: input.description, icon: input.icon, isPlace: input.isPlace, fields });
    }
    refresh(worldId);
    return null;
  }, "Type saved");
}

export async function deleteCustomTypeAction(worldId: string, id: string) {
  return run(async () => {
    await authorizeWorld(worldId, "editor");
    const db = await getDb();
    const [t] = await db.select().from(customEntityTypes).where(and(eq(customEntityTypes.id, id), eq(customEntityTypes.worldId, worldId)));
    if (!t) throw new Error("Type not found");
    const [inUse] = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.worldId, worldId), eq(entities.type, t.key))).limit(1);
    if (inUse) throw new Error("Entities still use this type. Delete or retype them first.");
    await db.delete(customEntityTypes).where(eq(customEntityTypes.id, id));
    refresh(worldId);
    return null;
  });
}

