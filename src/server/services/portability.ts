/**
 * World export / import.
 *
 * Export writes every row that belongs to a world (plus uploaded files as
 * base64) into one JSON document. Import creates a brand-new world from such a
 * document for the importing user: every id is regenerated, every reference is
 * re-pointed, and anything that would point outside the new world is dropped,
 * so a crafted file can never write into someone else's data.
 */
import { randomUUID } from "node:crypto";
import { getTableColumns, sql, type SQL } from "drizzle-orm";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import type { DB } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, sniffMime, storage } from "./files";

export const EXPORT_FORMAT = "worldloom-world";
export const EXPORT_VERSION = 1;

type Scope = "world" | "self" | "entity" | "thread" | "campaign" | "scene" | "clue" | "encounter" | "map" | "table" | "conversation" | "batch" | "quest";

/** Insert order: parents before children. Circular/self references are filled in a second pass. */
const TABLES: { table: PgTable; scope: Scope; via?: string }[] = [
  { table: s.worlds, scope: "self" },
  { table: s.calendars, scope: "world" },
  { table: s.files, scope: "world" },
  { table: s.customEntityTypes, scope: "world" },
  { table: s.campaigns, scope: "world" },
  { table: s.entities, scope: "world" },
  { table: s.tags, scope: "world" },
  { table: s.entityTags, scope: "entity", via: "entity_id" },
  { table: s.gameSessions, scope: "campaign", via: "campaign_id" },
  { table: s.events, scope: "entity", via: "entity_id" },
  { table: s.quests, scope: "entity", via: "entity_id" },
  { table: s.questObjectives, scope: "entity", via: "quest_id" },
  { table: s.worldThreads, scope: "entity", via: "entity_id" },
  { table: s.threadStages, scope: "entity", via: "thread_id" },
  { table: s.mysteries, scope: "entity", via: "entity_id" },
  { table: s.rumours, scope: "entity", via: "entity_id" },
  { table: s.relationships, scope: "world" },
  { table: s.mentions, scope: "world" },
  { table: s.entityMetrics, scope: "world" },
  { table: s.facts, scope: "world" },
  { table: s.campaignEntityStates, scope: "campaign", via: "campaign_id" },
  { table: s.audioTracks, scope: "world" },
  { table: s.audioProfiles, scope: "world" },
  { table: s.encounters, scope: "world" },
  { table: s.encounterCombatants, scope: "encounter", via: "encounter_id" },
  { table: s.scenes, scope: "campaign", via: "campaign_id" },
  { table: s.sceneEntities, scope: "scene", via: "scene_id" },
  { table: s.clues, scope: "world" },
  { table: s.clueKnowers, scope: "clue", via: "clue_id" },
  { table: s.consequences, scope: "world" },
  { table: s.notes, scope: "world" },
  { table: s.maps, scope: "world" },
  { table: s.mapLayers, scope: "map", via: "map_id" },
  { table: s.mapMarkers, scope: "map", via: "map_id" },
  { table: s.mapRegions, scope: "map", via: "map_id" },
  { table: s.randomTables, scope: "world" },
  { table: s.randomTableEntries, scope: "table", via: "table_id" },
  { table: s.travelPlans, scope: "world" },
  { table: s.proposalBatches, scope: "world" },
  { table: s.proposals, scope: "batch", via: "batch_id" },
  { table: s.aiConversations, scope: "world" },
  { table: s.aiMessages, scope: "conversation", via: "conversation_id" },
  { table: s.revisions, scope: "world" },
];

const PARENT_SQL: Partial<Record<Scope, string>> = {
  entity: "select id from entities where world_id = $W",
  campaign: "select id from campaigns where world_id = $W",
  scene: "select sc.id from scenes sc join campaigns c on c.id = sc.campaign_id where c.world_id = $W",
  clue: "select id from clues where world_id = $W",
  encounter: "select id from encounters where world_id = $W",
  map: "select id from maps where world_id = $W",
  table: "select id from random_tables where world_id = $W",
  conversation: "select id from ai_conversations where world_id = $W",
  batch: "select id from proposal_batches where world_id = $W",
};

