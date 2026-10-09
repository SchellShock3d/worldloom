/**
 * Shapes for the AI-led world creator ("Spark"): pitches and the six draft sections.
 * Empty strings mean "none"; the model gets these exact schemas.
 * Client code imports only the types from here.
 */
import { z } from "zod";
import { MAGIC_LEVELS, TECH_LEVELS } from "./world-profile";
import { PREVALENCE } from "./peoples";

const REGION_CLIMATES = ["Temperate", "Arid", "Tropical", "Arctic", "Subarctic", "Mediterranean", "Highland", "Swamp", "Coastal", "Magical"] as const;
const SETTLEMENT_SIZES = ["Hamlet", "Village", "Town", "City", "Metropolis"] as const;
const TIE_TYPES = ["allied_with", "enemy_of", "at_war_with", "rival_of", "controls", "serves", "seeks", "threatens", "related_to"] as const;

export const pitchSchema = z.object({
  name: z.string().describe("An original, evocative name for the world"),
  logline: z.string().describe("One sentence that sells the world, under 25 words"),
  pitch: z.string().describe("Two short paragraphs, under 120 words in all: what the world is like and what's going wrong in it"),
  genre: z.string().describe("Two to four words, e.g. 'Gaslamp fantasy' or 'Mythic bronze age'"),
  tone: z.string().describe("Two to four words"),
  magicLevel: z.enum(MAGIC_LEVELS as [string, ...string[]]),
  techLevel: z.enum(TECH_LEVELS as [string, ...string[]]),
  conflict: z.string().describe("The central conflict, one sentence"),
  hook: z.string().describe("What makes this world unlike other fantasy worlds, one sentence"),
  peoples: z.string().describe("One sentence on who lives here: races, and any unusual peoples or classes"),
  touchstones: z.string().describe("Three or four inspirations, comma-separated"),
});
export type WorldPitch = z.infer<typeof pitchSchema>;
export const pitchesSchema = z.object({ pitches: z.array(pitchSchema) });

export const overviewSchema = z.object({
  name: z.string(),
  logline: z.string().describe("One sentence, under 30 words"),
  genre: z.string().describe("Two to four words"),
  tone: z.string().describe("Two to four words"),
  magicLevel: z.enum(MAGIC_LEVELS as [string, ...string[]]),
  techLevel: z.enum(TECH_LEVELS as [string, ...string[]]),
  overview: z.string().describe("Two or three paragraphs of markdown a player could read: the feel of the world, its history in brief, what life is like"),
  secret: z.string().describe("The hidden truth beneath it all, for the DM only. One or two sentences"),
  themes: z.string().describe("Three or four themes, comma-separated"),
  conflict: z.string().describe("The central conflict, one or two sentences"),
  magicSources: z.array(z.string()).describe("Where magic comes from, 1-3 short phrases"),
  magicAttitude: z.string().describe("How ordinary people feel about magic, a few words"),
  worldShape: z.string().describe("The broad shape of the map in two to six words (e.g. 'an archipelago', 'one continent split by a rift')"),
});
export type OverviewSection = z.infer<typeof overviewSchema>;

export const landSchema = z.object({
  landmasses: z.array(z.object({ name: z.string(), summary: z.string() })),
  regions: z.array(
    z.object({
      name: z.string(),
      landmass: z.string().describe("Name of the landmass it's on, from landmasses"),
      climate: z.enum(REGION_CLIMATES),
      terrain: z.string().describe("A few words"),
      summary: z.string().describe("One or two vivid sentences"),
      danger: z.string().describe("What makes it dangerous or interesting to adventurers, one sentence"),
    }),
  ),
  landmarks: z.array(z.object({ name: z.string(), region: z.string().describe("Region name"), summary: z.string() })),
});
export type LandSection = z.infer<typeof landSchema>;

