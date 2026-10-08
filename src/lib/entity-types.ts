/**
 * Built-in entity type registry.
 *
 * Every linkable "thing" in a world is a row in `entities` with a stable UUID.
 * The common, queryable facts (name, status, location, visibility, canon state,
 * tags, relationships) live in real columns/tables. Descriptive, type-specific
 * attributes (an NPC's mannerisms, a tavern's menu) live in `entities.fields`
 * and are validated against the field definitions below. Custom types defined
 * per world use the same FieldDef format (stored in `custom_entity_types`).
 *
 * A handful of types carry relational structure that is queried constantly
 * (quests, world threads, mysteries, rumours, timeline events); those get a
 * 1:1 extension table keyed by entity id.
 */
import { z } from "zod";

export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "boolean"
  | "tags"
  | "inventory"
  | "abilities";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  options?: string[];
  placeholder?: string;
  help?: string;
  /** "dm" fields are never shown to players. */
  section?: "details" | "dm" | "stats";
  /** Show on list/table views. */
  inList?: boolean;
}

export type EntityGroup = "people" | "places" | "powers" | "culture" | "things" | "lore" | "play";

export interface EntityTypeDef {
  key: string;
  label: string;
  plural: string;
  group: EntityGroup;
  icon: string; // lucide icon name, resolved in the UI
  /** CSS variable name suffix for the type colour, e.g. "people" → var(--type-people) */
  tone: EntityGroup;
  description: string;
  isPlace?: boolean;
  /** Entities of this type are scoped to a campaign (e.g. player characters). */
  campaignScoped?: boolean;
  /** Has a 1:1 extension table. */
  extension?: "quest" | "thread" | "mystery" | "rumour" | "event";
  statuses?: string[];
  fields: FieldDef[];
  /** Hidden from the generic "create" menu (created via a dedicated flow). */
  hiddenFromCreate?: boolean;
}

const CLIMATES = ["Temperate", "Arid", "Tropical", "Arctic", "Subarctic", "Mediterranean", "Highland", "Swamp", "Coastal", "Magical"];
const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
const RARITIES = ["Common", "Uncommon", "Rare", "Very rare", "Legendary", "Artifact"];

const PLACE_STATUSES = ["thriving", "stable", "troubled", "declining", "occupied", "ruined", "destroyed", "lost"];

