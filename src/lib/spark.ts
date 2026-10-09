/** The AI-led world creator: vibe dials, the draft's sections, steering nudges, and text renderers for prompts. */
import type { DraftSections, SectionData, SectionKey, WorldPitch } from "./spark-schema";

export const DIALS = [
  { key: "tone", left: "Hopeful", right: "Grim" },
  { key: "realism", left: "Grounded", right: "Wild" },
  { key: "novelty", left: "Familiar", right: "Strange" },
  { key: "scale", left: "Small-scale", right: "Epic" },
] as const;
export type DialKey = (typeof DIALS)[number]["key"];
/** Each dial runs from -2 (left) to 2 (right); 0 is balanced. */
export type Dials = Record<DialKey, number>;
export const DEFAULT_DIALS: Dials = { tone: 0, realism: 0, novelty: 0, scale: 0 };

export function describeDials(d: Dials): string {
  const word = (v: number, left: string, right: string) => (v <= -2 ? `strongly ${left.toLowerCase()}` : v === -1 ? `leaning ${left.toLowerCase()}` : v === 0 ? "balanced" : v === 1 ? `leaning ${right.toLowerCase()}` : `strongly ${right.toLowerCase()}`);
  return DIALS.map((x) => `${x.left} ↔ ${x.right}: ${word(d[x.key] ?? 0, x.left, x.right)}`).join("; ");
}

export const SECTIONS: { key: SectionKey; title: string; working: string }[] = [
  { key: "overview", title: "The world", working: "Shaping the world" },
  { key: "land", title: "The land", working: "Drawing the map" },
  { key: "peoples", title: "Peoples", working: "Deciding who lives here" },
  { key: "powers", title: "Powers", working: "Raising nations, factions and faiths" },
  { key: "history", title: "History & conflicts", working: "Writing the history" },
  { key: "start", title: "Where play begins", working: "Building the starting town" },
];

/** What each section is written from. Sections whose inputs are ready are written together. */
export const SECTION_DEPENDS: Record<SectionKey, SectionKey[]> = {
  overview: [],
  land: ["overview"],
  peoples: ["overview"],
  powers: ["land", "peoples"],
  history: ["powers"],
  start: ["powers"],
};

/** One-click steering, applied to the section they sit on. */
export const NUDGES: Record<SectionKey, string[]> = {
  overview: ["Darker", "Lighter", "Stranger", "More grounded", "Bigger stakes", "A more surprising secret"],
  land: ["More varied terrain", "More islands and sea", "Harsher land", "Add a mysterious region", "Fewer regions"],
  peoples: ["More homebrew", "Mostly human", "Fewer core races", "Stranger peoples", "More tension between peoples"],
  powers: ["More conflict", "Add a secret society", "Fewer nations", "More religious", "Make the factions more morally grey"],
  history: ["Older, deeper history", "A recent catastrophe", "More urgent threats", "Make a past hero a villain"],
  start: ["A small village", "A big city", "More danger", "More intrigue", "Quirkier NPCs"],
};

// ---------------------------------------------------------------------------
// Compact text versions, for prompts (what Claude sees of the earlier sections)
// ---------------------------------------------------------------------------

export function pitchText(p: WorldPitch): string {
  return [`${p.name}: ${p.logline}`, p.pitch, `Genre: ${p.genre} · Tone: ${p.tone} · Magic: ${p.magicLevel} · Technology: ${p.techLevel}`, `Conflict: ${p.conflict}`, `What sets it apart: ${p.hook}`, `Peoples: ${p.peoples}`, p.touchstones ? `Touchstones: ${p.touchstones}` : ""].filter(Boolean).join("\n");
}

const lines = (xs: string[]) => xs.filter(Boolean).join("\n");

