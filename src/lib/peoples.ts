/**
 * Races and classes: the D&D 5e core set, world-fitting homebrew, and how common each is.
 *
 * The core races and classes are those in the 5e System Reference Documents (SRD 5.2 for the
 * 2024 rules, plus half-elf and half-orc from SRD 5.1). The descriptions here are Worldloom's own
 * short summaries. SRD material by Wizards of the Coast LLC is licensed under CC BY 4.0
 * (https://creativecommons.org/licenses/by/4.0/).
 */

export const PREVALENCE = ["Common", "Uncommon", "Rare", "Very rare", "Legendary"] as const;
export type Prevalence = (typeof PREVALENCE)[number];
/** In the world creator, a race or class can also be left out entirely. */
export type PrevalenceChoice = Prevalence | "Absent";
export const PREVALENCE_CHOICES: PrevalenceChoice[] = [...PREVALENCE, "Absent"];
export const PEOPLE_SOURCES = ["D&D 5e core", "Homebrew"] as const;

export interface CoreRace {
  name: string;
  summary: string;
  size: string;
  speed: string;
  lifespan: string;
  traits: string;
  rules: "2024" | "2014";
}

export interface CoreClass {
  name: string;
  summary: string;
  role: string;
  primaryAbility: string;
  hitDie: "d6" | "d8" | "d10" | "d12";
  caster: "none" | "half" | "full" | "pact";
  divine?: boolean;
}

export const CORE_RACES: CoreRace[] = [
  { name: "Human", rules: "2024", size: "Medium or Small", speed: "30 ft.", lifespan: "Under a century", summary: "Short-lived, ambitious and everywhere: the people who build the most and remember the least.", traits: "Resourceful (heroic inspiration after a long rest), skillful (one extra skill), versatile (an extra origin feat)." },
  { name: "Elf", rules: "2024", size: "Medium", speed: "30 ft.", lifespan: "Around 750 years", summary: "Long-lived and fey-touched, carrying memories of an older world and grudges to match.", traits: "Darkvision 60 ft., keen senses, fey ancestry (hard to charm), trance instead of sleep. Lineages: drow, high elf, wood elf." },
  { name: "Dwarf", rules: "2024", size: "Medium", speed: "30 ft.", lifespan: "Around 350 years", summary: "Stubborn, enduring makers who measure time in generations and debts in stone.", traits: "Darkvision 120 ft., dwarven resilience (poison), dwarven toughness (extra hit points), stonecunning (tremorsense on stone)." },
  { name: "Halfling", rules: "2024", size: "Small", speed: "30 ft.", lifespan: "Around 150 years", summary: "Small, cheerful and quietly brave, at home anywhere there is a hearth and a good story.", traits: "Brave, halfling nimbleness, luck (reroll a 1 on a d20), naturally stealthy." },
  { name: "Gnome", rules: "2024", size: "Small", speed: "30 ft.", lifespan: "Around 425 years", summary: "Curious tinkerers and illusionists with a talent for asking the wrong question at the right time.", traits: "Darkvision 60 ft., gnomish cunning (advantage on mental saves). Lineages: forest gnome, rock gnome." },
  { name: "Dragonborn", rules: "2024", size: "Medium", speed: "30 ft.", lifespan: "Around 80 years", summary: "Proud people of draconic descent whose ancestry shows in scale, colour and breath.", traits: "Draconic ancestry (breath weapon and damage resistance), darkvision 60 ft., later brief spectral wings." },
  { name: "Tiefling", rules: "2024", size: "Medium or Small", speed: "30 ft.", lifespan: "Similar to humans", summary: "Mortals marked by a fiendish legacy, often judged for a bargain they never made.", traits: "Darkvision 60 ft., fiendish legacy (abyssal, chthonic or infernal: a resistance and innate spells), otherworldly presence." },
  { name: "Orc", rules: "2024", size: "Medium", speed: "30 ft.", lifespan: "Around 80 years", summary: "Tough, driven people with deep loyalties and a reputation others have rarely earned the right to give them.", traits: "Adrenaline rush, darkvision 120 ft., relentless endurance (drop to 1 hit point instead of 0 once per long rest)." },
  { name: "Goliath", rules: "2024", size: "Medium", speed: "35 ft.", lifespan: "Similar to humans", summary: "Towering folk descended from giants, who prize fair contests and hard-won peaks.", traits: "Giant ancestry (cloud, fire, frost, hill, stone or storm boon), large form at higher levels, powerful build." },
  { name: "Half-Elf", rules: "2014", size: "Medium", speed: "30 ft.", lifespan: "Around 180 years", summary: "Of two peoples and fully claimed by neither, often the ones who carry messages between them.", traits: "Darkvision 60 ft., fey ancestry, skill versatility. (2014 rules.)" },
  { name: "Half-Orc", rules: "2014", size: "Medium", speed: "30 ft.", lifespan: "Around 75 years", summary: "Strong and quick to prove it, living in the gap between orcish and human expectations.", traits: "Darkvision 60 ft., menacing, relentless endurance, savage attacks. (2014 rules.)" },
];