export const ENTITY_TYPES: EntityTypeDef[] = [
  // People ------------------------------------------------------------------
  {
    key: "npc",
    label: "NPC",
    plural: "NPCs",
    group: "people",
    tone: "people",
    icon: "user-round",
    description: "A character in the world played by the DM.",
    statuses: ["alive", "dead", "missing", "imprisoned", "unknown"],
    fields: [
      { key: "species", label: "Race / species", kind: "text", inList: true },
      { key: "occupation", label: "Occupation", kind: "text", inList: true },
      { key: "age", label: "Age", kind: "text" },
      { key: "pronouns", label: "Pronouns", kind: "text" },
      { key: "appearance", label: "Appearance", kind: "textarea" },
      { key: "personality", label: "Personality", kind: "textarea" },
      { key: "mannerisms", label: "Mannerisms", kind: "textarea" },
      { key: "voice", label: "Voice notes", kind: "textarea", placeholder: "Accent, pace, catchphrases" },
      { key: "motivations", label: "Motivations", kind: "textarea" },
      { key: "goals", label: "Goals", kind: "textarea" },
      { key: "fears", label: "Fears", kind: "textarea" },
      { key: "currentActivity", label: "Current activity", kind: "textarea" },
      { key: "inventory", label: "Inventory", kind: "textarea" },
      { key: "secrets", label: "Secrets", kind: "textarea", section: "dm" },
    ],
  },
  {
    key: "pc",
    label: "Player character",
    plural: "Player characters",
    group: "people",
    tone: "people",
    icon: "shield-user",
    description: "A hero played by one of your players. Belongs to a campaign.",
    campaignScoped: true,
    statuses: ["active", "absent", "retired", "dead"],
    fields: [
      { key: "playerName", label: "Player", kind: "text", inList: true },
      { key: "className", label: "Class", kind: "text", inList: true },
      { key: "level", label: "Level", kind: "number", inList: true },
      { key: "species", label: "Species", kind: "text" },
      { key: "background", label: "Background", kind: "text" },
      { key: "hpMax", label: "Max HP", kind: "number", section: "stats" },
      { key: "ac", label: "Armor class", kind: "number", section: "stats" },
      { key: "passivePerception", label: "Passive Perception", kind: "number", section: "stats" },
      { key: "initiativeBonus", label: "Initiative bonus", kind: "number", section: "stats" },
      { key: "goals", label: "Goals & bonds", kind: "textarea" },
      { key: "inventory", label: "Notable inventory", kind: "textarea" },
      { key: "dmHooks", label: "Hooks for the DM", kind: "textarea", section: "dm" },
    ],
  },
  {
    key: "creature",
    label: "Creature",
    plural: "Bestiary",
    group: "people",
    tone: "people",
    icon: "paw-print",
    description: "A monster or beast with a stat block.",
    statuses: ["common", "rare", "endangered", "extinct", "unique"],
    fields: [
      { key: "size", label: "Size", kind: "select", options: SIZES, inList: true },
      { key: "creatureType", label: "Type", kind: "text", placeholder: "beast, undead, fey…", inList: true },
      { key: "challenge", label: "Challenge", kind: "text", placeholder: "e.g. 1/2, 3, 11", inList: true },
      { key: "alignment", label: "Alignment", kind: "text" },
      { key: "armorClass", label: "Armor class", kind: "number", section: "stats" },
      { key: "hitPoints", label: "Hit points", kind: "text", placeholder: "27 (5d8 + 5)", section: "stats" },
      { key: "speed", label: "Speed", kind: "text", placeholder: "30 ft., climb 20 ft.", section: "stats" },
      { key: "abilities", label: "Ability scores", kind: "abilities", section: "stats" },
      { key: "senses", label: "Senses", kind: "text", section: "stats" },
      { key: "languages", label: "Languages", kind: "text", section: "stats" },
      { key: "traits", label: "Traits", kind: "textarea", section: "stats" },
      { key: "actions", label: "Actions", kind: "textarea", section: "stats" },
      { key: "reactions", label: "Reactions", kind: "textarea", section: "stats" },
      { key: "habitat", label: "Habitat", kind: "text" },
      { key: "tactics", label: "Tactics", kind: "textarea", section: "dm" },
    ],
  },
  // Places ------------------------------------------------------------------
  {
    key: "continent",
    label: "Continent",
    plural: "Continents",
    group: "places",
    tone: "places",
    icon: "earth",
    description: "A landmass containing regions and nations.",
    isPlace: true,
    statuses: PLACE_STATUSES,
    fields: [
      { key: "climate", label: "Climate", kind: "select", options: CLIMATES, inList: true },
      { key: "geography", label: "Geography", kind: "textarea" },
    ],
  },
  {
    key: "region",
    label: "Region",
    plural: "Regions",
    group: "places",
    tone: "places",
    icon: "mountain",
    description: "A geographic area: a valley, a forest, a coast.",
    isPlace: true,
    statuses: PLACE_STATUSES,
    fields: [
      { key: "climate", label: "Climate", kind: "select", options: CLIMATES, inList: true },
      { key: "terrain", label: "Terrain", kind: "text", inList: true },
      { key: "dangers", label: "Dangers", kind: "textarea" },
      { key: "resources", label: "Resources", kind: "textarea" },
    ],
  },
  {
    key: "nation",
    label: "Nation",
    plural: "Nations",
    group: "places",
    tone: "places",
    icon: "flag",
    description: "A kingdom, empire, or other sovereign power.",
    isPlace: true,
    statuses: ["stable", "prosperous", "at war", "in crisis", "occupied", "fallen"],
    fields: [
      { key: "government", label: "Government", kind: "text", inList: true },
      { key: "population", label: "Population", kind: "text" },
      { key: "economy", label: "Economy", kind: "textarea" },
      { key: "military", label: "Military", kind: "textarea" },
      { key: "laws", label: "Notable laws & customs", kind: "textarea" },
    ],
  },
  {
    key: "settlement",
    label: "Settlement",
    plural: "Settlements",
    group: "places",
    tone: "places",
    icon: "castle",
    description: "A hamlet, village, town, or city.",
    isPlace: true,
    statuses: PLACE_STATUSES,
    fields: [
      { key: "size", label: "Size", kind: "select", options: ["Hamlet", "Village", "Town", "City", "Metropolis"], inList: true },
      { key: "population", label: "Population", kind: "text", inList: true },
      { key: "government", label: "Government", kind: "text" },
      { key: "economy", label: "Economy", kind: "textarea" },
      { key: "defenses", label: "Defenses", kind: "textarea" },
      { key: "notableFeatures", label: "Notable features", kind: "textarea" },
    ],
  },
  {
    key: "location",
    label: "Location",
    plural: "Locations",
    group: "places",
    tone: "places",
    icon: "map-pin",
    description: "Any notable place: a building, a ruin, a crossroads.",
    isPlace: true,
    statuses: PLACE_STATUSES,
    fields: [
      { key: "kind", label: "Kind", kind: "text", placeholder: "temple, manor, bridge…", inList: true },
      { key: "features", label: "Features", kind: "textarea" },
      { key: "sensory", label: "Sights, sounds, smells", kind: "textarea" },
    ],
  },
  {
    key: "dungeon",
    label: "Dungeon",
    plural: "Dungeons",
    group: "places",
    tone: "places",
    icon: "door-closed",
    description: "A dangerous place to explore.",
    isPlace: true,
    statuses: ["unexplored", "partially explored", "cleared", "reoccupied", "sealed", "collapsed"],
    fields: [
      { key: "dungeonType", label: "Type", kind: "text", placeholder: "crypt, mine, lair…", inList: true },
      { key: "danger", label: "Danger level", kind: "select", options: ["Low", "Moderate", "High", "Deadly"], inList: true },
      { key: "levels", label: "Levels / areas", kind: "textarea" },
      { key: "inhabitants", label: "Inhabitants", kind: "textarea" },
      { key: "traps", label: "Traps & hazards", kind: "textarea", section: "dm" },
      { key: "treasure", label: "Treasure", kind: "textarea", section: "dm" },
    ],
  },
  {
    key: "landmark",
    label: "Landmark",
    plural: "Landmarks",
    group: "places",
    tone: "places",
    icon: "landmark",
    description: "A famous natural or built feature.",
    isPlace: true,
    statuses: PLACE_STATUSES,
    fields: [
      { key: "landmarkType", label: "Type", kind: "text", inList: true },
      { key: "significance", label: "Significance", kind: "textarea" },
    ],
  },
  {
    key: "shop",
    label: "Shop",
    plural: "Shops",
    group: "places",
    tone: "places",
    icon: "store",
    description: "A place to buy and sell.",
    isPlace: true,
    statuses: ["open", "closed", "struggling", "booming", "destroyed"],
    fields: [
      { key: "shopType", label: "Shop type", kind: "text", placeholder: "smith, alchemist, general…", inList: true },
      { key: "pricing", label: "Pricing", kind: "select", options: ["Cheap", "Fair", "Expensive", "Extortionate"], inList: true },
      { key: "hours", label: "Hours", kind: "text" },
      { key: "inventory", label: "Inventory", kind: "inventory" },
      { key: "specialItems", label: "Special items", kind: "textarea" },
      { key: "notes", label: "Notes", kind: "textarea", section: "dm" },
    ],
  },
  {
    key: "tavern",
    label: "Tavern",
    plural: "Taverns",
    group: "places",
    tone: "places",
    icon: "beer",
    description: "An inn, tavern, or alehouse.",
    isPlace: true,
    statuses: ["open", "closed", "struggling", "booming", "destroyed"],
    fields: [
      { key: "quality", label: "Quality", kind: "select", options: ["Squalid", "Poor", "Modest", "Comfortable", "Wealthy", "Aristocratic"], inList: true },
      { key: "ambience", label: "Ambience", kind: "textarea" },
      { key: "menu", label: "Menu", kind: "inventory" },
      { key: "rooms", label: "Rooms", kind: "textarea" },
      { key: "staff", label: "Staff", kind: "textarea" },
      { key: "patrons", label: "Regular patrons", kind: "textarea" },
      { key: "events", label: "Events & entertainment", kind: "textarea" },
    ],
  },
  // Powers ------------------------------------------------------------------
  {
    key: "faction",
    label: "Faction",
    plural: "Factions",
    group: "powers",
    tone: "powers",
    icon: "swords",
    description: "A group with goals, resources, and enemies.",
    statuses: ["active", "rising", "weakened", "dormant", "in hiding", "destroyed"],
    fields: [
      { key: "factionType", label: "Type", kind: "text", placeholder: "guild, cult, order, house…", inList: true },
      { key: "motto", label: "Motto", kind: "text" },
      { key: "symbol", label: "Symbol", kind: "text" },
      { key: "goals", label: "Goals", kind: "textarea" },
      { key: "resources", label: "Resources", kind: "textarea" },
      { key: "territory", label: "Territory", kind: "textarea" },
      { key: "publicReputation", label: "Public reputation", kind: "textarea" },
      { key: "currentPlans", label: "Current plans", kind: "textarea", section: "dm" },
      { key: "secrets", label: "Secrets", kind: "textarea", section: "dm" },
    ],
  },
  {
    key: "organization",
    label: "Organization",
    plural: "Organizations",
    group: "powers",
    tone: "powers",
    icon: "building-2",
    description: "A company, school, council, or other institution.",
    statuses: ["active", "growing", "declining", "defunct"],
    fields: [
      { key: "orgType", label: "Type", kind: "text", inList: true },
      { key: "purpose", label: "Purpose", kind: "textarea" },
      { key: "structure", label: "Structure", kind: "textarea" },
      { key: "secrets", label: "Secrets", kind: "textarea", section: "dm" },
    ],
  },
  {
    key: "religion",
    label: "Religion",
    plural: "Religions",
    group: "powers",
    tone: "powers",
    icon: "sun",
    description: "A faith, church, or cult.",
    statuses: ["widespread", "established", "minor", "persecuted", "forgotten"],
    fields: [
      { key: "tenets", label: "Tenets", kind: "textarea" },
      { key: "practices", label: "Practices & rites", kind: "textarea" },
      { key: "clergy", label: "Clergy", kind: "textarea" },
      { key: "holyDays", label: "Holy days", kind: "textarea" },
      { key: "symbols", label: "Symbols", kind: "text" },
    ],
  },
  {
    key: "deity",
    label: "Deity",
    plural: "Deities",
    group: "powers",
    tone: "powers",
    icon: "sparkles",
    description: "A god, demigod, or divine power.",
    statuses: ["active", "dormant", "dead", "imprisoned", "ascending"],
    fields: [
      { key: "domains", label: "Domains", kind: "tags", inList: true },
      { key: "alignment", label: "Alignment", kind: "text", inList: true },
      { key: "symbol", label: "Holy symbol", kind: "text" },
      { key: "portfolio", label: "Portfolio", kind: "textarea" },
      { key: "trueNature", label: "True nature", kind: "textarea", section: "dm" },
    ],
  },
  // Culture -----------------------------------------------------------------
  {
    key: "culture",
    label: "Culture",
    plural: "Cultures",
    group: "culture",
    tone: "culture",
    icon: "users",
    description: "A people and their ways.",
    fields: [
      { key: "values", label: "Values", kind: "textarea" },
      { key: "customs", label: "Customs", kind: "textarea" },
      { key: "dress", label: "Dress & appearance", kind: "textarea" },
      { key: "cuisine", label: "Cuisine", kind: "textarea" },
      { key: "namingConventions", label: "Naming conventions", kind: "textarea", help: "Used by the name generator." },
      { key: "sampleNames", label: "Sample names", kind: "tags", help: "Used by the name generator." },
    ],
  },
  {
    key: "language",
    label: "Language",
    plural: "Languages",
    group: "culture",
    tone: "culture",
    icon: "languages",
    description: "A spoken or written language.",
    statuses: ["living", "dying", "dead", "secret"],
    fields: [
      { key: "script", label: "Script", kind: "text", inList: true },
      { key: "family", label: "Language family", kind: "text" },
      { key: "sound", label: "How it sounds", kind: "textarea" },
      { key: "phrases", label: "Common phrases", kind: "textarea" },
    ],
  },
  // Things ------------------------------------------------------------------
  {
    key: "item",
    label: "Item",
    plural: "Items",
    group: "things",
    tone: "things",
    icon: "package",
    description: "A mundane object, treasure, or quest item.",
    statuses: ["intact", "damaged", "destroyed", "lost", "stolen"],
    fields: [
      { key: "category", label: "Category", kind: "select", options: ["Weapon", "Armor", "Gear", "Treasure", "Quest item", "Trinket", "Document", "Other"], inList: true },
      { key: "value", label: "Value", kind: "text", inList: true },
      { key: "weight", label: "Weight", kind: "text" },
      { key: "properties", label: "Properties", kind: "textarea" },
    ],
  },
  {
    key: "magic_item",
    label: "Magic item",
    plural: "Magic items",
    group: "things",
    tone: "things",
    icon: "gem",
    description: "An enchanted object or artifact.",
    statuses: ["intact", "dormant", "damaged", "destroyed", "lost", "stolen"],
    fields: [
      { key: "rarity", label: "Rarity", kind: "select", options: RARITIES, inList: true },
      { key: "itemType", label: "Item type", kind: "text", placeholder: "wondrous item, ring, sword…", inList: true },
      { key: "attunement", label: "Requires attunement", kind: "text", placeholder: "No / Yes / by a cleric" },
      { key: "charges", label: "Charges", kind: "text" },
      { key: "properties", label: "Properties", kind: "textarea" },
      { key: "curse", label: "Curse or hidden property", kind: "textarea", section: "dm" },
    ],
  },
  // Lore ----------------------------------------------------------------------
  {
    key: "lore",
    label: "Lore page",
    plural: "Lore",
    group: "lore",
    tone: "lore",
    icon: "book-open",
    description: "A wiki article: history, myth, cosmology, anything.",
    fields: [{ key: "category", label: "Category", kind: "text", placeholder: "history, myth, cosmology…", inList: true }],
  },
  {
    key: "event",
    label: "Event",
    plural: "Events",
    group: "lore",
    tone: "lore",
    icon: "calendar-clock",
    description: "Something that happened (or will happen) at a point in time.",
    extension: "event",
    fields: [],
  },
  {
    key: "rumour",
    label: "Rumour",
    plural: "Rumours",
    group: "lore",
    tone: "lore",
    icon: "message-circle-question",
    description: "What people say, which may or may not be true.",
    extension: "rumour",
    statuses: ["circulating", "fading", "debunked", "confirmed"],
    fields: [],
  },
  // Play ----------------------------------------------------------------------
  {
    key: "quest",
    label: "Quest",
    plural: "Quests",
    group: "play",
    tone: "play",
    icon: "scroll-text",
    description: "A goal with objectives, rewards, and consequences.",
    extension: "quest",
    fields: [],
  },
  {
    key: "world_thread",
    label: "World thread",
    plural: "World threads",
    group: "play",
    tone: "play",
    icon: "spline",
    description: "An ongoing process in the world that moves with or without the party.",
    extension: "thread",
    fields: [],
  },
  {
    key: "mystery",
    label: "Mystery",
    plural: "Mysteries",
    group: "play",
    tone: "play",
    icon: "search-check",
    description: "A question with a hidden truth, discovered through clues.",
    extension: "mystery",
    fields: [],
  },
];

