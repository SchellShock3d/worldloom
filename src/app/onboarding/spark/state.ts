import { DEFAULT_DIALS, SECTIONS, type Dials } from "@/lib/spark";
import type { DraftSections, SectionData, SectionKey, WorldPitch } from "@/lib/spark-schema";

export type SectionStatus = "idle" | "drafting" | "ready" | "stale" | "error";

export interface SectionState<K extends SectionKey = SectionKey> {
  data?: SectionData[K];
  status: SectionStatus;
  /** The DM's steering notes, oldest first. */
  notes: string[];
  kept?: boolean;
  error?: string;
}

export interface SparkState {
  phase: "seed" | "pitches" | "draft";
  seed: string;
  dials: Dials;
  pitches: WorldPitch[];
  /** Every name pitched so far, so new batches don't repeat. */
  seen: string[];
  /** Pitches ticked for blending (by name). */
  blend: string[];
  steer: string;
  pitch: WorldPitch | null;
  sections: { [K in SectionKey]: SectionState<K> };
  calendarPreset: string;
  provider: string;
  /** Out-of-date sections the DM asked to bring up to date, written one at a time. */
  refreshQueue: SectionKey[];
}

export const emptySections = (): SparkState["sections"] => Object.fromEntries(SECTIONS.map((s) => [s.key, { status: "idle", notes: [] }])) as unknown as SparkState["sections"];

export function initialSpark(): SparkState {
  return { phase: "seed", seed: "", dials: { ...DEFAULT_DIALS }, pitches: [], seen: [], blend: [], steer: "", pitch: null, sections: emptySections(), calendarPreset: "wheel", provider: "offline", refreshQueue: [] };
}

/** The sections that are written, for sending back to Claude as context. */
export function writtenSections(s: SparkState, before?: SectionKey): DraftSections {
  const out: DraftSections = {};
  for (const sec of SECTIONS) {
    if (sec.key === before) break;
    const d = s.sections[sec.key].data;
    if (d) (out as Record<string, unknown>)[sec.key] = d;
  }
  return out;
}

const KEY = "wl_spark_v1";

export function loadSpark(): SparkState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = { ...initialSpark(), ...(JSON.parse(raw) as Partial<SparkState>) };
    // A reload interrupts anything Claude was writing; resume from what was saved.
    for (const sec of SECTIONS) {
      const st = s.sections[sec.key] ?? { status: "idle", notes: [] };
      if (st.status === "drafting") st.status = st.data ? "ready" : "idle";
      s.sections[sec.key] = st as never;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveSpark(s: SparkState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the draft just won't survive a reload */
  }
}

export function clearSpark() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
