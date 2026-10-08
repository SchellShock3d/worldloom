import { CORE_CLASSES, CORE_RACES, defaultClassPrevalence, defaultRacePrevalence, type PeopleSuggestion, type PrevalenceChoice, type WorldTraits } from "@/lib/peoples";
import type { WorldProfile } from "@/lib/world-profile";

export interface CreatorState {
  step: number;
  name: string;
  genre: string;
  tone: string;
  description: string;
  magicLevel: string;
  techLevel: string;
  calendarPreset: string;
  startYear: string;
  profile: WorldProfile;
  races: Record<string, PrevalenceChoice>;
  classes: Record<string, PrevalenceChoice>;
  /** Once the DM edits race/class prevalence by hand, genre changes stop resetting it. */
  peoplesTouched: boolean;
  homebrew: PeopleSuggestion[];
}

export const STEPS = [
  { key: "idea", title: "The idea", blurb: "Name, genre and the pitch." },
  { key: "magic", title: "Magic & technology", blurb: "How strange and how advanced." },
  { key: "land", title: "The land", blurb: "Shape, climate and places." },
  { key: "peoples", title: "Peoples", blurb: "Races and classes, core and homebrew." },
  { key: "powers", title: "Powers & history", blurb: "Nations, faiths, factions, the past." },
  { key: "start", title: "Where play begins", blurb: "Starting area, limits, calendar." },
  { key: "review", title: "Review", blurb: "Check it, then create." },
] as const;

export function traitsOf(s: Pick<CreatorState, "genre" | "tone" | "magicLevel" | "techLevel" | "description" | "profile">): WorldTraits {
  return { genre: s.genre, tone: s.tone, magicLevel: s.magicLevel, techLevel: s.techLevel, text: [s.description, s.profile.regions, s.profile.themes, s.profile.conflict, s.profile.worldShape, ...(s.profile.climates ?? [])].join(" ") };
}

export function defaultPeoples(s: Pick<CreatorState, "genre" | "tone" | "magicLevel" | "techLevel" | "description" | "profile">) {
  const t = traitsOf(s);
  return { races: defaultRacePrevalence(t), classes: defaultClassPrevalence(t) };
}

export function initialState(): CreatorState {
  const base = { genre: "High fantasy", tone: "", magicLevel: "Moderate", techLevel: "Medieval", description: "", profile: {} as WorldProfile };
  return {
    step: 0,
    name: "",
    calendarPreset: "wheel",
    startYear: "",
    peoplesTouched: false,
    homebrew: [],
    ...base,
    ...defaultPeoples(base),
  };
}

const KEY = "wl_creator_draft_v1";

export function loadDraft(): CreatorState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CreatorState>;
    if (typeof parsed !== "object" || !parsed) return null;
    return { ...initialState(), ...parsed, profile: { ...(parsed.profile ?? {}) } };
  } catch {
    return null;
  }
}

export function saveDraft(s: CreatorState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode or storage full: the draft just won't survive a refresh */
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export const coreRaceNames = CORE_RACES.map((r) => r.name);
export const coreClassNames = CORE_CLASSES.map((c) => c.name);

/** Names of everything that will exist, for "don't suggest duplicates". */
export function chosenPeopleNames(s: CreatorState) {
  return [
    ...Object.entries(s.races).filter(([, p]) => p !== "Absent").map(([n]) => n),
    ...Object.entries(s.classes).filter(([, p]) => p !== "Absent").map(([n]) => n),
    ...s.homebrew.map((h) => h.name),
  ];
}