export const ENTITY_TYPE_MAP: Record<string, EntityTypeDef> = Object.fromEntries(ENTITY_TYPES.map((t) => [t.key, t]));

export const BUILTIN_TYPE_KEYS = ENTITY_TYPES.map((t) => t.key);

export const ENTITY_GROUPS: { key: EntityGroup; label: string }[] = [
  { key: "people", label: "People & creatures" },
  { key: "places", label: "Places" },
  { key: "powers", label: "Powers & faiths" },
  { key: "culture", label: "Cultures & languages" },
  { key: "things", label: "Items" },
  { key: "lore", label: "Lore & history" },
  { key: "play", label: "Story" },
];

export const PLACE_TYPES = ENTITY_TYPES.filter((t) => t.isPlace).map((t) => t.key);

export function getEntityType(key: string, custom?: CustomTypeLike[]): EntityTypeDef {
  const builtin = ENTITY_TYPE_MAP[key];
  if (builtin) return builtin;
  const c = custom?.find((t) => t.key === key);
  if (c) {
    return {
      key: c.key,
      label: c.name,
      plural: c.pluralName || `${c.name}s`,
      group: c.isPlace ? "places" : "lore",
      tone: c.isPlace ? "places" : "lore",
      icon: c.icon || "shapes",
      description: c.description || "Custom type",
      isPlace: c.isPlace,
      fields: c.fields,
    };
  }
  return {
    key,
    label: key,
    plural: key,
    group: "lore",
    tone: "lore",
    icon: "shapes",
    description: "Unknown type",
    fields: [],
  };
}

