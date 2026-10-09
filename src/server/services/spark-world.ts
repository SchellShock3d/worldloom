/**
 * Turn a finished draft from the AI-led creator into a world: the world and its profile, its
 * races and classes, and every place, power, event, thread and person in the draft. The DM
 * approved the draft section by section, so its entries are recorded as approved AI proposals
 * (with full revision history) rather than left pending.
 */
import type { DB } from "@/server/db/client";
import { createWorld } from "./worlds";
import { addCorePeoples, addHomebrewPeoples } from "./peoples";
import { applyProposals, createBatch, getBatch } from "./proposals";
import { loadWorldBundle } from "@/server/ai/context";
import { changeSetToDrafts, emptyChangeSet, type AiRef, type ChangeSet } from "@/server/ai/changeset";
import type { Actor } from "./history";
import { CORE_CLASSES, CORE_RACES, type PeopleSuggestion, type PrevalenceChoice } from "@/lib/peoples";
import type { Dials } from "@/lib/spark";
import type { DraftSections, SectionData, WorldPitch } from "@/lib/spark-schema";

export interface FinishedDraft {
  seed: string;
  dials: Dials;
  pitch: WorldPitch;
  sections: Required<DraftSections>;
  calendarPreset?: string;
  provider?: string;
}

type Entity = ChangeSet["newEntities"][number];

export async function createWorldFromDraft(db: DB, actor: Actor & { userId: string }, d: FinishedDraft) {
  const { overview: o, land, peoples, powers, history, start } = d.sections;

  // 1. The world and its profile.
  const world = await createWorld(db, actor, {
    name: o.name.trim() || d.pitch.name,
    genre: o.genre.slice(0, 80),
    tone: o.tone.slice(0, 200),
    magicLevel: o.magicLevel,
    techLevel: o.techLevel,
    description: `${o.logline}\n\n${o.overview}`.slice(0, 5000),
    calendarPreset: d.calendarPreset,
    profile: {
      themes: o.themes.slice(0, 2000),
      conflict: o.conflict.slice(0, 2000),
      magicSources: o.magicSources.slice(0, 12).map((x) => x.slice(0, 80)),
      magicAttitude: o.magicAttitude.slice(0, 120),
      worldShape: o.worldShape.slice(0, 120),
      inspirations: d.pitch.touchstones.slice(0, 1000),
      startingArea: `${start.settlement.name}: ${start.settlement.summary}`.slice(0, 1000),
      detailStart: true,
      vibe: d.dials,
      seed: d.seed.slice(0, 500),
    },
  });

  // 2. Races and classes.
  const coreRace = new Map(CORE_RACES.map((r) => [r.name.toLowerCase(), r.name]));
  const coreClass = new Map(CORE_CLASSES.map((c) => [c.name.toLowerCase(), c.name]));
  const races: Record<string, PrevalenceChoice> = {};
  const classes: Record<string, PrevalenceChoice> = {};
  const notes: Record<string, string> = {};
  const homebrew: PeopleSuggestion[] = [];
  for (const r of peoples.races) {
    const core = coreRace.get(r.name.trim().toLowerCase());
    if (core) {
      races[core] = r.prevalence;
      if (r.place) notes[`race:${core}`] = r.place;
    } else homebrew.push({ kind: "race", name: r.name.trim(), prevalence: r.prevalence, summary: r.place, reason: "", fields: { traits: r.traits, society: r.place } });
  }
  for (const c of peoples.classes) {
    const core = coreClass.get(c.name.trim().toLowerCase());
    if (core) {
      classes[core] = c.prevalence;
      if (c.place) notes[`class:${core}`] = c.place;
    } else homebrew.push({ kind: "class", name: c.name.trim(), prevalence: c.prevalence, summary: c.place, reason: "", fields: { features: c.features, inWorld: c.place } });
  }
  await addCorePeoples(db, world.id, actor, { races, classes, notes });
  if (homebrew.length) await addHomebrewPeoples(db, world.id, actor, homebrew.filter((h) => h.name));

  // 3. Everything else, as one change set.
  const cs = buildChangeSet(o, land, powers, history, start);
  const bundle = await loadWorldBundle(db, world.id, null);
  const { drafts } = await changeSetToDrafts(db, cs, { worldId: world.id, campaignId: null, now: bundle.now, calendar: bundle.calendar });
  const { batch } = await createBatch(db, { worldId: world.id, source: "onboarding", title: `Foundation for ${world.name}`, summary: "Written with Claude in the world creator and approved there, section by section.", provider: d.provider ?? "anthropic", createdBy: actor.userId }, drafts);
  const items = (await getBatch(db, world.id, batch.id))?.items ?? [];
  const applied = await applyProposals(db, world.id, batch.id, items.map((i) => i.id), actor.userId);
  return { worldId: world.id, batchId: batch.id, applied: applied.applied, failed: applied.failed };
}