export const CORE_CLASSES: CoreClass[] = [
  { name: "Barbarian", hitDie: "d12", primaryAbility: "Strength", role: "Front-line warrior", caster: "none", summary: "Warriors who draw on primal rage, at home far from cities and laws." },
  { name: "Bard", hitDie: "d8", primaryAbility: "Charisma", role: "Support caster, face", caster: "full", summary: "Performers whose words and music carry real magic." },
  { name: "Cleric", hitDie: "d8", primaryAbility: "Wisdom", role: "Divine caster, healer", caster: "full", divine: true, summary: "Agents of a god or divine ideal, granted power to heal, protect and smite." },
  { name: "Druid", hitDie: "d8", primaryAbility: "Wisdom", role: "Nature caster, shapeshifter", caster: "full", summary: "Keepers of the old ways who speak for the wild and take its shapes." },
  { name: "Fighter", hitDie: "d10", primaryAbility: "Strength or Dexterity", role: "Versatile warrior", caster: "none", summary: "Trained soldiers, duellists and guards: the most common sword-arm in any world." },
  { name: "Monk", hitDie: "d8", primaryAbility: "Dexterity and Wisdom", role: "Mobile striker", caster: "none", summary: "Disciplined martial artists who turn inner focus into speed and impossible blows." },
  { name: "Paladin", hitDie: "d10", primaryAbility: "Strength and Charisma", role: "Holy warrior", caster: "half", divine: true, summary: "Warriors bound by an oath, whose conviction becomes power." },
  { name: "Ranger", hitDie: "d10", primaryAbility: "Dexterity and Wisdom", role: "Scout, hunter", caster: "half", summary: "Wardens of the borderlands who track, hunt and guide." },
  { name: "Rogue", hitDie: "d8", primaryAbility: "Dexterity", role: "Skill expert, striker", caster: "none", summary: "Thieves, spies and specialists who win by precision rather than force." },
  { name: "Sorcerer", hitDie: "d6", primaryAbility: "Charisma", role: "Innate arcane caster", caster: "full", summary: "People born with magic in the blood, for better or worse." },
  { name: "Warlock", hitDie: "d8", primaryAbility: "Charisma", role: "Pact caster", caster: "pact", summary: "Bargainers who traded something for power from an otherworldly patron." },
  { name: "Wizard", hitDie: "d6", primaryAbility: "Intelligence", role: "Scholarly arcane caster", caster: "full", summary: "Scholars who learned magic from books, masters and long, dangerous study." },
];

// ---------------------------------------------------------------------------
// Defaults: how common each core race and class is, given the world's settings
// ---------------------------------------------------------------------------

export interface WorldTraits {
  genre?: string;
  tone?: string;
  magicLevel?: string;
  techLevel?: string;
  /** Free text from the creator (themes, regions, description) used for keyword hints. */
  text?: string;
}

