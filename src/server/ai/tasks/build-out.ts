/**
 * Build out: Claude writes one section of a build-out around an existing entry, grounded in
 * everything the world already holds. The DM steers each section the way they steer the world
 * creator: keep, redo, a one-click nudge, or a note.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities } from "@/server/db/schema";
import { getAIProvider, noteAIFailure, noteAISuccess } from "../provider";
import { buildDmContext, entityCard } from "../context";
import { typeReference } from "../prompts";
import { RELATIONSHIP_TYPES } from "@/lib/relationship-types";
import { getEntityType } from "@/lib/entity-types";
import { buildSectionSchema, buildSectionText, entryCount, planFor, sectionsIn, type BuildSectionData, type Depth } from "@/lib/build-out";
import { surroundings } from "@/server/services/build-out";
import { offlineBuildSection } from "../offline/build-out";

const BUILD_SYSTEM = `You are a co-creator of a tabletop RPG world, working with its Dungeon Master. You do the inventing and the writing; the DM steers by keeping, redoing and giving short notes.
- The world's records below are canon. Build on them; never contradict them. Use existing names exactly when you refer to them.
- Never recreate something that already exists: link to it by its exact name instead.
- Be specific and playable: names, motives, sensory detail, and hooks a DM can use at the table. No generic fantasy filler.
- Every new name is original and fits this world's cultures. Never borrow from published settings, novels or games.
- Write plainly and vividly. Short paragraphs. No purple prose.`;

export interface BuildSectionRequest {
  worldId: string;
  campaignId: string | null;
  entityId: string;
  key: string;
  /** Section keys in this build. */
  chosen: string[];
  depth: Depth;
  /** The DM's direction for the whole build-out. */
  direction?: string;
  /** Sections already written, by key. */
  written: Record<string, BuildSectionData>;
  previous?: BuildSectionData;
  notes?: string[];
  mode: "new" | "redo" | "steer" | "refresh";
}