const personKind = {
  name: z.string(),
  core: z.boolean().describe("true for a D&D 5e core race/class, false for homebrew"),
  prevalence: z.enum(PREVALENCE),
};
export const peoplesSchema = z.object({
  races: z.array(z.object({ ...personKind, place: z.string().describe("Where they live in this world and how others see them, one or two sentences"), traits: z.string().describe("Homebrew only: rules highlights (size, speed, senses, signature abilities). Empty for core races") })),
  classes: z.array(z.object({ ...personKind, place: z.string().describe("How this world sees them and where they train, one or two sentences"), features: z.string().describe("Homebrew only: role, hit die and signature abilities. Empty for core classes") })),
});
export type PeoplesSection = z.infer<typeof peoplesSchema>;

export const powersSchema = z.object({
  nations: z.array(
    z.object({
      name: z.string(),
      region: z.string().describe("Region name it's in, from the land section"),
      government: z.string(),
      ruler: z.string().describe("Who rules, one short phrase"),
      demographics: z.string().describe("e.g. 'Human 55%, Dwarf 25%, Gnome 15%, other 5%', using this world's races"),
      summary: z.string(),
    }),
  ),
  factions: z.array(
    z.object({
      name: z.string(),
      kind: z.string().describe("guild, cult, order, house, company…"),
      base: z.string().describe("Nation or region name where they're strongest"),
      goal: z.string(),
      summary: z.string(),
      secret: z.string().describe("For the DM only"),
    }),
  ),
  religions: z.array(z.object({ name: z.string(), summary: z.string(), deities: z.array(z.object({ name: z.string(), domains: z.string().describe("Comma-separated"), summary: z.string() })) })),
  ties: z.array(z.object({ from: z.string().describe("Nation or faction name"), type: z.enum(TIE_TYPES), to: z.string().describe("Nation, faction or region name"), why: z.string() })),
});
export type PowersSection = z.infer<typeof powersSchema>;

export const historySchema = z.object({
  events: z.array(z.object({ title: z.string(), yearsAgo: z.number(), summary: z.string(), involved: z.array(z.string()).describe("Names of nations, factions, peoples or places involved") })),
  threads: z.array(
    z.object({
      name: z.string().describe("Named like a headline, e.g. 'The Guilds race for the last aether wells'"),
      summary: z.string(),
      stakes: z.string().describe("What happens if nobody intervenes"),
      drivers: z.array(z.string()).describe("Names of the factions or nations pushing it"),
      urgency: z.number().describe("1-5"),
    }),
  ),
});
export type HistorySection = z.infer<typeof historySchema>;

export const startSchema = z.object({
  settlement: z.object({
    name: z.string(),
    size: z.enum(SETTLEMENT_SIZES),
    within: z.string().describe("Nation or region name it belongs to"),
    population: z.string(),
    demographics: z.string().describe("e.g. 'Human 50%, Halfling 30%, other 20%'"),
    summary: z.string(),
    features: z.string().describe("Two or three notable places or quirks"),
  }),
  tavern: z.object({ name: z.string(), summary: z.string(), ambience: z.string() }),
  npcs: z.array(
    z.object({
      name: z.string(),
      race: z.string().describe("One of this world's races"),
      className: z.string().describe("Only for adventurers and casters; empty otherwise"),
      occupation: z.string(),
      summary: z.string(),
      want: z.string(),
      secret: z.string().describe("For the DM only"),
    }),
  ),
  rumours: z.array(z.object({ claim: z.string(), truth: z.string().describe("For the DM only"), accuracy: z.number().describe("0-100") })),
  hook: z.string().describe("The situation that opens session one, two or three sentences, for the DM"),
});
export type StartSection = z.infer<typeof startSchema>;

export const SECTION_SCHEMAS = { overview: overviewSchema, land: landSchema, peoples: peoplesSchema, powers: powersSchema, history: historySchema, start: startSchema };
export type SectionKey = keyof typeof SECTION_SCHEMAS;
export type SectionData = { overview: OverviewSection; land: LandSection; peoples: PeoplesSection; powers: PowersSection; history: HistorySection; start: StartSection };
export type AnySection = SectionData[SectionKey];
export type DraftSections = { [K in SectionKey]?: SectionData[K] };