const STEP: Prevalence[] = [...PREVALENCE];
const shift = (p: Prevalence, by: number): Prevalence => STEP[Math.max(0, Math.min(STEP.length - 1, STEP.indexOf(p) + by))]!;

const has = (s: string | undefined, re: RegExp) => !!s && re.test(s);
const isIndustrial = (t: WorldTraits) => has(t.techLevel, /industrial|steam|magitech|modern|futur/i) || has(t.genre, /steampunk|gaslamp|science/i);
const hasFirearms = (t: WorldTraits) => isIndustrial(t) || has(t.techLevel, /renaissance|sail/i);
const isHighMagic = (t: WorldTraits) => has(t.magicLevel, /high|wild|mythic/i);
const isLowMagic = (t: WorldTraits) => has(t.magicLevel, /none|low/i);
const isDark = (t: WorldTraits) => has(t.genre, /dark|horror|gothic|grim/i) || has(t.tone, /grim|dark|horror|dread/i);
const isNautical = (t: WorldTraits) => has(t.genre, /nautical|pirate|sea/i) || has(t.techLevel, /sail/i) || has(t.text, /\b(seas?|oceans?|islands?|archipelago|pirates?|seafar\w*)\b/i);
const isMythic = (t: WorldTraits) => has(t.genre, /mythic|ancient/i) || has(t.techLevel, /bronze|stone/i);
const isLowFantasy = (t: WorldTraits) => has(t.genre, /low fantasy|sword|historical/i);
const isFuture = (t: WorldTraits) => has(t.techLevel, /futur|modern/i) || has(t.genre, /science/i);
const isApocalypse = (t: WorldTraits) => has(t.genre, /apocalyp/i) || has(t.text, /\b(cataclysm|wasteland|apocalypse)\b/i);

export function defaultRacePrevalence(t: WorldTraits): Record<string, PrevalenceChoice> {
  const p: Record<string, Prevalence> = { Human: "Common", Elf: "Common", Dwarf: "Common", Halfling: "Common", Gnome: "Uncommon", Dragonborn: "Uncommon", Tiefling: "Uncommon", Orc: "Uncommon", Goliath: "Rare", "Half-Elf": "Uncommon", "Half-Orc": "Uncommon" };
  if (isLowFantasy(t)) for (const k of Object.keys(p)) if (k !== "Human") p[k] = shift(p[k]!, 1);
  if (isDark(t)) Object.assign(p, { Elf: "Rare", Gnome: "Rare", Tiefling: "Uncommon", Dragonborn: "Very rare" });
  if (isIndustrial(t)) Object.assign(p, { Gnome: "Common", Dwarf: "Common", Elf: "Uncommon" });
  if (isNautical(t)) Object.assign(p, { Halfling: "Common", Dwarf: "Uncommon", Elf: "Uncommon", Orc: "Uncommon" });
  if (isMythic(t)) Object.assign(p, { Goliath: "Uncommon", Dragonborn: "Uncommon", Halfling: "Rare", Gnome: "Rare" });
  if (isLowMagic(t)) Object.assign(p, { Tiefling: shift(p.Tiefling!, 1), Dragonborn: shift(p.Dragonborn!, 1) });
  if (isHighMagic(t)) Object.assign(p, { Tiefling: shift(p.Tiefling!, -1), Dragonborn: shift(p.Dragonborn!, -1) });
  return p;
}