export function sectionText<K extends SectionKey>(key: K, data: SectionData[K]): string {
  switch (key) {
    case "overview": {
      const d = data as SectionData["overview"];
      return lines([`# ${d.name}: ${d.logline}`, `Genre: ${d.genre} · Tone: ${d.tone} · Magic: ${d.magicLevel} (${d.magicSources.join(", ")}; seen as ${d.magicAttitude}) · Technology: ${d.techLevel} · Shape: ${d.worldShape}`, d.overview, `Themes: ${d.themes}`, `Conflict: ${d.conflict}`, `DM secret: ${d.secret}`]);
    }
    case "land": {
      const d = data as SectionData["land"];
      return lines([
        "# The land",
        ...d.landmasses.map((l) => `- Landmass ${l.name}: ${l.summary}`),
        ...d.regions.map((r) => `- Region ${r.name} (on ${r.landmass}; ${r.climate}, ${r.terrain}): ${r.summary} Danger: ${r.danger}`),
        ...d.landmarks.map((l) => `- Landmark ${l.name} (in ${l.region}): ${l.summary}`),
      ]);
    }
    case "peoples": {
      const d = data as SectionData["peoples"];
      return lines([
        "# Peoples",
        ...d.races.map((r) => `- Race ${r.name} (${r.prevalence.toLowerCase()}${r.core ? "" : ", homebrew"}): ${r.place}${r.traits ? ` Traits: ${r.traits}` : ""}`),
        ...d.classes.map((c) => `- Class ${c.name} (${c.prevalence.toLowerCase()}${c.core ? "" : ", homebrew"}): ${c.place}${c.features ? ` Features: ${c.features}` : ""}`),
      ]);
    }
    case "powers": {
      const d = data as SectionData["powers"];
      return lines([
        "# Powers",
        ...d.nations.map((n) => `- Nation ${n.name} (in ${n.region}; ${n.government}, ruled by ${n.ruler}; ${n.demographics}): ${n.summary}`),
        ...d.factions.map((f) => `- Faction ${f.name} (${f.kind}, based in ${f.base}): ${f.summary} Goal: ${f.goal}. Secret: ${f.secret}`),
        ...d.religions.map((r) => `- Religion ${r.name}: ${r.summary}${r.deities.length ? ` Deities: ${r.deities.map((g) => `${g.name} (${g.domains})`).join(", ")}` : ""}`),
        ...d.ties.map((t) => `- ${t.from} ${t.type.replace(/_/g, " ")} ${t.to}: ${t.why}`),
      ]);
    }
    case "history": {
      const d = data as SectionData["history"];
      return lines(["# History", ...[...d.events].sort((a, b) => b.yearsAgo - a.yearsAgo).map((e) => `- ${e.yearsAgo} years ago: ${e.title}. ${e.summary}`), "# Ongoing conflicts", ...d.threads.map((t) => `- ${t.name} (urgency ${t.urgency}/5, driven by ${t.drivers.join(", ")}): ${t.summary} Stakes: ${t.stakes}`)]);
    }
    case "start": {
      const d = data as SectionData["start"];
      return lines([
        `# Where play begins: ${d.settlement.name} (${d.settlement.size} in ${d.settlement.within}; ${d.settlement.demographics})`,
        d.settlement.summary,
        `Tavern: ${d.tavern.name}. ${d.tavern.summary}`,
        ...d.npcs.map((n) => `- ${n.name}, ${n.race}${n.className ? ` ${n.className}` : ""}, ${n.occupation}: ${n.summary} Wants: ${n.want}`),
        ...d.rumours.map((r) => `- Rumour: ${r.claim}`),
        `Opening hook: ${d.hook}`,
      ]);
    }
  }
  return "";
}

/** The accepted sections before `key`, as text. */
export function draftSoFar(sections: DraftSections, upTo: SectionKey): string {
  const out: string[] = [];
  for (const s of SECTIONS) {
    if (s.key === upTo) break;
    const d = sections[s.key];
    if (d) out.push(sectionText(s.key, d as never));
  }
  return out.join("\n\n");
}

/** One line describing a section, for collapsed views. */
export function sectionSummary<K extends SectionKey>(key: K, data: SectionData[K]): string {
  const names = (xs: { name: string }[], n = 3) => xs.slice(0, n).map((x) => x.name).join(", ") + (xs.length > n ? "…" : "");
  switch (key) {
    case "overview":
      return (data as SectionData["overview"]).logline;
    case "land": {
      const d = data as SectionData["land"];
      return `${d.regions.length} regions (${names(d.regions)}) and ${d.landmarks.length} landmarks`;
    }
    case "peoples": {
      const d = data as SectionData["peoples"];
      const brew = [...d.races, ...d.classes].filter((p) => !p.core);
      return `${d.races.length} races and ${d.classes.length} classes${brew.length ? `, including ${names(brew, 4)}` : ""}`;
    }
    case "powers": {
      const d = data as SectionData["powers"];
      return `${d.nations.length} nations (${names(d.nations)}), ${d.factions.length} factions, ${d.religions.length} faiths`;
    }
    case "history": {
      const d = data as SectionData["history"];
      return `${d.events.length} turning points and ${d.threads.length} ongoing conflicts`;
    }
    case "start": {
      const d = data as SectionData["start"];
      return `${d.settlement.name}, ${d.tavern.name} and ${d.npcs.length} people to meet`;
    }
  }
  return "";
}
