/**
 * The world creator's helpers: suggestions for a field based on everything written so far, and
 * homebrew races and classes that fit the world. Claude writes them when connected; otherwise the
 * offline banks do, so the creator works without a key.
 */
import { z } from "zod";
import { getAIProvider, noteAIFailure, noteAISuccess } from "../provider";
import { COPILOT_IDENTITY } from "../prompts";
import { Rng, hashSeed } from "../offline/rng";
import { PREVALENCE, suggestHomebrew, type PeopleSuggestion, type WorldTraits } from "@/lib/peoples";
import { profileSummary, avoidLine, type WorldProfile } from "@/lib/world-profile";

export interface CreatorDraft {
  name?: string;
  genre?: string;
  tone?: string;
  magicLevel?: string;
  techLevel?: string;
  description?: string;
  profile?: WorldProfile;
  races?: string[];
  classes?: string[];
}

export const SUGGEST_FIELDS = {
  name: "a name for the world",
  tone: "the tone, in a few words",
  description: "a one-paragraph pitch for the world",
  inspirations: "inspirations (books, films, history, myths), as a short comma-separated list",
  regions: "the regions or geography wanted, as a short comma-separated list of evocative places",
  landmarks: "two or three famous landmarks, comma-separated",
  themes: "the themes that matter, as a short comma-separated list",
  conflict: "the central conflict, in one sentence",
  startingArea: "where play begins: a town or area and why it's a good starting point, in one sentence",
  avoid: "content a table might want to keep out (lines), as a short comma-separated list",
} as const;
export type SuggestField = keyof typeof SUGGEST_FIELDS;

function describeDraft(d: CreatorDraft) {
  return [
    d.name ? `Name: ${d.name}` : "",
    `Genre: ${d.genre ?? "?"} · Tone: ${d.tone || "?"} · Magic: ${d.magicLevel ?? "?"} · Technology: ${d.techLevel ?? "?"}`,
    d.description ? `Pitch: ${d.description}` : "",
    profileSummary(d.profile),
    d.races?.length ? `Races: ${d.races.join(", ")}` : "",
    d.classes?.length ? `Classes: ${d.classes.join(", ")}` : "",
    avoidLine(d.profile),
  ]
    .filter(Boolean)
    .join("\n");
}

const suggestionsSchema = z.object({ suggestions: z.array(z.string()) });

export async function suggestForField(field: SuggestField, draft: CreatorDraft): Promise<{ suggestions: string[]; provider: string }> {
  const provider = await getAIProvider();
  if (provider.live) {
    try {
      const out = await provider.structured({
        name: "suggestions",
        schema: suggestionsSchema,
        fast: true,
        maxTokens: 1200,
        system: `${COPILOT_IDENTITY}\nYou're helping a DM fill in a world-creation form. Every suggestion must fit what they've already written, and the four should differ from each other. Original names only, no published settings.`,
        messages: [{ role: "user", content: `What they have so far:\n${describeDraft(draft)}\n\nSuggest 4 options for ${SUGGEST_FIELDS[field]}. ${draft.profile?.[field as keyof WorldProfile] || draft[field as keyof CreatorDraft] ? "They already wrote something there; offer alternatives or extensions, not repeats." : ""} Keep each one short enough to fit in a form field.` }],
      });
      noteAISuccess();
      return { suggestions: out.suggestions.map((s) => s.trim()).filter(Boolean).slice(0, 4), provider: provider.name };
    } catch (err) {
      noteAIFailure(err instanceof Error ? err.message : String(err));
      console.error("[ai] creator suggestions failed, using offline", err);
    }
  }
  return { suggestions: offlineSuggestions(field, draft), provider: "offline" };
}

// ---------------------------------------------------------------------------
// Homebrew races and classes
// ---------------------------------------------------------------------------