export function defaultClassPrevalence(t: WorldTraits): Record<string, PrevalenceChoice> {
  const p: Record<string, Prevalence> = { Barbarian: "Uncommon", Bard: "Uncommon", Cleric: "Common", Druid: "Uncommon", Fighter: "Common", Monk: "Uncommon", Paladin: "Uncommon", Ranger: "Uncommon", Rogue: "Common", Sorcerer: "Rare", Warlock: "Rare", Wizard: "Uncommon" };
  const casters = ["Bard", "Cleric", "Druid", "Sorcerer", "Warlock", "Wizard"];
  if (isLowMagic(t)) for (const c of casters) p[c] = shift(p[c]!, has(t.magicLevel, /none/i) ? 2 : 1);
  if (isHighMagic(t)) for (const c of casters) p[c] = shift(p[c]!, -1);
  if (isLowFantasy(t) || isMythic(t)) p.Barbarian = "Common";
  if (isDark(t)) Object.assign(p, { Warlock: shift(p.Warlock!, -1), Paladin: shift(p.Paladin!, 1) });
  if (isIndustrial(t)) Object.assign(p, { Druid: shift(p.Druid!, 1), Barbarian: shift(p.Barbarian!, 1), Wizard: shift(p.Wizard!, -1) });
  return p;
}

// ---------------------------------------------------------------------------
// Homebrew that fits the world (the offline engine; Claude writes its own when connected)
// ---------------------------------------------------------------------------

export interface PeopleSuggestion {
  kind: "race" | "class";
  name: string;
  summary: string;
  prevalence: Prevalence;
  /** Why it fits this world, in one sentence. */
  reason: string;
  fields: Record<string, string>;
}

interface Rule {
  when: (t: WorldTraits) => boolean;
  make: (t: WorldTraits) => PeopleSuggestion;
}

