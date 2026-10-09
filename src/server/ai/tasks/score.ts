/**
 * Briefs for scene music and ambience. Claude reads the scene (place, mood, light, weather, time,
 * what's at stake) and the world's genre and technology, and writes a prompt for Lyria; without
 * Claude, a template does the same from the scene's fields.
 */
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, encounters, scenes, campaigns } from "@/server/db/schema";
import { getAIProvider, noteAIFailure, noteAISuccess } from "../provider";
import { loadWorldBundle } from "../context";
import { resolve, timeOfDay } from "@/lib/calendar";

export type ScoreKind = "music" | "ambience";
export interface ScoreBrief {
  title: string;
  prompt: string;
  tags: string[];
}

const briefSchema = z.object({ title: z.string().describe("A short, evocative track name"), prompt: z.string(), tags: z.array(z.string()).describe("2-4 one-word tags, e.g. tavern, tense, rain") });
const briefsSchema = z.object({ music: briefSchema, ambience: briefSchema });

export interface SceneInfo {
  name: string;
  text: string;
  mood: string;
  weather: string;
  place: string;
  combat: boolean;
}

/** Everything about a scene (or a free description) that matters for its sound. */
export async function describeScene(db: DB, opts: { worldId: string; sceneId?: string | null; description?: string }): Promise<{ info: SceneInfo; world: string; tech: string }> {
  const bundle = await loadWorldBundle(db, opts.worldId, null);
  const w = bundle.world;
  const world = `${w.name}: ${w.genre}${w.tone ? `, ${w.tone}` : ""}; magic ${w.magicLevel.toLowerCase()}; technology ${w.techLevel.toLowerCase()}.`;
  if (!opts.sceneId) {
    const d = (opts.description ?? "").trim();
    return { info: { name: d.slice(0, 60) || "Scene", text: d, mood: "", weather: "", place: "", combat: /\b(fight|battle|combat|ambush|chase)\b/i.test(d) }, world, tech: w.techLevel };
  }
  const [row] = await db
    .select({ scene: scenes, campaign: campaigns })
    .from(scenes)
    .innerJoin(campaigns, eq(campaigns.id, scenes.campaignId))
    .where(and(eq(scenes.id, opts.sceneId), eq(campaigns.worldId, opts.worldId)));
  if (!row) throw new Error("Scene not found.");
  const s = row.scene;
  const camp = await loadWorldBundle(db, opts.worldId, row.campaign.id);
  const at = s.atTime ?? row.campaign.currentAt;
  const r = resolve(camp.calendar, at);
  let place = "";
  if (s.locationId) {
    const [loc] = await db.select({ name: entities.name, type: entities.type, summary: entities.summary }).from(entities).where(and(eq(entities.id, s.locationId), eq(entities.worldId, opts.worldId)));
    if (loc) place = `${loc.name} (${loc.type.replace(/_/g, " ")}): ${loc.summary}`;
  }
  let combat = false;
  if (s.encounterId) {
    const [enc] = await db.select({ name: encounters.name }).from(encounters).where(eq(encounters.id, s.encounterId));
    combat = !!enc;
  }
  const text = [s.description, s.ambience && `Sounds: ${s.ambience}`, s.lighting && `Light: ${s.lighting}`, `Time: ${timeOfDay(camp.calendar, at)}${r.season ? `, ${r.season}` : ""}`].filter(Boolean).join(". ");
  return { info: { name: s.name, text, mood: s.mood, weather: s.weather || row.campaign.currentWeather || "", place, combat }, world, tech: w.techLevel };
}

const LOOP_RULES = "Designed to loop: the same tempo, key and intensity from the first second to the last, no intro, no build-up, no ending, no fade-in or fade-out.";

