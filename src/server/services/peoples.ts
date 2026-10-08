/** Races and classes in a world: listing, adding the D&D core set, adding homebrew. */
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities } from "@/server/db/schema";
import { createEntity } from "./entities";
import type { Actor } from "./history";
import { CORE_CLASSES, CORE_RACES, PREVALENCE, type PeopleSuggestion, type PrevalenceChoice } from "@/lib/peoples";

export interface WorldPeople {
  id: string;
  type: "race" | "class";
  name: string;
  summary: string;
  prevalence: string | null;
  source: string | null;
  visibility: string;
}

const RANK = (p: string | null) => {
  const i = PREVALENCE.indexOf((p ?? "") as (typeof PREVALENCE)[number]);
  return i === -1 ? PREVALENCE.length : i;
};

export async function listPeoples(db: DB, worldId: string): Promise<{ races: WorldPeople[]; classes: WorldPeople[] }> {
  const rows = await db
    .select({ id: entities.id, type: entities.type, name: entities.name, summary: entities.summary, fields: entities.fields, visibility: entities.visibility })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), inArray(entities.type, ["race", "class"]), ne(entities.canonStatus, "archived")))
    .orderBy(asc(entities.name));
  const all = rows.map((r) => {
    const f = (r.fields ?? {}) as Record<string, unknown>;
    return { id: r.id, type: r.type as "race" | "class", name: r.name, summary: r.summary, visibility: r.visibility, prevalence: typeof f.prevalence === "string" ? f.prevalence : null, source: typeof f.source === "string" ? f.source : null };
  });
  const sort = (a: WorldPeople, b: WorldPeople) => RANK(a.prevalence) - RANK(b.prevalence) || a.name.localeCompare(b.name);
  return { races: all.filter((p) => p.type === "race").sort(sort), classes: all.filter((p) => p.type === "class").sort(sort) };
}

/** One line each for AI context: "Human (common), Elf (uncommon, homebrew)…" */
export async function peoplesContext(db: DB, worldId: string): Promise<string> {
  const { races, classes } = await listPeoples(db, worldId);
  if (!races.length && !classes.length) return "";
  const fmt = (p: WorldPeople) => `${p.name} (${[p.prevalence?.toLowerCase(), p.source === "Homebrew" ? "homebrew" : null].filter(Boolean).join(", ") || "unspecified"})`;
  return [races.length ? `Races: ${races.map(fmt).join(", ")}` : "", classes.length ? `Classes: ${classes.map(fmt).join(", ")}` : ""].filter(Boolean).join("\n");
}

async function existingNames(db: DB, worldId: string) {
  const rows = await db
    .select({ name: entities.name, type: entities.type })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), inArray(entities.type, ["race", "class"]), ne(entities.canonStatus, "archived")));
  return new Set(rows.map((r) => `${r.type}:${r.name.toLowerCase()}`));
}

/**
 * Add D&D core races and classes at the chosen prevalence. "Absent" ones are skipped, and so is
 * anything the world already has under the same name.
 */
export async function addCorePeoples(db: DB, worldId: string, actor: Actor, choice: { races: Record<string, PrevalenceChoice>; classes: Record<string, PrevalenceChoice> }) {
  const have = await existingNames(db, worldId);
  const created: { id: string; name: string; type: string }[] = [];
  for (const r of CORE_RACES) {
    const p = choice.races[r.name];
    if (!p || p === "Absent" || have.has(`race:${r.name.toLowerCase()}`)) continue;
    const e = await createEntity(db, worldId, actor, {
      type: "race",
      name: r.name,
      summary: r.summary,
      visibility: "public",
      importance: p === "Common" ? 1 : 0,
      tags: ["dnd-5e"],
      fields: { prevalence: p, source: "D&D 5e core", playable: true, size: r.size, speed: r.speed, lifespan: r.lifespan, traits: r.traits },
    });
    created.push({ id: e.id, name: e.name, type: e.type });
  }
  for (const c of CORE_CLASSES) {
    const p = choice.classes[c.name];
    if (!p || p === "Absent" || have.has(`class:${c.name.toLowerCase()}`)) continue;
    const e = await createEntity(db, worldId, actor, {
      type: "class",
      name: c.name,
      summary: c.summary,
      visibility: "public",
      tags: ["dnd-5e"],
      fields: { prevalence: p, source: "D&D 5e core", role: c.role, primaryAbility: c.primaryAbility, hitDie: c.hitDie },
    });
    created.push({ id: e.id, name: e.name, type: e.type });
  }
  return created;
}

/** Add homebrew races or classes the DM picked (from suggestions or their own). */
export async function addHomebrewPeoples(db: DB, worldId: string, actor: Actor, items: PeopleSuggestion[]) {
  const have = await existingNames(db, worldId);
  const created: { id: string; name: string; type: string }[] = [];
  for (const s of items) {
    if (have.has(`${s.kind}:${s.name.toLowerCase()}`)) continue;
    have.add(`${s.kind}:${s.name.toLowerCase()}`);
    const known = s.kind === "race" ? ["size", "speed", "lifespan", "traits", "appearance", "homelands", "society"] : ["role", "primaryAbility", "hitDie", "inWorld", "training", "traditions", "features"];
    const fields: Record<string, unknown> = { prevalence: s.prevalence, source: "Homebrew" };
    for (const k of known) if (s.fields[k]) fields[k] = s.fields[k];
    if (s.kind === "race") fields.playable = true;
    const e = await createEntity(db, worldId, actor, {
      type: s.kind,
      name: s.name,
      summary: s.summary,
      body: s.reason ? `*Why it fits:* ${s.reason}` : "",
      visibility: "public",
      tags: ["homebrew"],
      fields,
    });
    created.push({ id: e.id, name: e.name, type: e.type });
  }
  return created;
}