const RULES: Rule[] = [
  {
    when: isIndustrial,
    make: (t) => ({
      kind: "class",
      name: "Artificer",
      prevalence: has(t.techLevel, /industrial|magitech|modern|futur/i) ? "Common" : "Uncommon",
      summary: "Engineers who bind magic into devices: arc-lamps, clockwork limbs, grenades that sing.",
      reason: "Your world runs on machines, so the people who fuse magic with engineering are everywhere.",
      fields: { role: "Gadgeteer, support caster", primaryAbility: "Intelligence", hitDie: "d8", inWorld: "Valued by guilds and armies; patents are worth killing for.", features: "Infusions (temporary magic in items), a signature device (turret, homunculus or armour), tool expertise." },
    }),
  },
  {
    when: isIndustrial,
    make: () => ({
      kind: "race",
      name: "Clockwork Folk",
      prevalence: "Uncommon",
      summary: "Constructs of brass and spring who woke one day with a spark of a soul.",
      reason: "Industry built them as labourers; some of them started asking questions.",
      fields: { size: "Medium", speed: "30 ft.", lifespan: "Unknown; as long as their parts last", traits: "Do not eat, breathe or sleep (they wind down to rest), resistant to poison, built-in tool.", society: "Legally property in some nations, citizens in others." },
    }),
  },
  {
    when: hasFirearms,
    make: (t) => ({
      kind: "class",
      name: "Gunslinger",
      prevalence: isIndustrial(t) ? "Common" : "Rare",
      summary: "Duellists who trust powder and nerve over steel and spells.",
      reason: "Firearms exist here, and some people have made them an art.",
      fields: { role: "Ranged striker", primaryAbility: "Dexterity", hitDie: "d10", inWorld: "Hired by merchants, feared by duellists' widows.", features: "Grit points for trick shots, quick draw, misfire risk on rolls of 1." },
    }),
  },
  {
    when: isHighMagic,
    make: (t) => ({
      kind: "class",
      name: "Planeswalker",
      prevalence: has(t.magicLevel, /mythic|wild/i) ? "Uncommon" : "Rare",
      summary: "Mages who learned to step between the planes, and rarely come back unchanged.",
      reason: "With magic this strong, the walls between worlds are thin enough for some to cross.",
      fields: { role: "Arcane traveller, utility caster", primaryAbility: "Intelligence or Charisma", hitDie: "d6", inWorld: "Courted by rulers for news from other worlds, distrusted for what they might bring back.", features: "Planar step (short teleport), a planar anchor they must return to, spells drawn from other planes." },
    }),
  },
  {
    when: isHighMagic,
    make: () => ({
      kind: "race",
      name: "Starborn",
      prevalence: "Rare",
      summary: "Mortals descended from beings who crossed over from another plane, with eyes like distant lights.",
      reason: "Strong magic invites visitors, and some of them stayed long enough to have children.",
      fields: { size: "Medium", speed: "30 ft.", lifespan: "Around 200 years", traits: "Darkvision 60 ft., resistance to radiant damage, can shed light at will, innate guiding spell.", society: "Revered as omens in some lands, hunted as invaders in others." },
    }),
  },
  {
    when: (t) => has(t.magicLevel, /wild/i),
    make: () => ({
      kind: "race",
      name: "Spellscarred",
      prevalence: "Uncommon",
      summary: "People reshaped by wild magic: glowing veins, shifting colours, small impossible gifts.",
      reason: "Wild magic leaves marks on those who live near it.",
      fields: { size: "Medium or Small", speed: "30 ft.", lifespan: "Similar to humans", traits: "One random minor magical trait, resistance to force damage, unpredictable surges when badly hurt.", society: "Some are pitied, some worshipped, all watched." },
    }),
  },
  {
    when: isLowMagic,
    make: () => ({
      kind: "class",
      name: "Hedge Witch",
      prevalence: "Uncommon",
      summary: "Village wise-folk who work small, practical magic with herbs, knots and old bargains.",
      reason: "Where great magic is rare, the quiet kind is what people actually rely on.",
      fields: { role: "Healer, ritualist", primaryAbility: "Wisdom", hitDie: "d8", inWorld: "Needed in every village, trusted in few.", features: "Rituals that take time but no spell slots, charms and curses, a familiar." },
    }),
  },
  {
    when: (t) => isDark(t) || has(t.text, /\b(witch|inquisit|heres)/i),
    make: () => ({
      kind: "class",
      name: "Witch Hunter",
      prevalence: "Uncommon",
      summary: "Trained hunters of monsters and the people who make deals with them.",
      reason: "A world this dark needs people whose job is to hunt what hides in it.",
      fields: { role: "Monster hunter, investigator", primaryAbility: "Wisdom and Dexterity", hitDie: "d10", inWorld: "Licensed by the church or the crown; their warrants open any door.", features: "Studied quarry (bonus against a chosen foe), resistance to charm and fear, consecrated weapons." },
    }),
  },
  {
    when: isDark,
    make: () => ({
      kind: "race",
      name: "Dhampir",
      prevalence: "Rare",
      summary: "Children of vampire bloodlines who walk in daylight but never quite belong to it.",
      reason: "In a gothic world, the night's bloodlines leave descendants.",
      fields: { size: "Medium", speed: "35 ft.", lifespan: "Around 300 years", traits: "Darkvision 60 ft., spider climb, a draining bite, unsettling stillness.", society: "Hide what they are, or use it." },
    }),
  },
  {
    when: (t) => has(t.genre, /cosmic|horror/i),
    make: () => ({
      kind: "class",
      name: "Occultist",
      prevalence: "Rare",
      summary: "Scholars of forbidden lore who pay for every truth with a little of their sanity.",
      reason: "Cosmic horror needs people who look too closely.",
      fields: { role: "Investigator, ritual caster", primaryAbility: "Intelligence", hitDie: "d8", inWorld: "Banned from most universities and consulted by all of them.", features: "Forbidden knowledge (learn secrets at a cost), warding sigils, strain that builds as they cast." },
    }),
  },
  {
    when: isNautical,
    make: () => ({
      kind: "race",
      name: "Tidekin",
      prevalence: "Uncommon",
      summary: "Sea-blooded folk with gill-slits and salt-dark eyes, as at home below the waves as on deck.",
      reason: "A world of seas and islands has people born to the water.",
      fields: { size: "Medium", speed: "30 ft., swim 30 ft.", lifespan: "Around 120 years", traits: "Amphibious, darkvision underwater, speak with sea creatures, need to soak in water daily.", society: "Prized as pilots and divers; their coastal clans keep their own law." },
    }),
  },
  {
    when: isNautical,
    make: () => ({
      kind: "class",
      name: "Corsair",
      prevalence: "Common",
      summary: "Sea-raiders and deck duellists who fight best on a rolling ship.",
      reason: "Where the sea is the road, someone always makes a living on it with a blade.",
      fields: { role: "Mobile duellist, skirmisher", primaryAbility: "Dexterity", hitDie: "d10", inWorld: "Privateer, pirate or navy: it depends on whose letter they carry.", features: "Sea legs (advantage on footing), boarding action, a crew who owes them." },
    }),
  },
  {
    when: isMythic,
    make: () => ({
      kind: "race",
      name: "Godblooded",
      prevalence: "Rare",
      summary: "Descendants of gods and mortals, carrying a sliver of their divine parent's nature.",
      reason: "In a mythic age, the gods walk the world and leave heirs behind.",
      fields: { size: "Medium", speed: "30 ft.", lifespan: "Long, if the gods allow it", traits: "A divine gift tied to their parent (storm, sea, war, harvest), resistance to one damage type, a destiny that tends to find them.", society: "Heroes, tyrants and sacrifices, often in that order." },
    }),
  },
  {
    when: (t) => isMythic(t) || has(t.text, /\b(prophec|oracle|fate)/i),
    make: () => ({
      kind: "class",
      name: "Oracle",
      prevalence: "Rare",
      summary: "Seers who glimpse what fate has planned, and pay for it with a curse.",
      reason: "Prophecy runs through this world's stories.",
      fields: { role: "Divination caster", primaryAbility: "Wisdom", hitDie: "d8", inWorld: "Sought by kings, blamed for wars.", features: "Portents (replace a roll with a foretold one), a lifelong oracle's curse, revelations as they level." },
    }),
  },
  {
    when: isFuture,
    make: () => ({
      kind: "race",
      name: "Synth",
      prevalence: "Uncommon",
      summary: "Manufactured people of alloy and grown flesh, unsure whether their memories are their own.",
      reason: "Advanced technology makes artificial people possible.",
      fields: { size: "Medium", speed: "30 ft.", lifespan: "Indefinite with maintenance", traits: "Integrated tool or weapon, resistance to poison, can interface with machines, no need to sleep.", society: "Their rights depend entirely on which flag flies over them." },
    }),
  },
  {
    when: isFuture,
    make: () => ({
      kind: "class",
      name: "Technomancer",
      prevalence: "Uncommon",
      summary: "Casters who treat spells as code and machines as familiars.",
      reason: "Where technology is everywhere, magic learns to run through it.",
      fields: { role: "Hacker, controller", primaryAbility: "Intelligence", hitDie: "d8", inWorld: "Employed by corporations, wanted by most of them too.", features: "Override (control a device), drone familiar, spells that overload systems." },
    }),
  },
  {
    when: isApocalypse,
    make: () => ({
      kind: "race",
      name: "Ashborn",
      prevalence: "Common",
      summary: "Survivors of the cataclysm, changed by what fell: grey-skinned, hardy and strange.",
      reason: "The cataclysm changed the people who lived through it.",
      fields: { size: "Medium", speed: "30 ft.", lifespan: "Around 60 years", traits: "Resistance to necrotic or poison damage, can eat almost anything, a mutation or two.", society: "The majority now, though the old peoples still call them ruined." },
    }),
  },
  {
    when: (t) => isMythic(t) || has(t.text, /\b(spirit|ancestor|animis|shaman)/i),
    make: () => ({
      kind: "class",
      name: "Spirit Caller",
      prevalence: "Uncommon",
      summary: "Speakers for ancestors and spirits of place, who bargain on behalf of the living.",
      reason: "In a world where spirits matter, someone has to talk to them.",
      fields: { role: "Support caster, mediator", primaryAbility: "Wisdom", hitDie: "d8", inWorld: "Every clan has one; every clan argues with theirs.", features: "Spirit allies that change by location, ancestral guidance, taboo that grants power." },
    }),
  },
];