export async function writeBriefs(scene: { info: SceneInfo; world: string; tech: string }, opts: { note?: string; length: "loop" | "long" }): Promise<{ music: ScoreBrief; ambience: ScoreBrief; provider: string }> {
  const seconds = opts.length === "loop" ? 30 : 90;
  const provider = await getAIProvider();
  if (provider.live) {
    try {
      const out = await provider.structured({
        name: "scene_score",
        schema: briefsSchema,
        fast: true,
        maxTokens: 1500,
        system: "You write prompts for Google's Lyria music model to score tabletop RPG scenes. Lyria responds to concrete musical language: instruments, tempo in BPM, key or mode, texture, dynamics and mood. It blocks artist names, song titles and lyrics, so never use them.",
        messages: [
          {
            role: "user",
            content: `World: ${scene.world}
Scene: ${scene.info.name}
${scene.info.place ? `Place: ${scene.info.place}\n` : ""}${scene.info.text ? `Details: ${scene.info.text}\n` : ""}${scene.info.mood ? `Mood: ${scene.info.mood}\n` : ""}${scene.info.weather ? `Weather: ${scene.info.weather}\n` : ""}${scene.info.combat ? "There is a fight in this scene.\n" : ""}${opts.note?.trim() ? `The DM's note: ${opts.note.trim()}\n` : ""}
Write two Lyria prompts for this scene, each 40-90 words:
1. music: background music for the table. Instrumental only, no vocals, no lyrics. Use instruments that fit the world's technology (${scene.tech}): no synthesizers in a medieval world unless the world is strange. Keep it understated enough to talk over. About ${seconds} seconds. ${LOOP_RULES} End the prompt with: "Instrumental only, no vocals. ${LOOP_RULES}"
2. ambience: a realistic ambient soundscape for the place, NOT music: no melody, no instruments, no rhythm, no vocals. Name the layers (weather, crowd murmur, fire, water, wind, creatures, machinery) and their distance. About ${seconds} seconds, continuous and even. End the prompt with: "Ambient soundscape only: no music, no melody, no instruments, no vocals. Continuous and even, designed to loop seamlessly."
Give each a short evocative title and 2-4 one-word tags.`,
          },
        ],
      });
      noteAISuccess();
      return { music: tidy(out.music), ambience: tidy(out.ambience), provider: provider.name };
    } catch (err) {
      noteAIFailure(err instanceof Error ? err.message : String(err));
      console.error("[ai] scene score briefs failed, using templates", err);
    }
  }
  return { ...templateBriefs(scene, seconds), provider: "offline" };
}

function tidy(b: ScoreBrief): ScoreBrief {
  return { title: b.title.trim().slice(0, 100) || "Scene track", prompt: b.prompt.trim().slice(0, 2000), tags: b.tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 4) };
}

function instrumentsFor(tech: string) {
  if (/stone|bronze|classical/i.test(tech)) return "frame drums, bone flute, lyre and low drones";
  if (/industrial|steam|magitech/i.test(tech)) return "brass, cello, music-box chimes and mechanical percussion";
  if (/sail/i.test(tech)) return "fiddle, concertina, low strings and a slow bodhran";
  if (/modern|futur/i.test(tech)) return "warm analog synth pads, muted piano and soft electronic pulses";
  return "lute, hurdy-gurdy, low strings and soft hand drums";
}

export function templateBriefs(scene: { info: SceneInfo; tech: string }, seconds: number): { music: ScoreBrief; ambience: ScoreBrief } {
  const i = scene.info;
  const all = `${i.name} ${i.text} ${i.mood} ${i.place} ${i.weather}`.toLowerCase();
  const tense = i.combat || /tense|danger|fear|dread|ambush|dark|grim|chase/.test(all);
  const mood = i.mood || (tense ? "tense and watchful" : "warm and unhurried");
  const tempo = i.combat ? "110 BPM, driving" : tense ? "70 BPM, restrained" : "80 BPM, relaxed";
  const layers = [
    /rain|storm/.test(all) ? "steady rain on roofs and stone" : "",
    /storm|thunder/.test(all) ? "distant rolling thunder" : "",
    /wind|snow|mountain|peak/.test(all) ? "wind gusting over open ground" : "",
    /tavern|inn|alehouse|crowd|market|feast/.test(all) ? "low crowd murmur, clinking mugs and a crackling hearth" : "",
    /forest|wood|grove/.test(all) ? "rustling leaves, birdsong and creaking branches" : "",
    /sea|harbou?r|dock|ship|coast|river/.test(all) ? "lapping water, creaking timbers and gulls far off" : "",
    /cave|dungeon|crypt|tomb|mine|sewer/.test(all) ? "dripping water, hollow echoes and a faint low rumble" : "",
    /city|street|town/.test(all) ? "footsteps on cobbles, distant cart wheels and voices" : "",
  ].filter(Boolean);
  const amb = layers.length ? layers.join(", ") : "soft wind, distant birds and the faint hum of a quiet place";
  return {
    music: {
      title: `${i.name} (theme)`,
      prompt: `Background music for a tabletop scene: ${i.name}. ${mood[0]!.toUpperCase()}${mood.slice(1)}, ${tempo}, featuring ${instrumentsFor(scene.tech)}. Understated, easy to talk over. About ${seconds} seconds. Instrumental only, no vocals. ${LOOP_RULES}`,
      tags: [tense ? "tense" : "calm", i.combat ? "combat" : "scene"],
    },
    ambience: {
      title: `${i.name} (ambience)`,
      prompt: `A realistic ambient soundscape: ${amb}. About ${seconds} seconds. Ambient soundscape only: no music, no melody, no instruments, no vocals. Continuous and even, designed to loop seamlessly.`,
      tags: ["ambience", ...layers.slice(0, 2).map((l) => l.split(" ").find((w) => w.length > 3) ?? "place")],
    },
  };
}