export interface CustomTypeLike {
  key: string;
  name: string;
  pluralName?: string | null;
  icon?: string | null;
  description?: string | null;
  isPlace?: boolean;
  fields: FieldDef[];
}

// ---------------------------------------------------------------------------
// Field value validation
// ---------------------------------------------------------------------------

export const inventoryRowSchema = z.object({
  name: z.string().max(200),
  price: z.string().max(60).optional().default(""),
  qty: z.string().max(30).optional().default(""),
  notes: z.string().max(500).optional().default(""),
});

export const abilitiesSchema = z.object({
  str: z.number().int().min(0).max(40),
  dex: z.number().int().min(0).max(40),
  con: z.number().int().min(0).max(40),
  int: z.number().int().min(0).max(40),
  wis: z.number().int().min(0).max(40),
  cha: z.number().int().min(0).max(40),
});

export type FieldValues = Record<string, unknown>;

function schemaForField(f: FieldDef): z.ZodType {
  switch (f.kind) {
    case "text":
      return z.string().max(500);
    case "textarea":
      return z.string().max(20000);
    case "number":
      return z.number().finite();
    case "select":
      return z.string().max(200);
    case "boolean":
      return z.boolean();
    case "tags":
      return z.array(z.string().max(100)).max(100);
    case "inventory":
      return z.array(inventoryRowSchema).max(500);
    case "abilities":
      return abilitiesSchema;
  }
}

