/**
 * The AI-led world creator. Claude pitches worlds from a seed and the DM's vibe dials, then
 * writes the chosen world one section at a time. The DM steers: pick, blend, redo, nudge.
 * Without a key, the offline engine produces the same shapes.
 */
import { z } from "zod";
import { getAIProvider, noteAIFailure, noteAISuccess } from "../provider";
import { CORE_CLASSES, CORE_RACES } from "@/lib/peoples";
import { describeDials, draftSoFar, pitchText, sectionText, type Dials } from "@/lib/spark";
import { SECTION_SCHEMAS, pitchesSchema, type DraftSections, type SectionData, type SectionKey, type WorldPitch } from "@/lib/spark-schema";
import { offlinePitches, offlineSection } from "../offline/spark";

const SPARK_SYSTEM = `You are a co-creator of tabletop RPG worlds working with a Dungeon Master. You do the inventing and the writing; the DM steers by choosing, combining and giving short notes.
- Be specific and playable: names, places, motives, sensory detail, hooks a DM can use at the table. No generic fantasy filler.
- Every name is original. Never borrow from published settings, novels or games.
- Keep everything consistent with what's already been decided, and with the DM's vibe dials.
- Write plainly and vividly. Short paragraphs. No purple prose.
- This is a D&D 5e world: core races and classes exist unless the world calls for otherwise, and homebrew should grow naturally from the setting.`;

export interface PitchRequest {
  seed: string;
  dials: Dials;
  /** A note on what to change about the next batch ("more nautical", "less grim"). */
  steer?: string;
  /** Three variations on this pitch. */
  like?: WorldPitch;
  /** Merge these into one pitch. */
  blend?: WorldPitch[];
  /** Names already pitched, so new ones are different. */
  avoid?: string[];
}

// Pitches come in two quick steps: three deliberately different one-line premises, then each is
// expanded in parallel (knowing the other two), so they arrive together and don't converge.
const LENSES = ["an age-of-sail archipelago", "a bronze-age myth", "gothic horror", "a frontier", "the ruins after a cataclysm", "a fairy tale", "an underground realm", "a desert empire", "a frozen north", "a floating city", "a war story", "a heist", "a political thriller", "a cosmic mystery", "a pilgrimage", "a plague year", "a revolution", "a trade empire"];
const premisesSchema = z.object({ premises: z.array(z.object({ premise: z.string().describe("One sentence"), angle: z.string().describe("A few words: what makes this take different from the others") })) });