function scopeWhere(scope: Scope, via: string | undefined, worldId: string): SQL {
  if (scope === "self") return sql`id = ${worldId}`;
  if (scope === "world") return sql`world_id = ${worldId}`;
  const [before, after] = PARENT_SQL[scope]!.split("$W");
  return sql`${sql.raw(via!)} in (${sql.raw(before!)}${worldId}${sql.raw(after!)})`;
}

interface Meta {
  name: string;
  /** js key → column */
  columns: Record<string, PgColumn>;
  /** sql name → js key */
  keyOf: Record<string, string>;
  /** single-column uuid primary key that is not also a foreign key (gets a fresh id on import) */
  ownPk: string | null;
  fks: { key: string; foreignTable: string; nullable: boolean }[];
  generated: Set<string>;
  timestamps: Set<string>;
}

const metaCache = new Map<PgTable, Meta>();
function meta(table: PgTable): Meta {
  const cached = metaCache.get(table);
  if (cached) return cached;
  const cfg = getTableConfig(table);
  const columns = getTableColumns(table) as Record<string, PgColumn>;
  const keyOf = Object.fromEntries(Object.entries(columns).map(([k, c]) => [c.name, k]));
  const fks = cfg.foreignKeys.flatMap((fk) => {
    const ref = fk.reference();
    return ref.columns.map((c) => ({ key: keyOf[c.name]!, foreignTable: getTableConfig(ref.foreignTable).name, nullable: !c.notNull }));
  });
  const pkCol = Object.entries(columns).find(([, c]) => c.primary);
  const ownPk = pkCol && pkCol[1].columnType === "PgUUID" && !fks.some((f) => f.key === pkCol[0]) ? pkCol[0] : null;
  const m: Meta = {
    name: cfg.name,
    columns,
    keyOf,
    ownPk,
    fks,
    generated: new Set(Object.entries(columns).filter(([, c]) => c.generated).map(([k]) => k)),
    timestamps: new Set(Object.entries(columns).filter(([, c]) => c.columnType === "PgTimestamp").map(([k]) => k)),
  };
  metaCache.set(table, m);
  return m;
}

export interface WorldExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  app: string;
  worldName: string;
  tables: Record<string, Record<string, unknown>[]>;
  fileData: Record<string, string>;
}

export async function exportWorld(db: DB, worldId: string, opts: { includeFiles?: boolean; userId?: string } = {}): Promise<WorldExport> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const { table, scope, via } of TABLES) {
    const m = meta(table);
    let where = scopeWhere(scope, via, worldId);
    // AI chats are private to their author: export only the requesting user's.
    if (m.name === "ai_conversations") where = opts.userId ? sql`${where} and user_id = ${opts.userId}` : sql`false`;
    if (m.name === "ai_messages") where = opts.userId ? sql`conversation_id in (select id from ai_conversations where world_id = ${worldId} and user_id = ${opts.userId})` : sql`false`;
    const rows = (await db.select().from(table).where(where)) as Record<string, unknown>[];
    tables[m.name] = rows.map((r) => {
      const out = { ...r };
      for (const g of m.generated) delete out[g];
      return out;
    });
  }
  const fileData: Record<string, string> = {};
  if (opts.includeFiles !== false) {
    for (const f of (tables.files ?? []) as { id: string; storageKey: string }[]) {
      const buf = await storage().get(f.storageKey).catch(() => null);
      if (buf) fileData[f.id] = buf.toString("base64");
    }
  }
  const world = tables.worlds?.[0] as { name?: string } | undefined;
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), app: "Worldloom", worldName: world?.name ?? "World", tables, fileData };
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export class ImportError extends Error {}