const peopleSchema = z.object({
  items: z.array(
    z.object({
      kind: z.enum(["race", "class"]),
      name: z.string(),
      summary: z.string().describe("One evocative sentence"),
      prevalence: z.enum(PREVALENCE),
      reason: z.string().describe("One sentence: why this fits this world specifically"),
      fields: z.array(z.object({ key: z.string(), value: z.string() })),
    }),
  ),
});

const RACE_KEYS = "size, speed, lifespan, traits (rules highlights), appearance, homelands, society";
const CLASS_KEYS = "role, primaryAbility, hitDie (d6/d8/d10/d12), inWorld (how the world sees them), training, features (signature abilities)";

export async function suggestPeoples(opts: { draft: CreatorDraft; existing: string[]; kind?: "race" | "class"; context?: string }): Promise<{ items: PeopleSuggestion[]; provider: string }> {
  const traits: WorldTraits = { genre: opts.draft.genre, tone: opts.draft.tone, magicLevel: opts.draft.magicLevel, techLevel: opts.draft.techLevel, text: [opts.draft.description, profileSummary(opts.draft.profile)].join(" ") };
  const provider = await getAIProvider();
  if (provider.live) {
    try {
      const want = opts.kind === "race" ? "4 homebrew races" : opts.kind === "class" ? "4 homebrew classes" : "3 homebrew races and 3 homebrew classes";
      const out = await provider.structured({
        name: "homebrew_peoples",
        schema: peopleSchema,
        fast: true,
        maxTokens: 4000,
        system: `${COPILOT_IDENTITY}\nYou design homebrew D&D 5e races and classes that grow out of a specific world's premise, so the world feels distinct. Examples of the idea: a steampunk world makes artificers common; a high-magic world might have planeswalkers. Mix familiar archetypes that fit (artificer, gunslinger, planeswalker, witch hunter and the like) with original ones made for this world. Names should be original or generic words, never trademarked product names from published settings.`,
        messages: [
          {
            role: "user",
            content: `${opts.context ? `${opts.context}\n\n` : ""}The world so far:\n${describeDraft(opts.draft)}\n\nAlready in the world (don't repeat): ${opts.existing.join(", ") || "(nothing yet)"}\n\nPropose ${want} that this world's genre, magic, technology, geography and conflicts would naturally produce. For each: how common it is, a one-sentence summary, why it fits, and fields. Race field keys: ${RACE_KEYS}. Class field keys: ${CLASS_KEYS}. Keep traits and features short and playable.`,
          },
        ],
      });
      noteAISuccess();
      const taken = new Set(opts.existing.map((n) => n.toLowerCase()));
      const items = out.items
        .filter((i) => i.name.trim() && !taken.has(i.name.trim().toLowerCase()) && (!opts.kind || i.kind === opts.kind))
        .map((i) => ({ ...i, name: i.name.trim(), fields: Object.fromEntries(i.fields.map((f) => [f.key, f.key === "hitDie" ? (f.value.match(/d(6|8|10|12)/)?.[0] ?? f.value) : f.value])) }));
      if (items.length) return { items, provider: provider.name };
    } catch (err) {
      noteAIFailure(err instanceof Error ? err.message : String(err));
      console.error("[ai] homebrew peoples failed, using offline", err);
    }
  }
  const max = opts.kind === "race" ? { race: 4, class: 0 } : opts.kind === "class" ? { race: 0, class: 4 } : { race: 3, class: 3 };
  return { items: suggestHomebrew(traits, opts.existing, max), provider: "offline" };
}

// ---------------------------------------------------------------------------
// Offline field suggestions
// ---------------------------------------------------------------------------

