/**
 * The world profile: the choices made in the world creator that shape every later generation
 * (where magic comes from, how people feel about it, the shape of the map, governments, faith,
 * history, and content to keep out). Stored in `worlds.settings.profile`.
 */
import { z } from "zod";

export const GENRES = ["High fantasy", "Dark fantasy", "Sword & sorcery", "Low fantasy", "Steampunk", "Gaslamp fantasy", "Nautical fantasy", "Gothic horror", "Cosmic horror", "Mythic / ancient", "Science fantasy", "Post-apocalyptic", "Weird west", "Fairy tale"];
export const MAGIC_LEVELS = ["None", "Low", "Moderate", "High", "Wild", "Mythic"];
export const TECH_LEVELS = ["Stone age", "Bronze age", "Classical", "Medieval", "Renaissance", "Age of sail", "Early industrial", "Industrial", "Magitech", "Modern", "Futuristic"];
export const TONES = ["Heroic", "Grim", "Political intrigue", "Whimsical", "Horror", "Swashbuckling", "Mysterious", "Hopeful", "Epic", "Gritty survival"];
export const MAGIC_SOURCES = ["Arcane study", "Divine gifts", "Pacts with patrons", "Bloodlines", "Nature and spirits", "Wild surges", "Ancient relics", "Runes and craft", "Psionics", "Machines and alchemy"];
export const MAGIC_ATTITUDES = ["Everyday and accepted", "Respected but rare", "Licensed and regulated", "Feared", "Outlawed", "Secret from most people"];
export const WORLD_SHAPES = ["One great continent", "Several continents", "An archipelago", "A single region", "An underground realm", "Floating islands", "A planar crossroads"];
export const CLIMATES = ["Temperate", "Frozen north", "Deserts", "Jungles", "Mountains", "Swamps", "Seas and coasts", "Volcanic lands", "Endless steppe", "Blighted wastes", "Magical wilds"];
export const GOVERNMENTS = ["Monarchy", "Empire", "Republic", "Theocracy", "City-states", "Merchant oligarchy", "Magocracy", "Tribal confederation", "Feudal lords", "Anarchic frontier"];
export const RELIGION_STYLES = ["A pantheon of gods", "One god", "Two opposed powers", "Spirits and ancestors", "Gods who walk the world", "Dead or silent gods", "No gods, only belief"];
export const HISTORY_HOOKS = ["A fallen empire", "A recent war", "A cataclysm", "An age of discovery", "An ancient evil returning", "A broken dynasty", "A plague", "A revolution", "First contact with another people"];

export const worldProfileSchema = z.object({
  magicSources: z.array(z.string().max(80)).max(12).optional(),
  magicAttitude: z.string().max(120).optional(),
  worldShape: z.string().max(120).optional(),
  climates: z.array(z.string().max(80)).max(12).optional(),
  regions: z.string().max(2000).optional(),
  landmarks: z.string().max(2000).optional(),
  governments: z.array(z.string().max(80)).max(12).optional(),
  nationCount: z.number().int().min(1).max(8).optional(),
  factionCount: z.number().int().min(1).max(8).optional(),
  religionStyle: z.string().max(120).optional(),
  historyHooks: z.array(z.string().max(80)).max(12).optional(),
  themes: z.string().max(2000).optional(),
  conflict: z.string().max(2000).optional(),
  inspirations: z.string().max(1000).optional(),
  startingArea: z.string().max(1000).optional(),
  detailStart: z.boolean().optional(),
  avoid: z.string().max(1000).optional(),
});
export type WorldProfile = z.infer<typeof worldProfileSchema>;

const list = (xs?: string[]) => (xs?.length ? xs.join(", ") : "");

/** A compact description of the profile for AI prompts. Empty parts are left out. */
export function profileSummary(p: WorldProfile | undefined | null): string {
  if (!p) return "";
  const lines = [
    p.magicSources?.length || p.magicAttitude ? `Magic: ${[list(p.magicSources) && `comes from ${list(p.magicSources).toLowerCase()}`, p.magicAttitude && `society sees it as ${p.magicAttitude.toLowerCase()}`].filter(Boolean).join("; ")}` : "",
    p.worldShape || p.climates?.length ? `Geography: ${[p.worldShape, list(p.climates)].filter(Boolean).join("; ")}` : "",
    p.regions ? `Regions wanted: ${p.regions}` : "",
    p.landmarks ? `Landmarks: ${p.landmarks}` : "",
    p.governments?.length ? `Governments: ${list(p.governments)}` : "",
    p.religionStyle ? `Religion: ${p.religionStyle}` : "",
    p.historyHooks?.length ? `History: ${list(p.historyHooks)}` : "",
    p.themes ? `Themes: ${p.themes}` : "",
    p.conflict ? `Central conflict: ${p.conflict}` : "",
    p.inspirations ? `Inspirations: ${p.inspirations}` : "",
    p.startingArea ? `Play begins: ${p.startingArea}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

/** The DM's "lines": content generation must never include. */
export function avoidLine(p: WorldProfile | undefined | null): string {
  return p?.avoid?.trim() ? `Content to keep out of this world entirely (the DM's lines; never include, hint at or work around these): ${p.avoid.trim()}` : "";
}