export async function draftBuildSection(db: DB, req: BuildSectionRequest): Promise<{ data: BuildSectionData; provider: string }> {
  const [focus] = await db.select().from(entities).where(and(eq(entities.id, req.entityId), eq(entities.worldId, req.worldId)));
  if (!focus) throw new Error("That entry no longer exists.");
  const plan = planFor(focus.type);
  const chosen = sectionsIn(plan, req.chosen.includes(req.key) ? req.chosen : [...req.chosen, req.key]);
  const def = chosen.find((s) => s.key === req.key);
  if (!def) throw new Error("Unknown section.");
  const n = entryCount(def, req.depth);

  const provider = await getAIProvider();
  if (!provider.live) return { data: await offlineBuildSection(db, { ...req, focus, def, n }), provider: "offline" };

  try {
    const name = focus.name;
    const task = def.task.replaceAll("{name}", name);
    const [ctx, card, around] = await Promise.all([
      buildDmContext(db, { worldId: req.worldId, campaignId: req.campaignId, focusIds: [focus.id], query: `${focus.name} ${focus.summary}`, budgetChars: 16000, maxEntities: 14, sections: { sessions: false, quests: false, consequences: false, mysteries: false, timeline: false, rumours: true } }),
      entityCard(db, req.worldId, focus, { bodyChars: 4000, relLimit: 30 }),
      surroundings(db, req.worldId, focus),
    ]);
    const idx = plan.sections.findIndex((s) => s.key === req.key);
    const earlier = plan.sections.slice(0, idx).filter((s) => req.written[s.key]);
    const others = chosen.filter((s) => s.key !== req.key);
    const focusDef = getEntityType(focus.type);
    const focusFields = focusDef.fields.filter((f) => f.kind !== "abilities" && f.kind !== "inventory");
    const fieldState = focusFields.map((f) => `${f.key}${f.options ? ` (one of: ${f.options.join("/")})` : f.placeholder ? ` (like "${f.placeholder}")` : ""}: ${fieldValue(focus.fields[f.key]) || "(empty)"}`).join("; ");
    const notes = (req.notes ?? []).filter((x) => x.trim());
    const prev = req.previous ? buildSectionText(def.title, req.previous) : "";
    const how =
      req.mode === "steer" && prev
        ? `Revise the current version below to follow the DM's newest note. Change what the note asks for and whatever must change with it; keep the rest.\n\nCurrent version:\n${prev}`
        : req.mode === "refresh" && prev
          ? `Earlier sections changed since this was written. Update the version below so it fits them, keeping as much as still works.\n\nCurrent version:\n${prev}`
          : req.mode === "redo" && prev
            ? `Write a fresh, clearly different take on this section. For contrast, the version the DM didn't want:\n${prev}`
            : "";

    const rules = [
      n > 0 ? `- entries: ${def.count[0] === 0 ? `up to ${n}` : `${n}`} new entries, of these types only: ${def.types.join(", ")}.` : "- entries: none in this section.",
      n > 0 ? `- Entry fields use the keys listed for each type:\n${typeReference(def.types)}` : "",
      n > 0 ? `- within: the exact name of where each entry is (${name}, another entry in this build-out, or an existing place).\n- links: to ${name}, to entries in this build-out, or to existing entries, by exact name. Each link reads "<this entry> <type> <to>", so use the reverse form when the other one is the actor: a shop run by an existing NPC gets owned_by, a faction's leader gets led_by from the faction (or leads from the leader), a child gets child_of. Keys: ${RELATIONSHIP_TYPES.map((t) => t.key).join(", ")}; reverse forms: owned_by, led_by, ruled_by, employed_by, staffed_by, served_by, has_member, child_of, student_of, guarded_by, inhabited_by, controlled_by, founded_by, created_by. Don't add related_to links to the place an entry is already within.` : "",
      n > 0 ? '- NPCs get a race (field species) from this world\'s peoples, and a class (field className) only if they\'re an adventurer or caster. Settlements get a demographics field built from those races, written like "Human 60%, Dwarf 25%, Halfling 10%, other 5%".' : "",
      req.key === "about"
        ? `- article: 2-4 short paragraphs about ${name} for its article (don't repeat what it already says). Refer to entries as @ plus their exact full name, e.g. @The Drowned Lantern (never "the @The…").\n- fields: fill ${name}'s empty fields where you can. Current values: ${fieldState || "none"}. Leave filled ones alone.`
        : `- article: one or two sentences tying this section together for ${name}'s article (refer to entries as @ plus their exact full name), or empty. fields: empty.`,
      `- links (top level): relationships from ${name} itself to other entries, only where they matter; usually empty.`,
      def.rumours ? "- rumours: 3, each with what people say and the truth behind it." : "- rumours: empty.",
      def.hooks ? "- hooks: 3 adventure hooks, one line each." : "- hooks: empty.",
      "- Keep summaries to one or two sentences and details to a short paragraph. Secrets go in secret, not details.",
    ].filter(Boolean);

    const content = [
      ctx.text,
      `# Building out ${name}\n${card}`,
      around.length ? `# Already in or tied to ${name}\nBuild around these; never recreate them.\n${around.map((a) => `- [${getEntityType(a.type).label}] ${a.name} (${a.how})${a.summary ? `: ${a.summary}` : ""}`).join("\n")}` : `# Already in or tied to ${name}\nNothing yet.`,
      earlier.length ? `# Written so far in this build-out\n${earlier.map((s) => buildSectionText(s.title, req.written[s.key]!)).join("\n\n")}` : "",
      others.length ? `# Other sections of this build-out\nThese are written separately; stay inside your own section's job.\n${others.map((s) => `- ${s.title}: ${s.blurb}`).join("\n")}` : "",
      req.direction?.trim() ? `# The DM's direction for this build-out\n${req.direction.trim()}` : "",
      notes.length ? `# The DM's notes on this section (newest last)\n${notes.map((x) => `- ${x}`).join("\n")}` : "",
      `# Task: ${def.title}\n${task}\n\n${rules.join("\n")}`,
      how,
    ]
      .filter(Boolean)
      .join("\n\n");

    const out = await provider.structured({ name: `build_${req.key}`, schema: buildSectionSchema, strict: false, maxTokens: 16000, system: BUILD_SYSTEM, messages: [{ role: "user", content }] });
    noteAISuccess();
    return { data: tidy(out, def.types, n), provider: provider.name };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    noteAIFailure(message);
    console.error(`[ai] build-out section "${req.key}" failed`, err);
    throw new Error(`Claude couldn't write this section: ${message}`);
  }
}

function fieldValue(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v.slice(0, 120);
  if (Array.isArray(v)) return v.join(", ").slice(0, 120);
  return JSON.stringify(v).slice(0, 120);
}

/** Trim stray whitespace and cap what came back, so one runaway section can't flood the world. */
function tidy(d: BuildSectionData, types: string[], n: number): BuildSectionData {
  const cap = Math.max(n + 2, n * 2);
  // "the @The Drowned Lantern" → "@The Drowned Lantern"
  const md = (x: string) => x.replace(/\b[Tt]he @(?=The\s)/g, "@").trim();
  return {
    article: md(d.article),
    fields: d.fields.filter((f) => f.key.trim() && f.value.trim()),
    entries: (types.length ? d.entries : [])
      .filter((e) => e.name.trim())
      .slice(0, cap)
      .map((e) => ({ ...e, details: md(e.details) })),
    links: d.links.filter((l) => l.to.trim()),
    rumours: d.rumours.filter((r) => r.claim.trim()).slice(0, 6),
    hooks: d.hooks.filter((h) => h.trim()).slice(0, 6),
  };
}