const BANK: Record<SuggestField, string[]> = {
  name: ["The Sundered Realms", "Veyl", "The Ninefold Crown", "Ashgrave", "Morrowmere", "The Brass Archipelago", "Hollowreach", "Caldris", "The Last Lantern", "Thornfall", "Greywater", "The Shattered Coast", "Aurenfell", "Duskmarch"],
  tone: ["Grim but hopeful", "Political intrigue with creeping dread", "Swashbuckling and bright", "Mysterious and melancholy", "Heroic, with real losses", "Whimsical on the surface, dark underneath", "Gritty frontier survival", "Epic and mythic"],
  description: [
    "An old empire has fallen, and the kingdoms carved from its corpse are already at each other's throats while something stirs in the ruins of the capital.",
    "The gods went silent a century ago. Their temples still stand, their priests still preach, and nobody admits that the prayers stopped working.",
    "A trade league of free cities holds the coast together with gold and lies, while the wild interior swallows every expedition sent to tame it.",
    "Magic returned last spring after a thousand years. No one alive knows how to use it safely, and everyone wants it.",
    "The great river is the only road through a land of fog and forest, and whoever holds its locks and ferries holds the realm.",
  ],
  inspirations: ["The fall of Rome, Byzantine court intrigue", "Earthsea, the age of sail, island folklore", "Gothic novels, folk horror, plague years", "Arthurian legend, Welsh myth", "Silk Road trade, desert empires", "Victorian London, industrial revolution", "Norse sagas, long winters", "Studio Ghibli, gentle wonder"],
  regions: ["A cold mountainous north, a river heartland, an ash desert in the south", "Scattered islands, a reef-wall, a drowned continent beneath", "Endless forest, a single great road, walled city-states", "A shattered coast, salt marshes, high moors", "Floating islands above a storm sea", "A jungle basin ringed by volcanoes"],
  landmarks: ["A bridge built by giants, a lighthouse that never goes out", "The Weeping Colossus, the Ninefold Gate", "A crater lake that reflects another sky", "The Bone Library, the Iron Stair", "A dead god's skull turned into a city"],
  themes: ["Corruption and redemption", "Faith versus reason", "The cost of empire", "Found family, home and exile", "Progress and what it destroys", "Memory, legacy, forgotten history", "Freedom versus safety"],
  conflict: [
    "A dying king, a scheming regent, and an heir nobody can find.",
    "Two trading companies race to claim newly risen islands, and both are willing to start a war.",
    "A cult wants to wake the god sleeping beneath the capital, and some of the nobility agree with them.",
    "The border wall that kept the wilds out is failing, and the kingdoms behind it would rather blame each other.",
    "An industrial revolution is turning the old guilds and the old magic against the new factories.",
  ],
  startingArea: [
    "A river-crossing town where every faction has an agent and the bridge toll pays for all of them.",
    "A frontier fort at the edge of the map, the last place to buy supplies before the wilds.",
    "A port city's lower docks, where smugglers, sailors and spies drink at the same tavern.",
    "A village beside a newly opened ruin that everyone wants a piece of.",
  ],
  avoid: ["Harm to children, sexual content", "Graphic torture, real-world hate groups", "Spiders, body horror", "Slavery as a plot device", "Suicide, self-harm"],
};

function offlineSuggestions(field: SuggestField, d: CreatorDraft): string[] {
  const rng = new Rng(hashSeed(field, d.name ?? "", d.genre ?? "", d.tone ?? "", d.description ?? "", String(Date.now() / 60000 | 0)));
  const genre = (d.genre ?? "").toLowerCase();
  const prefer = (xs: string[]) => {
    const hit = (s: string) => (genre.includes("steam") || genre.includes("gaslamp") ? /industr|victorian|factor|brass/i : genre.includes("naut") ? /island|sea|sail|coast|port|reef|drown/i : genre.includes("horror") || genre.includes("gothic") ? /gothic|plague|horror|dead|bone|weep/i : genre.includes("myth") ? /myth|god|giant|epic/i : /./).test(s);
    return [...xs.filter(hit), ...xs.filter((x) => !hit(x))];
  };
  const pool = prefer(rng.shuffle(BANK[field]));
  return pool.slice(0, 4);
}
