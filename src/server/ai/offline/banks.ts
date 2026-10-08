/** Original content banks for the offline generator. */

export const PERSONALITY = [
  "warm but guarded, slow to trust strangers",
  "relentlessly cheerful, hides worry behind jokes",
  "blunt and impatient, respects competence above all",
  "soft-spoken and observant, misses nothing",
  "proud to a fault, never admits a mistake",
  "curious about everything, asks too many questions",
  "anxious and eager to please",
  "cold and transactional, everything has a price",
  "sentimental, collects small keepsakes",
  "theatrical, turns every story into a performance",
  "pious and earnest, quotes scripture at odd moments",
  "cynical veteran who has seen too much",
];

export const MANNERISMS = [
  "taps two fingers on the table while thinking",
  "never makes eye contact for more than a moment",
  "hums an old work song under their breath",
  "speaks in a whisper, forcing people to lean in",
  "constantly polishes a ring that isn't theirs",
  "laughs a beat too late",
  "punctuates sentences with a sharp nod",
  "counts things aloud: coins, steps, people",
  "chews on a sprig of mint",
  "repeats the last word others say, softly",
];

export const MOTIVATIONS = [
  "pay off a debt to dangerous people",
  "protect a younger sibling from a bad crowd",
  "win back the respect of their guild",
  "find out who burned their family's farm",
  "save enough to leave this place forever",
  "prove an old rival wrong",
  "keep a secret buried, whatever it costs",
  "earn a place in the history books",
  "atone for something done during the war",
  "find a cure for a sick friend",
];

export const FEARS = ["fire", "deep water", "being forgotten", "the dark", "their own temper", "the city watch", "magic they don't understand", "growing old alone", "debt collectors", "the sea"];

export const SECRETS = [
  "informs on their neighbours to a local faction",
  "is not who they claim to be; the real one died years ago",
  "owes a favour to something that isn't human",
  "has been skimming from their employer for years",
  "witnessed a crime and kept quiet out of fear",
  "is secretly in love with a rival's spouse",
  "carries a letter that would ruin an important family",
  "deserted from an army that still hunts deserters",
];

export const OCCUPATIONS = [
  "innkeeper", "blacksmith", "dockhand", "herbalist", "scribe", "caravan guard", "fence", "priest", "farmer", "fisher",
  "tax collector", "minstrel", "stablehand", "apothecary", "ferryman", "rat-catcher", "bookbinder", "tanner", "watch sergeant", "midwife",
];

export const SPECIES = ["human", "human", "human", "dwarf", "elf", "halfling", "half-orc", "gnome", "half-elf", "tiefling"];

export const APPEARANCE = [
  "weathered face, ink-stained fingers",
  "tall and stooped, with a broken nose set badly",
  "round-cheeked, freckled, always slightly flushed",
  "wiry, close-cropped grey hair, a scar through one eyebrow",
  "immaculately dressed, rings on every finger",
  "heavyset, with a booming laugh and a missing tooth",
  "pale, sharp-eyed, wrapped in a too-large coat",
  "sun-browned and broad-shouldered, smells of the sea",
];

export const TAVERN_FIRST = ["Drowned", "Gilded", "Crooked", "Sleeping", "Wandering", "Broken", "Silver", "Laughing", "Copper", "Weeping", "Red", "Last"];
export const TAVERN_SECOND = ["Lantern", "Stag", "Kettle", "Anchor", "Crow", "Barrel", "Wheel", "Hound", "Candle", "Mermaid", "Shield", "Goose"];
export const TAVERN_AMBIENCE = [
  "low beams, smoke-blackened, a fiddler in the corner",
  "crowded and loud, sawdust on the floor, dice on every table",
  "quiet and genteel, polished wood and good wine",
  "half-empty and suspicious; conversations stop when the door opens",
  "a converted chapel, stained glass and long benches",
];
export const MENU_ITEMS = [
  ["Mutton stew and black bread", "4 cp"],
  ["Roast fowl with leeks", "1 sp"],
  ["Pickled eggs", "1 cp"],
  ["House ale", "4 cp"],
  ["Spiced cider", "5 cp"],
  ["River trout, pan-fried", "8 cp"],
  ["Imported wine (bottle)", "10 sp"],
  ["Honey cakes", "2 cp"],
] as const;