/** Create a new world, owned by `userId`, from an export document. Returns the new world id. */
export async function importWorld(db: DB, userId: string, raw: unknown, opts: { name?: string } = {}): Promise<{ worldId: string; counts: Record<string, number>; skipped: number }> {
  if (!isPlain(raw) || raw.format !== EXPORT_FORMAT) throw new ImportError("This isn't a Worldloom world export.");
  if (typeof raw.version !== "number" || raw.version > EXPORT_VERSION) throw new ImportError("This export was made by a newer version of Worldloom.");
  if (!isPlain(raw.tables)) throw new ImportError("The export has no data.");
  const src = raw.tables as Record<string, unknown>;
  const worldRows = src.worlds;
  if (!Array.isArray(worldRows) || worldRows.length !== 1 || !isPlain(worldRows[0])) throw new ImportError("The export must contain exactly one world.");

  // 1. Fresh ids for every row with its own uuid primary key; all users become the importer.
  const idMap = new Map<string, string>();
  const planned = new Map<string, Set<string>>(); // table → new ids we intend to insert
  const userIds = new Set<string>();
  for (const { table } of TABLES) {
    const m = meta(table);
    const rows = src[m.name];
    if (!Array.isArray(rows)) continue;
    const set = planned.get(m.name) ?? new Set<string>();
    planned.set(m.name, set);
    for (const r of rows) {
      if (!isPlain(r)) continue;
      const pk = m.ownPk ? r[m.ownPk] : null;
      if (typeof pk === "string" && /^[0-9a-f-]{36}$/i.test(pk) && !idMap.has(pk.toLowerCase())) {
        const id = randomUUID();
        idMap.set(pk.toLowerCase(), id);
        set.add(id);
      }
      for (const fk of m.fks) if (fk.foreignTable === "users" && typeof r[fk.key] === "string") userIds.add((r[fk.key] as string).toLowerCase());
    }
  }
  for (const u of userIds) if (!idMap.has(u)) idMap.set(u, userId);
  const oldWorldId = String((worldRows[0] as Record<string, unknown>).id ?? "").toLowerCase();
  const newWorldId = idMap.get(oldWorldId);
  if (!newWorldId) throw new ImportError("The world in this export has no valid id.");
  const fileData = isPlain(raw.fileData) ? (raw.fileData as Record<string, unknown>) : {};
  const oldIdOf = new Map(Array.from(idMap.entries()).map(([o, n]) => [n, o]));

  // 2. Re-point every id-shaped string (columns, JSON payloads, @mention tokens in markdown).
  const remapped = JSON.parse(JSON.stringify(src).replace(UUID_RE, (m) => idMap.get(m.toLowerCase()) ?? m)) as Record<string, unknown>;
  const allNew = new Set([...planned.values()].flatMap((x) => [...x]));

  const counts: Record<string, number> = {};
  let skipped = 0;
  await db.transaction(async (tx) => {
    const late: { table: PgTable; m: Meta; pk: Record<string, unknown>; values: Record<string, unknown> }[] = [];
    const insertedIds = new Map<string, Set<string>>(); // table → ids actually inserted
    for (const { table, scope } of TABLES) {
      const m = meta(table);
      const rows = remapped[m.name];
      if (!Array.isArray(rows)) continue;
      const ready: Record<string, unknown>[] = [];
      for (const r of rows) {
        if (!isPlain(r)) continue;
        const row: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          if (!(k in m.columns) || m.generated.has(k)) continue;
          row[k] = m.timestamps.has(k) && typeof v === "string" ? new Date(v) : v;
        }
        if (m.ownPk && !planned.get(m.name)?.has(String(row[m.ownPk]))) {
          skipped++;
          continue;
        }
        // Rows always belong to the new world.
        if (scope === "world" && "worldId" in m.columns) row.worldId = newWorldId;
        if (scope === "self") Object.assign(row, { id: newWorldId, createdBy: userId, name: opts.name?.trim() || row.name });
        // Every reference must point at a row of the right table inside the new world (or at the importer).
        let drop = false;
        const deferred: Record<string, unknown> = {};
        for (const fk of m.fks) {
          const v = row[fk.key];
          if (v === null || v === undefined) continue;
          if (fk.foreignTable === "users") {
            if (v !== userId) row[fk.key] = userId;
            continue;
          }
          const id = String(v);
          const done = insertedIds.get(fk.foreignTable);
          if (fk.foreignTable !== m.name && done) {
            if (done.has(id)) continue;
          } else if (fk.nullable && planned.get(fk.foreignTable)?.has(id)) {
            // Parent comes later (or this is a self-reference): fill in once everything exists.
            deferred[fk.key] = id;
            row[fk.key] = null;
            continue;
          }
          if (fk.nullable) row[fk.key] = null;
          else drop = true;
        }
        // mentions.source_id isn't a declared foreign key: it must still point at something we imported.
        if (!drop && m.name === "mentions" && !allNew.has(String(row.sourceId))) drop = true;
        if (drop) {
          skipped++;
          continue;
        }
        if (m.name === "files") {
          const data = fileData[oldIdOf.get(String(row.id)) ?? ""];
          const stored = typeof data === "string" ? await storeImportedFile(newWorldId, String(row.mimeType ?? ""), data) : null;
          if (!stored) {
            skipped++;
            continue;
          }
          Object.assign(row, { storageKey: stored.key, mimeType: stored.mime, size: stored.size, ownerId: userId });
        }
        ready.push(row);
        if (Object.keys(deferred).length) late.push({ table, m, pk: m.ownPk ? { [m.ownPk]: row[m.ownPk] } : pkOf(m, row), values: deferred });
      }
      const ids = new Set<string>();
      for (let i = 0; i < ready.length; i += 200) {
        await tx.insert(table).values(ready.slice(i, i + 200) as never);
      }
      if (m.ownPk) for (const r of ready) ids.add(String(r[m.ownPk]));
      else if ("entityId" in m.columns && m.fks.some((f) => f.key === "entityId" && m.columns.entityId!.primary)) for (const r of ready) ids.add(String(r.entityId));
      insertedIds.set(m.name, ids);
      counts[m.name] = ready.length;
    }
    // Second pass: circular and self references, now that every row exists.
    for (const l of late) {
      const values: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(l.values)) {
        const fk = l.m.fks.find((f) => f.key === k)!;
        if (insertedIds.get(fk.foreignTable)?.has(String(v))) values[k] = v;
      }
      if (!Object.keys(values).length) continue;
      const where = Object.entries(l.pk).map(([k, v]) => sql`${l.m.columns[k]!} = ${v}`);
      await tx.update(l.table).set(values as never).where(sql.join(where, sql` and `));
    }
    // The importer owns the new world.
    await tx.insert(s.worldMembers).values({ worldId: newWorldId, userId, role: "owner" });
  });
  return { worldId: newWorldId, counts, skipped };
}