/**
 * Validate and normalise type-specific field values. Unknown keys are dropped,
 * empty strings removed, and numeric strings coerced.
 */
/** One-off fields the DM adds to a single entry, stored under a reserved key in `fields`. */
export const CUSTOM_FIELDS_KEY = "_custom";
export interface CustomField {
  label: string;
  value: string;
  dmOnly: boolean;
}
const customFieldsSchema = z
  .array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().max(2000), dmOnly: z.boolean().default(false) }))
  .max(30);

export function customFieldsOf(fields: FieldValues | null | undefined): CustomField[] {
  const parsed = customFieldsSchema.safeParse(fields?.[CUSTOM_FIELDS_KEY]);
  return parsed.success ? parsed.data.filter((f) => f.value.trim()) : [];
}

export function sanitizeFields(def: EntityTypeDef, input: FieldValues | null | undefined): FieldValues {
  const out: FieldValues = {};
  if (!input) return out;
  // Normalise row by row so one over-long value can't wipe the others.
  const rawCustom = Array.isArray(input[CUSTOM_FIELDS_KEY]) ? (input[CUSTOM_FIELDS_KEY] as { label?: unknown; value?: unknown; dmOnly?: unknown }[]) : [];
  const custom = rawCustom
    .filter((r) => r && typeof r === "object")
    .map((r) => ({ label: String(r.label ?? "").trim().slice(0, 60), value: String(r.value ?? "").slice(0, 2000), dmOnly: r.dmOnly === true }))
    .filter((r) => r.label && r.value.trim())
    .slice(0, 30);
  if (custom.length) out[CUSTOM_FIELDS_KEY] = custom;
  for (const f of def.fields) {
    let v = input[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (f.kind === "number" && typeof v === "string") {
      const n = Number(v);
      if (Number.isNaN(n)) continue;
      v = n;
    }
    if (f.kind === "tags" && typeof v === "string") {
      v = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    // AI drafts and imports often describe structured fields as text; accept the obvious forms.
    if (typeof v === "string") v = coerceFieldText(f, v);
    const parsed = schemaForField(f).safeParse(v);
    if (parsed.success) out[f.key] = parsed.data;
  }
  return out;
}

/** Best-effort parse of a text value into a structured field (inventory, abilities, yes/no). */
export function coerceFieldText(f: FieldDef, text: string): unknown {
  const t = text.trim();
  switch (f.kind) {
    case "boolean":
      if (/^(yes|true|y|1)$/i.test(t)) return true;
      if (/^(no|false|n|0)$/i.test(t)) return false;
      return t;
    case "inventory":
      return t
        .split(/\s*(?:;|\n)\s*/)
        .map((line) => line.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 100)
        .map((line) => {
          const [name, price] = line.split(/\s+[—–-]\s+|:\s+/, 2);
          return { name: (name ?? line).slice(0, 200), price: (price ?? "").slice(0, 60), qty: "", notes: "" };
        });
    case "abilities": {
      const out: Record<string, number> = {};
      for (const m of t.matchAll(/\b(str|dex|con|int|wis|cha)[a-z]*\s*[:=]?\s*(\d{1,2})/gi)) out[m[1]!.toLowerCase()] = Number(m[2]);
      return ["str", "dex", "con", "int", "wis", "cha"].every((k) => k in out) ? out : t;
    }
    default:
      return text;
  }
}

export function fieldToText(f: FieldDef, v: unknown): string {
  if (v === undefined || v === null) return "";
  switch (f.kind) {
    case "tags":
      return Array.isArray(v) ? v.join(", ") : String(v);
    case "inventory":
      return Array.isArray(v)
        ? v.map((r: { name: string; price?: string; qty?: string }) => [r.name, r.price, r.qty].filter(Boolean).join(" · ")).join("; ")
        : "";
    case "abilities": {
      const a = v as Record<string, number>;
      return ["str", "dex", "con", "int", "wis", "cha"].map((k) => `${k.toUpperCase()} ${a[k] ?? "-"}`).join(", ");
    }
    case "boolean":
      return v ? "Yes" : "No";
    default:
      return String(v);
  }
}