export const SHOP_TYPES = ["blacksmith", "alchemist", "general goods", "tailor", "bookseller", "curio dealer", "fletcher", "jeweller", "provisioner"];
export const SHOP_NAMES = ["& Sons", "Sundries", "Emporium", "Workshop", "Goods & Wares", "Trading Post", "Curiosities"];
export const SHOP_INVENTORY: Record<string, [string, string][]> = {
  blacksmith: [["Longsword", "15 gp"], ["Horseshoes (set)", "2 gp"], ["Iron spikes (10)", "1 gp"], ["Chain shirt", "50 gp"], ["Repairs", "varies"]],
  alchemist: [["Healing draught", "50 gp"], ["Alchemist's fire", "50 gp"], ["Antitoxin", "50 gp"], ["Smelling salts", "5 sp"], ["Glow-moss vial", "2 gp"]],
  "general goods": [["Rope (50 ft)", "1 gp"], ["Torches (10)", "1 sp"], ["Rations (5 days)", "2 gp 5 sp"], ["Bedroll", "1 gp"], ["Lantern, hooded", "5 gp"]],
  bookseller: [["Blank journal", "2 gp"], ["Regional map", "5 gp"], ["Bestiary pamphlet", "1 gp"], ["Ink and quill", "1 gp"]],
  "curio dealer": [["Carved bone dice", "5 sp"], ["Music box", "8 gp"], ["Mismatched compass", "3 gp"], ["Mummified hand (probably fake)", "12 gp"]],
};

export const SETTLEMENT_FEATURES = [
  "a market square dominated by an old clock tower",
  "a river crossing guarded by a toll bridge",
  "terraced streets cut into a cliffside",
  "a ring of ancient standing stones at the edge of town",
  "a half-finished cathedral, abandoned mid-construction",
  "a harbour crowded with fishing boats and one strange black ship",
];

export const FACTION_TYPES = ["guild", "cult", "noble house", "mercenary company", "secret society", "merchant consortium", "knightly order"];
export const FACTION_GOALS = [
  "control the trade routes through the region",
  "recover a relic lost a century ago",
  "place their candidate on the council",
  "drive out a rival faction",
  "uncover the truth behind an old massacre",
  "awaken something that should stay asleep",
];

export const DEITY_DOMAINS = ["harvest", "storms", "death", "the forge", "the hunt", "secrets", "the sea", "healing", "war", "travel", "trickery", "the moon"];

export const COMPLICATIONS = [
  "A key witness has vanished overnight.",
  "The local lord has forbidden anyone to leave town.",
  "Someone else is already asking questions about the same thing.",
  "A storm closes the roads for a day.",
  "The reward money has been stolen.",
  "An old ally of the party shows up wanting help.",
];

export const WEATHER: Record<string, Record<string, string[]>> = {
  Temperate: {
    Spring: ["light rain and a cool breeze", "bright and mild, wet ground", "morning fog that burns off by noon", "blustery showers"],
    Summer: ["warm and clear", "hot and humid, storms threatening", "a heavy summer thunderstorm", "pleasant sun, light wind"],
    Autumn: ["crisp and clear", "steady drizzle, falling leaves", "grey overcast, chilly wind", "first frost at dawn"],
    Winter: ["bitter cold, clear skies", "snowfall, ankle-deep", "freezing fog", "sleet and biting wind"],
  },
  Arid: {
    Spring: ["dry heat, dust on the wind", "a rare cool morning"],
    Summer: ["scorching sun, shimmering air", "a sandstorm on the horizon"],
    Autumn: ["hot days, cold nights", "a brief violent rain"],
    Winter: ["mild days, freezing nights", "clear and cold"],
  },
  Arctic: {
    Spring: ["thawing ice, grey skies"],
    Summer: ["cool, endless daylight"],
    Autumn: ["sleet and early dark"],
    Winter: ["howling blizzard", "deathly still cold, aurora overhead"],
  },
  Tropical: {
    Spring: ["humid and warm"],
    Summer: ["monsoon downpour", "oppressive heat"],
    Autumn: ["warm rain each afternoon"],
    Winter: ["dry and pleasant"],
  },
  Coastal: {
    Spring: ["salt wind and showers"],
    Summer: ["sea breeze, bright sun", "squalls rolling in off the water"],
    Autumn: ["gales and high waves"],
    Winter: ["cold rain, grey sea", "fog rolling in from the water"],
  },
};