export function buildChangeSet(o: SectionData["overview"], land: SectionData["land"], powers: SectionData["powers"], history: SectionData["history"], start: SectionData["start"]): ChangeSet {
  const cs = emptyChangeSet(`Foundation for ${o.name}`);
  const refs = new Map<string, AiRef>();
  const used = new Set<string>();
  const add = (e: Omit<Entity, "ref" | "tags" | "aliases" | "status" | "rationale" | "importance" | "visibility"> & Partial<Entity>) => {
    let base = `${e.type}-${e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x"}`;
    while (used.has(base)) base += "-2";
    used.add(base);
    const full: Entity = { ref: base, tags: [], aliases: [], status: null, rationale: "From the world creator.", importance: 0, visibility: "public", ...e };
    cs.newEntities.push(full);
    const r = { id: null, ref: base, name: e.name };
    if (!refs.has(e.name.trim().toLowerCase())) refs.set(e.name.trim().toLowerCase(), r);
    return r;
  };
  const find = (name: string | undefined | null): AiRef | null => (name?.trim() ? (refs.get(name.trim().toLowerCase()) ?? looseFind(name)) : null);
  // "the Cinder League" vs "Cinder League", or a region mentioned with extra words.
  const looseFind = (name: string): AiRef | null => {
    const n = name.trim().toLowerCase().replace(/^the\s+/, "");
    for (const [k, v] of refs) if (k.replace(/^the\s+/, "") === n) return v;
    if (n.length < 5) return null;
    const hits = [...refs].filter(([k]) => k.includes(n) || n.includes(k.replace(/^the\s+/, "")));
    return hits.length === 1 ? hits[0]![1] : null;
  };
  const f = (pairs: [string, string | undefined | null][]) => pairs.filter(([, v]) => v && String(v).trim()).map(([key, value]) => ({ key, value: String(value) }));
  const rel = (source: AiRef | null, type: string, target: AiRef | null, description = "") => {
    if (source && target && source.ref !== target.ref) cs.relationships.push({ source, target, type, description, rationale: "From the world creator." });
  };

  const overview = add({ type: "lore", name: `The World of ${o.name}`, summary: o.logline, body: `${o.overview}\n\n**Themes:** ${o.themes}\n\n**The central conflict:** ${o.conflict}${o.secret ? `\n\n:::dm\n**The secret beneath it all:** ${o.secret}\n:::` : ""}`, location: null, fields: f([["category", "overview"]]), importance: 2 });
  if (o.secret) cs.facts.push({ holder: null, subject: overview, statement: o.secret, truthStatus: "true", confidence: 100, rationale: "The world's hidden truth." });

  for (const m of land.landmasses) add({ type: "continent", name: m.name, summary: m.summary, body: "", location: null, fields: [], importance: 1 });
  for (const r of land.regions) add({ type: "region", name: r.name, summary: r.summary, body: r.danger ? `**Danger:** ${r.danger}` : "", location: find(r.landmass), fields: f([["climate", r.climate], ["terrain", r.terrain], ["dangers", r.danger]]) });
  for (const l of land.landmarks) add({ type: "landmark", name: l.name, summary: l.summary, body: "", location: find(l.region), fields: f([["significance", l.summary]]) });

  for (const n of powers.nations) add({ type: "nation", name: n.name, summary: n.summary, body: n.ruler ? `Ruled by ${n.ruler}.` : "", location: find(n.region), fields: f([["government", n.government], ["demographics", n.demographics]]), importance: 1 });
  for (const fa of powers.factions) add({ type: "faction", name: fa.name, summary: fa.summary, body: fa.base ? `Strongest in ${fa.base}.` : "", location: null, fields: f([["factionType", fa.kind], ["goals", fa.goal], ["secrets", fa.secret]]), importance: 1 });
  for (const rg of powers.religions) {
    const religion = add({ type: "religion", name: rg.name, summary: rg.summary, body: "", location: null, fields: [] });
    for (const g of rg.deities) {
      const deity = refs.get(g.name.trim().toLowerCase()) ?? add({ type: "deity", name: g.name, summary: g.summary, body: "", location: null, fields: f([["domains", g.domains], ["portfolio", g.summary]]) });
      rel(deity, "worshipped_by", religion);
    }
  }
  for (const t of powers.ties) rel(find(t.from), t.type, find(t.to), t.why);

  for (const th of history.threads) {
    const thread = add({ type: "world_thread", name: th.name, summary: th.summary, body: th.stakes ? `**If nobody intervenes:** ${th.stakes}` : "", location: null, fields: [], visibility: "dm_only", importance: 1 });
    for (const dr of th.drivers) rel(find(dr), "drives", thread);
  }
  for (const e of history.events)
    cs.events.push({ ref: null, title: e.title, summary: e.summary, kind: "historical", offsetDays: 0, yearsAgo: Math.max(0, Math.round(e.yearsAgo)) || null, location: null, involved: e.involved.map(find).filter((x): x is AiRef => !!x), visibility: "public", rationale: "From the world creator." });

  const st = start.settlement;
  const town = add({ type: "settlement", name: st.name, summary: st.summary, body: `${st.features ? `**Notable:** ${st.features}` : ""}${start.hook ? `\n\n:::dm\n**Opening hook:** ${start.hook}\n:::` : ""}`, location: find(st.within), fields: f([["size", st.size], ["population", st.population], ["demographics", st.demographics], ["notableFeatures", st.features]]), importance: 2 });
  const tavern = add({ type: "tavern", name: start.tavern.name, summary: start.tavern.summary, body: "", location: town, fields: f([["ambience", start.tavern.ambience]]) });
  start.npcs.forEach((n, i) => {
    add({ type: "npc", name: n.name, summary: n.summary, body: n.secret ? `:::dm\n${n.secret}\n:::` : "", location: i === 0 ? tavern : town, status: "alive", fields: f([["species", n.race], ["className", n.className], ["occupation", n.occupation], ["motivations", n.want], ["secrets", n.secret]]), importance: 1 });
  });
  for (const r of start.rumours) cs.rumours.push({ title: r.claim.slice(0, 80), claim: r.claim, truth: r.truth, accuracy: Math.max(0, Math.min(100, Math.round(r.accuracy))), distortion: "", originEvent: null, circulatesIn: [town], spreadBy: [], rationale: "From the world creator." });
  return cs;
}