export async function pitchWorlds(req: PitchRequest): Promise<{ pitches: WorldPitch[]; provider: string }> {
  const provider = await getAIProvider();
  if (provider.live) {
    try {
      const header = [
        req.seed.trim() ? `The DM's seed idea: "${req.seed.trim()}"` : "The DM gave no seed: surprise them.",
        `Vibe dials: ${describeDials(req.dials)}`,
        req.steer?.trim() ? `DM's note for this batch: ${req.steer.trim()}` : "",
        req.avoid?.length ? `Already pitched (don't reuse these names or premises): ${req.avoid.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const expand = async (task: string) => {
        const out = await provider.structured({ name: "world_pitch", schema: pitchesSchema, fast: true, maxTokens: 1200, system: SPARK_SYSTEM, messages: [{ role: "user", content: `${header}\n\n${task}\nReturn exactly 1 pitch. Keep it tight: the logline under 25 words, the pitch two short paragraphs (under 120 words in all).` }] });
        return out.pitches[0];
      };

      let tasks: string[];
      if (req.blend?.length) {
        tasks = [`Blend these pitches into ONE world that keeps the strongest, most distinctive parts of each and resolves any contradictions:\n\n${req.blend.map((p, i) => `## Pitch ${i + 1}\n${pitchText(p)}`).join("\n\n")}`];
      } else {
        const lenses = [...LENSES].sort(() => Math.random() - 0.5).slice(0, 5);
        const ask = req.like
          ? `Come up with 3 variations on this world. Each keeps its core appeal but changes something different: one changes the central conflict, one moves it to a different genre or era, one changes the scale and tone.\n\n${pitchText(req.like)}`
          : `Come up with 3 premises for worlds built from this seed that are as different from each other as possible: different genres or eras, different scales, different kinds of conflict. No two may share a central image or phrase, and no two may hinge on the same twist (for example, only one of them may be about something dead coming back).
- Premise 1: the most direct take on the seed, done brilliantly.
- Premise 2: the seed reimagined as ${lenses[0]}.
- Premise 3: the seed reimagined as ${lenses[1]}.`;
        const { premises } = await provider.structured({ name: "premises", schema: premisesSchema, fast: true, maxTokens: 600, system: SPARK_SYSTEM, messages: [{ role: "user", content: `${header}\n\n${ask}\nOne sentence each.` }] });
        const three = premises.slice(0, 3);
        tasks = three.map((p, i) => {
          const others = three.filter((_, j) => j !== i).map((o) => `"${o.premise}"`).join(" and ");
          return `Pitch one world built on this premise: "${p.premise}" (${p.angle}).${req.like ? ` It's a variation on ${req.like.name}; give it a new name.` : ""} The DM will see it beside ${others}, so make yours clearly distinct from those in name, imagery and conflict.`;
        });
      }
      const settled = await Promise.allSettled(tasks.map(expand));
      const pitches = settled.flatMap((r) => (r.status === "fulfilled" && r.value?.name.trim() ? [r.value] : []));
      if (pitches.length) {
        noteAISuccess();
        return { pitches, provider: provider.name };
      }
      const failed = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      throw failed?.reason ?? new Error("No pitches came back.");
    } catch (err) {
      noteAIFailure(err instanceof Error ? err.message : String(err));
      console.error("[ai] world pitches failed, using offline", err);
    }
  }
  return { pitches: offlinePitches(req), provider: "offline" };
}

export interface SectionRequest<K extends SectionKey = SectionKey> {
  key: K;
  pitch: WorldPitch;
  dials: Dials;
  /** The sections before this one, as accepted so far. */
  sections: DraftSections;
  /** The current version of this section, when redoing, steering or refreshing. */
  previous?: SectionData[K];
  /** The DM's steering notes for this section, oldest first. The last one is the newest. */
  notes?: string[];
  mode: "new" | "redo" | "steer" | "refresh";
}

const scaleWord = (d: Dials) => (d.scale <= -1 ? "small" : d.scale >= 1 ? "large" : "medium");

function sectionTask(req: SectionRequest): string {
  const scale = scaleWord(req.dials);
  const n = (small: string, medium: string, large: string) => (scale === "small" ? small : scale === "large" ? large : medium);
  switch (req.key) {
    case "overview":
      return `Write the world's overview from the chosen pitch: name (keep the pitch's name unless the DM's notes say otherwise), logline, genre, tone, magic and technology, a two-to-three paragraph overview a player could read, the DM-only secret beneath it all, themes, the central conflict, where magic comes from and how people feel about it, and the broad shape of the map.`;
    case "land":
      return `Draw the land: ${n("1", "1-2", "2-3")} landmasses, ${n("3", "4-5", "5-6")} regions with distinct climates and terrain, and ${n("2", "3", "3-4")} famous landmarks. Every region should offer adventure.`;
    case "peoples":
      return `Decide who lives here.
- Races: include the D&D 5e core races that fit this world (from: ${CORE_RACES.map((r) => r.name).join(", ")}), each with how common it is and one sentence on its place in this world specifically. Leave out any that don't fit. Then add 1-3 homebrew races that grow naturally from this world's magic, technology, geography or history, with short rules highlights.
- Classes: include the core classes (from: ${CORE_CLASSES.map((c) => c.name).join(", ")}) with how common each is here and one sentence on how the world sees them, then add 1-3 homebrew classes that fit (for example artificers where there's industry, planeswalkers where magic is high, witch hunters where magic is feared), with role, hit die and signature abilities.
Use core: true only for the exact core names listed.`;
    case "powers":
      return `Raise the powers: ${n("2", "3", "4")} nations placed in the regions above (government, ruler, demographics using this world's races and how common they are, summary), ${n("3", "4", "5")} factions with goals and DM-only secrets, ${n("1-2", "2", "2-3")} religions with their deities (fewer or none if the world's faith calls for it), and 4-6 ties between them (alliances, rivalries, wars, control).`;
    case "history":
      return `Write the history: 5-6 events (with years ago, from deep past to recent) that explain how the world reached its present, and 2-3 ongoing conflicts (world threads) driven by the nations and factions above, each with stakes and urgency. Tie them to the central conflict and the DM secret.`;
    case "start":
      return `Build where play begins: one ${n("village or small town", "town", "city")} in one of the nations or regions above, chosen because the world's conflicts touch it. Give its demographics (using this world's races), a tavern, 3 NPCs (race from this world's peoples; a class only for adventurers or casters) with wants and secrets that connect to the factions and threads, 2-3 rumours with the truth behind them, and the hook that opens session one.`;
  }
}

export async function draftSection<K extends SectionKey>(req: SectionRequest<K>): Promise<{ data: SectionData[K]; provider: string }> {
  const provider = await getAIProvider();
  if (provider.live) {
    try {
      const notes = (req.notes ?? []).filter((n) => n.trim());
      const prev = req.previous ? sectionText(req.key, req.previous) : "";
      const how =
        req.mode === "steer" && prev
          ? `Revise the current version below to follow the DM's newest note. Change what the note asks for and whatever must change with it; keep the rest.\n\nCurrent version:\n${prev}`
          : req.mode === "refresh" && prev
            ? `Earlier sections changed since this was written. Update the version below so it fits them, keeping as much as still works.\n\nCurrent version:\n${prev}`
            : req.mode === "redo" && prev
              ? `Write a fresh, clearly different take on this section. For contrast, the version the DM didn't want:\n${prev}`
              : "";
      const schema = SECTION_SCHEMAS[req.key];
      const out = await provider.structured({
        name: `world_${req.key}`,
        schema: schema as never,
        strict: false,
        maxTokens: 16000,
        system: SPARK_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              `# The chosen pitch\n${pitchText(req.pitch)}`,
              `Vibe dials: ${describeDials(req.dials)}`,
              draftSoFar(req.sections, req.key) ? `# Decided so far\n${draftSoFar(req.sections, req.key)}` : "",
              notes.length ? `# The DM's notes on this section (newest last)\n${notes.map((x) => `- ${x}`).join("\n")}` : "",
              `# Task\n${sectionTask(req)}\nKeep every summary to one or two sentences; the DM will expand what they like later.`,
              how,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      });
      noteAISuccess();
      return { data: out as SectionData[K], provider: provider.name };
    } catch (err) {
      // Don't patch a Claude-written world with stock offline content: report it so the DM can retry.
      const message = err instanceof Error ? err.message : String(err);
      noteAIFailure(message);
      console.error(`[ai] world section "${req.key}" failed`, err);
      throw new Error(`Claude couldn't write this section: ${message}`);
    }
  }
  return { data: offlineSection(req), provider: "offline" };
}