// Always-available fallbacks so every world gets at least a couple of ideas.
const FALLBACK: PeopleSuggestion[] = [
  { kind: "race", name: "Wildkin", prevalence: "Uncommon", summary: "Animal-featured folk from the deep forests, each clan shaped like its totem beast.", reason: "Every fantasy world has wild places, and people shaped by them.", fields: { size: "Medium or Small", speed: "30 ft.", lifespan: "Around 60 years", traits: "Natural weapon (claws, horns or beak), keen smell, an animal sense tied to their clan.", society: "Treaties with the forest clans are older than most kingdoms." } },
  { kind: "class", name: "Runesmith", prevalence: "Uncommon", summary: "Crafters who carve power into weapons, armour and stone.", reason: "A world with ancient ruins and old magic has people who can read and write its runes.", fields: { role: "Crafter, support warrior", primaryAbility: "Intelligence or Constitution", hitDie: "d10", inWorld: "Their marks are on every city gate and royal blade.", features: "Rune inscriptions (temporary magic on gear), runic ward, a master rune at higher levels." } },
];

/** World-fitting homebrew ideas, most relevant first. Excludes names already in the world. */
export function suggestHomebrew(t: WorldTraits, existing: string[] = [], max = { race: 3, class: 3 }): PeopleSuggestion[] {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  const out: PeopleSuggestion[] = [];
  const count = { race: 0, class: 0 };
  for (const s of [...RULES.filter((r) => r.when(t)).map((r) => r.make(t)), ...FALLBACK]) {
    if (taken.has(s.name.toLowerCase()) || count[s.kind] >= max[s.kind]) continue;
    taken.add(s.name.toLowerCase());
    count[s.kind]++;
    out.push(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Demographics: "Human 60%, Dwarf 25%, Halfling 10%"
// ---------------------------------------------------------------------------

export interface DemographicShare {
  name: string;
  percent: number;
}

export function parseDemographics(text: string | null | undefined): DemographicShare[] {
  if (!text) return [];
  const out: DemographicShare[] = [];
  for (const raw of text.split(/[,;\n]+/)) {
    const part = raw.trim().replace(/^and\s+/i, "");
    let name: string | undefined;
    let pct: string | undefined;
    let m = part.match(/^(.+?)\s*[:\-–]?\s*(\d{1,3}(?:\.\d+)?)\s*%?$/); // "Human 60%"
    if (m) [name, pct] = [m[1], m[2]];
    else if ((m = part.match(/^(\d{1,3}(?:\.\d+)?)\s*%\s*(.+)$/))) [name, pct] = [m[2], m[1]]; // "60% human"
    const percent = Number(pct);
    if (name?.trim() && percent > 0 && percent <= 100) out.push({ name: name.trim(), percent });
  }
  return out;
}

/** Match "elves", "Dwarves", "half-orcs" to the singular names races are stored under. */
export function singularPeople(name: string) {
  const n = name.trim().toLowerCase();
  if (n.endsWith("elves")) return n.replace(/elves$/, "elf");
  if (n.endsWith("dwarves")) return n.replace(/dwarves$/, "dwarf");
  if (n.endsWith("folk") || n.endsWith("kin") || n.endsWith("born")) return n;
  if (/(ch|sh|x)es$/.test(n)) return n.slice(0, -2);
  if (n.endsWith("s") && !n.endsWith("ss")) return n.slice(0, -1);
  return n;
}

export function prevalenceWeight(p: string | null | undefined): number {
  switch ((p ?? "").toLowerCase()) {
    case "common":
      return 10;
    case "uncommon":
      return 4;
    case "rare":
      return 1.5;
    case "very rare":
      return 0.5;
    case "legendary":
      return 0.1;
    default:
      return 2;
  }
}