function pkOf(m: Meta, row: Record<string, unknown>) {
  // Composite primary keys: use every non-null foreign key column we know about.
  const out: Record<string, unknown> = {};
  for (const fk of m.fks) if (row[fk.key] !== null && row[fk.key] !== undefined) out[fk.key] = row[fk.key];
  return out;
}

const SVG_UNSAFE = /<script|on[a-z]+\s*=|javascript:|<foreignObject|<iframe|<embed|<object/i;

async function storeImportedFile(worldId: string, claimedMime: string, base64: string): Promise<{ key: string; mime: string; size: number } | null> {
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    return null;
  }
  if (!buf.length || buf.length > MAX_UPLOAD_BYTES) return null;
  let mime = sniffMime(buf, claimedMime);
  if (!mime || !ALLOWED_TYPES[mime]) {
    // Allow simple SVG maps (the demo world uses them) as long as they carry no active content.
    const text = claimedMime === "image/svg+xml" ? buf.toString("utf8") : "";
    if (!text.trimStart().startsWith("<svg") || SVG_UNSAFE.test(text)) return null;
    mime = "image/svg+xml";
  }
  const ext = ALLOWED_TYPES[mime]?.ext ?? "svg";
  const key = `${worldId}/${randomUUID()}.${ext}`;
  await storage().put(key, buf);
  return { key, mime, size: buf.length };
}
