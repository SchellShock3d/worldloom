/**
 * Offline world pitches and draft sections, used when no AI model is connected. Template-based,
 * but tuned by the seed, the vibe dials and earlier sections so the result hangs together.
 */
import { Rng, hashSeed } from "./rng";
import { CORE_CLASSES, CORE_RACES, defaultClassPrevalence, defaultRacePrevalence, suggestHomebrew, prevalenceWeight, type Prevalence } from "@/lib/peoples";
import type { Dials } from "@/lib/spark";
import type { DraftSections, SectionData, SectionKey, WorldPitch } from "@/lib/spark-schema";
import type { PitchRequest, SectionRequest } from "../tasks/spark";

interface Archetype {
  names: string[];
  logline: string;
  pitch: string;
  genre: string;
  tone: string;
  magicLevel: string;
  techLevel: string;
  conflict: string;
  hook: string;
  peoples: string;
  touchstones: string;
  /** Where this archetype sits on the dials (tone, realism, novelty, scale). */
  vibe: [number, number, number, number];
}

const ARCHETYPES: Archetype[] = [
  {
    names: ["The Sundered Crown", "Vael Ascendant", "The Ninefold Throne"],
    logline: "An empire died twenty years ago, and its heirs are still fighting over the corpse.",
    pitch: "The Ninefold Empire fell when its last emperor vanished from a locked throne room. Seven successor kingdoms now claim his crown, and each has a piece of the regalia that once bound the empire's magic.\n\nThe old roads still run between them, patrolled by legions who no longer know whom they serve. Somewhere, the missing pieces of the crown are waking up.",
    genre: "High fantasy",
    tone: "Political intrigue",
    magicLevel: "Moderate",
    techLevel: "Medieval",
    conflict: "Successor kingdoms race to reassemble the imperial regalia before anyone else can claim the throne.",
    hook: "The crown chooses its wearer, and it has opinions.",
    peoples: "Humans hold most thrones; dwarven bankers fund every side; a homebrew order of crown-wardens guards what's left.",
    touchstones: "The fall of Rome, the Wars of the Roses, Game of Thrones",
    vibe: [0, -1, -1, 2],
  },
  {
    names: ["Brassmoor", "The Coalbright Leagues", "Smokehaven"],
    logline: "Free cities run on aether engines while the old guild-mages lose their grip.",
    pitch: "In the Coalbright Leagues, every street lamp burns aether pumped from wells beneath the cities. Engineers are the new nobility, and the mage-guilds that once ruled are reduced to licensing hedge spells.\n\nBut the wells are running dry, the smog is getting thicker, and something down in the deepest well has started knocking back.",
    genre: "Steampunk",
    tone: "Gritty with stubborn hope",
    magicLevel: "High",
    techLevel: "Industrial",
    conflict: "The guilds, the engineers and the city councils fight over the last aether wells.",
    hook: "The world's power source might be alive.",
    peoples: "Gnomes and humans run the factories; clockwork folk are demanding rights; artificers are everywhere.",
    touchstones: "Arcane, Dishonored, Victorian London",
    vibe: [0, 0, 1, 0],
  },
  {
    names: ["The Drowned Isles", "Saltreach", "The Thousand Tides"],
    logline: "A sunken continent is rising, and every crown with a ship wants a piece of it.",
    pitch: "For three hundred years the Drowned Continent lay beneath the Sapphire Sea. Now, island by island, it's surfacing: temples crusted with coral, cities full of the old dead, and treasure that should have stayed lost.\n\nTrading companies, pirate princes and sea-cults all race to claim the new land. The tide keeps rising, and nobody is asking why.",
    genre: "Nautical fantasy",
    tone: "Swashbuckling",
    magicLevel: "High",
    techLevel: "Age of sail",
    conflict: "Rival trading companies fight over the newly risen islands.",
    hook: "The map changes every month.",
    peoples: "Humans and halflings crew the ships; tidekin pilots guide them; corsairs are a respected profession.",
    touchstones: "Earthsea, Pirates of the Caribbean, the age of exploration",
    vibe: [-1, 1, 0, 1],
  },
  {
    names: ["Ashgrave", "The Hollow Vigil", "Duskmarch"],
    logline: "The gods went silent a century ago, and the dead stopped staying buried.",
    pitch: "In the Duskmarch, every village keeps a bell-tower and a watch over its graveyard. Since the gods fell silent, the dead return on moonless nights, and only the old rites keep them down.\n\nThe church insists the gods are merely testing their faithful. The witch hunters know better, and so do the things that walk out of the fog.",
    genre: "Gothic horror",
    tone: "Grim and dreadful",
    magicLevel: "Low",
    techLevel: "Renaissance",
    conflict: "A failing church and the witch hunters fight over who protects the living, while something hunts both.",
    hook: "Faith still works, but no one knows who's answering.",
    peoples: "Mostly humans; dhampirs walk among them in secret; witch hunters are licensed by the church.",
    touchstones: "Bloodborne, Ravenloft-style gothic, Crimson Peak",
    vibe: [2, -1, 0, -1],
  },
  {
    names: ["The Wildmark", "Thornfall", "The Last Frontier"],
    logline: "A frontier of ancient forest swallows every expedition, and the settlers keep coming anyway.",
    pitch: "Beyond the Thornwall lies the Wildmark, a forest older than any kingdom. Settlers push in for timber, gold and land; the forest pushes back with beasts, fey bargains and roads that rearrange themselves.\n\nOld treaties with the forest folk are breaking, and the frontier towns must decide whether to burn the woods or learn their rules.",
    genre: "Low fantasy",
    tone: "Gritty survival",
    magicLevel: "Low",
    techLevel: "Medieval",
    conflict: "Settlers and the forest's ancient folk are sliding toward war.",
    hook: "The forest itself is a character with its own agenda.",
    peoples: "Human and halfling settlers; wildkin clans; elves who remember the treaties.",
    touchstones: "The Witcher, Princess Mononoke, frontier westerns",
    vibe: [1, -2, -1, -1],
  },
  {
    names: ["Aurenfell", "The Skyreach Archipelago", "Highwind"],
    logline: "Islands float above an endless storm, and falling is the least of anyone's worries.",
    pitch: "The world below was lost to the Storm a thousand years ago. Now civilisation lives on floating isles held aloft by skystone, linked by airships and cable-bridges.\n\nThe skystone is weakening. Islands are sinking into the Storm one by one, and every nation is quietly planning who gets left behind.",
    genre: "Science fantasy",
    tone: "Hopeful adventure",
    magicLevel: "Wild",
    techLevel: "Magitech",
    conflict: "Sinking islands force nations to fight for the stone that keeps them aloft.",
    hook: "Something lives in the Storm, and it remembers the world below.",
    peoples: "Humans, gnomes and goliaths; starborn sky-mystics; planeswalkers who claim the Storm is a door.",
    touchstones: "Final Fantasy, Avatar, Skies of Arcadia",
    vibe: [-2, 2, 2, 1],
  },
];

function pickArchetypes(rng: Rng, dials: Dials, n: number, avoid: string[]) {
  const target = [dials.tone, dials.realism, dials.novelty, dials.scale];
  const avoided = new Set(avoid.map((a) => a.toLowerCase()));
  return ARCHETYPES.map((a) => ({ a, score: a.vibe.reduce((s, v, i) => s + Math.abs(v - target[i]!), 0) + rng.float() * 3 + (a.names.some((x) => avoided.has(x.toLowerCase())) ? 6 : 0) }))
    .sort((x, y) => x.score - y.score)
    .slice(0, n)
    .map((x) => x.a);
}

function toPitch(a: Archetype, rng: Rng, seed: string, avoid: string[]): WorldPitch {
  const avoided = new Set(avoid.map((x) => x.toLowerCase()));
  const name = a.names.find((x) => !avoided.has(x.toLowerCase())) ?? rng.pick(a.names);
  return {
    name,
    logline: a.logline,
    pitch: seed.trim() ? `${a.pitch}\n\nBuilt around your idea: ${seed.trim()}.` : a.pitch,
    genre: a.genre,
    tone: a.tone,
    magicLevel: a.magicLevel,
    techLevel: a.techLevel,
    conflict: a.conflict,
    hook: a.hook,
    peoples: a.peoples,
    touchstones: a.touchstones,
  };
}

export function offlinePitches(req: PitchRequest): WorldPitch[] {
  const rng = new Rng(hashSeed(req.seed, JSON.stringify(req.dials), req.steer ?? "", (req.avoid ?? []).join(","), String(Date.now())));
  if (req.blend?.length) {
    const [a, b] = req.blend;
    return [
      {
        ...a!,
        name: `${a!.name.split(" ").slice(-1)[0]} ${b ? b.name.split(" ").slice(-1)[0] : ""}`.trim(),
        logline: `${a!.logline} ${b ? b.hook : ""}`.trim(),
        pitch: `${a!.pitch}${b ? `\n\n${b.pitch.split("\n\n")[0]}` : ""}`,
        conflict: b ? `${a!.conflict} Meanwhile, ${b.conflict.charAt(0).toLowerCase()}${b.conflict.slice(1)}` : a!.conflict,
        peoples: b ? `${a!.peoples} ${b.peoples}` : a!.peoples,
        touchstones: b ? `${a!.touchstones}, ${b.touchstones}` : a!.touchstones,
      },
    ];
  }
  if (req.like) {
    const like = req.like;
    const tones = ["Darker and more desperate", "Lighter and more adventurous", "Stranger and more magical"];
    return tones.map((t, i) => ({ ...like, name: `${like.name}${["", " Reborn", " Ascendant"][i]}`.trim(), tone: `${t.split(" and ")[0]!.replace(/^./, (c) => c.toUpperCase())}`, logline: `${like.logline} ${["But the cost is rising.", "And the party might just save it.", "And reality itself is starting to bend."][i]}` }));
  }
  return pickArchetypes(rng, req.dials, 3, req.avoid ?? []).map((a) => toPitch(a, rng, req.seed, req.avoid ?? []));
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const REGIONS: { name: string; climate: SectionData["land"]["regions"][number]["climate"]; terrain: string; summary: string; danger: string }[] = [
  { name: "The Greywater Fens", climate: "Swamp", terrain: "Marsh and reed-mazes", summary: "Endless fog over black water, crossed only by stilt-villages and drowned roads.", danger: "Things move beneath the water that the locals refuse to name." },
  { name: "The Ironspine", climate: "Highland", terrain: "Mountains and mines", summary: "A wall of peaks honeycombed with mines, some older than any kingdom.", danger: "The deepest shafts were sealed from the inside." },
  { name: "The Saltwind Coast", climate: "Coastal", terrain: "Cliffs and harbours", summary: "Wind-scoured cliffs and smugglers' harbours where every cove has a story.", danger: "Wreckers light false beacons on stormy nights." },
  { name: "The Ashen Reach", climate: "Arid", terrain: "Ash desert", summary: "A grey desert where an ancient war burned the land to glass.", danger: "The ash storms carry voices." },
  { name: "The Heartvale", climate: "Temperate", terrain: "Farmland and rivers", summary: "Rolling farmland and river towns that feed half the world.", danger: "Bandits, tax-collectors and worse prey on the harvest roads." },
  { name: "The Thornwood", climate: "Temperate", terrain: "Ancient forest", summary: "A forest so old its trees remember being worshipped.", danger: "Paths rearrange themselves for anyone who breaks the old rules." },
  { name: "The Frostmarch", climate: "Subarctic", terrain: "Tundra and pine", summary: "Long winters, longer memories, and clans who settle feuds on the ice.", danger: "Winter-wolves and worse hunt the white months." },
  { name: "The Shattered Sound", climate: "Coastal", terrain: "Islands and reefs", summary: "A maze of islands and reefs where charts are wrong within a year.", danger: "Reefs shift, and the sea-cults decide who passes." },
];
const LANDMASSES = ["Aldmere", "Varenthe", "Calduin", "Seravel", "Osk", "Talamor"];
const LANDMARKS = [
  { name: "The Giant's Stair", summary: "A staircase of basalt columns climbing out of the sea to nowhere." },
  { name: "The Weeping Colossus", summary: "A ruined statue whose eyes run with salt water, older than any record." },
  { name: "The Lantern of Ys", summary: "A lighthouse that has burned for a thousand years without fuel." },
  { name: "The Bone Library", summary: "A monastery built into a dead god's ribcage, full of forbidden books." },
  { name: "The Glass Scar", summary: "A mile-long wound of black glass where a star fell." },
];
const NATION_NAMES = ["The Kingdom of Vael", "The Iron Concord", "The Free Cities of Orm", "The Principality of Lisse", "The Ashen Throne", "The Marrow Republic"];
const GOVERNMENTS = ["Monarchy", "Merchant republic", "Theocracy", "Military junta", "Elective kingship", "League of city-states"];
const FACTIONS = [
  { name: "The Lantern Society", kind: "secret society", goal: "Control what the world remembers", secret: "They burned the archive they claim to protect." },
  { name: "The Ashen Hand", kind: "cult", goal: "Wake what sleeps beneath the world", secret: "Their prophet is already dead and something wears his face." },
  { name: "The Gilded Compact", kind: "merchant company", goal: "Own every trade route", secret: "They fund both sides of every war." },
  { name: "The Grey Wardens", kind: "order", goal: "Guard the old borders", secret: "They've been losing for a decade and hiding it." },
  { name: "The Thorn Court", kind: "noble house", goal: "Put their heir on a throne", secret: "Their heir is a changeling." },
];
const DEITIES = [
  { name: "Auriel", domains: "light, law", summary: "The dawn-judge, patron of courts and oaths." },
  { name: "Morvath", domains: "death, memory", summary: "Keeper of the dead and what they knew." },
  { name: "Selith", domains: "sea, storms", summary: "The drowned mother, fickle and generous." },
  { name: "Kaelor", domains: "forge, war", summary: "The smith of weapons and of peace treaties." },
];
const EVENTS = [
  { title: "The Founding of the First Crown", yearsAgo: 900, summary: "Scattered clans unite under a single crown for the first time." },
  { title: "The Sorcerers' War", yearsAgo: 600, summary: "Mage-kings burn the land, and magic is chained by law afterwards." },
  { title: "The Great Plague", yearsAgo: 300, summary: "A third of the world dies; whole provinces are abandoned." },
  { title: "The Breaking of the Old Treaty", yearsAgo: 120, summary: "The pact between the peoples fails, and old enemies become neighbours again." },
  { title: "The Vanishing", yearsAgo: 20, summary: "A ruler disappears from a locked chamber, and the succession splinters." },
  { title: "The Red Harvest", yearsAgo: 2, summary: "Crops fail across the heartland, and grain becomes worth more than gold." },
];
const TOWNS = ["Stonehaven", "Riverfall", "Cinderport", "Millbrook", "Ravenwick", "Saltmere"];
const TAVERNS = ["The Drowned Lantern", "The Leaking Gasket", "The Crooked Crown", "The Gilded Goose", "The Last Candle"];
const NPC_NAMES = ["Hollis Pell", "Marta Kess", "Brother Ossian", "Wick Brannigan", "Sera Vane", "Old Fenna", "Tobin Marrow", "Pip Hollow"];
const OCCUPATIONS = ["innkeeper", "dockhand", "priest", "smuggler", "blacksmith", "town clerk", "herbalist", "watch captain"];

function racesFor(sections: DraftSections, fallback: string[] = ["Human", "Dwarf", "Halfling"]) {
  const races = sections.peoples?.races ?? [];
  return races.length ? races.map((r) => ({ name: r.name, w: prevalenceWeight(r.prevalence) })) : fallback.map((n, i) => ({ name: n, w: 10 / (i + 1) }));
}

function demographics(rng: Rng, sections: DraftSections) {
  const scored = racesFor(sections)
    .map((r) => ({ ...r, w: r.w * (0.5 + rng.float()) }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 4);
  const total = scored.reduce((t, r) => t + r.w, 0);
  let left = 100;
  const parts = scored.map((r, i) => {
    const pct = i === scored.length - 1 ? Math.max(1, left - 5) : Math.max(2, Math.round((r.w / total) * 95));
    left -= pct;
    return `${r.name} ${pct}%`;
  });
  return `${parts.join(", ")}${left > 0 ? `, other ${left}%` : ""}`;
}

const count = (d: Dials, small: number, medium: number, large: number) => (d.scale <= -1 ? small : d.scale >= 1 ? large : medium);

export function offlineSection<K extends SectionKey>(req: SectionRequest<K>): SectionData[K] {
  const rng = new Rng(hashSeed(req.key, req.pitch.name, JSON.stringify(req.dials), (req.notes ?? []).join("|"), req.mode, String(Date.now())));
  const p = req.pitch;
  const s = req.sections;
  const traits = { genre: p.genre, tone: p.tone, magicLevel: p.magicLevel, techLevel: p.techLevel, text: `${p.pitch} ${p.peoples}` };
  switch (req.key) {
    case "overview":
      return {
        name: p.name,
        logline: p.logline,
        genre: p.genre,
        tone: p.tone,
        magicLevel: p.magicLevel,
        techLevel: p.techLevel,
        overview: `${p.pitch}\n\n${p.hook}`,
        secret: rng.pick(["The ruling dynasty's founder made a bargain that is about to come due.", "The catastrophe everyone blames on the enemy was caused by the heroes of the last age.", "The power everyone depends on is slowly killing the world.", "The gods aren't silent; they're imprisoned, and someone is keeping them that way."]),
        themes: rng.pick(["Power and its price, loyalty, legacy", "Progress and what it destroys, family, freedom", "Faith and doubt, survival, community", "Ambition, exploration, the unknown"]),
        conflict: p.conflict,
        magicSources: rng.sample(["Arcane study", "Divine gifts", "Pacts with patrons", "Bloodlines", "Ancient relics", "Machines and alchemy"], 2),
        magicAttitude: rng.pick(["Respected but rare", "Licensed and regulated", "Feared", "Everyday and accepted"]),
        worldShape: rng.pick(["One great continent", "Several continents", "An archipelago", "A single region"]),
      } as SectionData[K];
    case "land": {
      const masses = rng.sample(LANDMASSES, count(req.dials, 1, 1, 2));
      const regions = rng.sample(REGIONS, count(req.dials, 3, 4, 5)).map((r, i) => ({ ...r, landmass: masses[i % masses.length]! }));
      return {
        landmasses: masses.map((m) => ({ name: m, summary: `The ${rng.pick(["great", "old", "broken", "storm-wracked"])} landmass where most of the story happens.` })),
        regions,
        landmarks: rng.sample(LANDMARKS, count(req.dials, 2, 3, 3)).map((l, i) => ({ ...l, region: regions[i % regions.length]!.name })),
      } as SectionData[K];
    }
    case "peoples": {
      const rp = defaultRacePrevalence(traits);
      const cp = defaultClassPrevalence(traits);
      const regions = s.land?.regions.map((r) => r.name) ?? [];
      const where = () => (regions.length ? `Most live in ${rng.pick(regions)}.` : "Found across the known world.");
      const brew = suggestHomebrew(traits, [], { race: 2, class: 2 });
      return {
        races: [
          ...CORE_RACES.filter((r) => rp[r.name] && rp[r.name] !== "Absent").map((r) => ({ name: r.name, core: true, prevalence: rp[r.name] as Prevalence, place: `${where()} ${r.summary}`, traits: "" })),
          ...brew.filter((b) => b.kind === "race").map((b) => ({ name: b.name, core: false, prevalence: b.prevalence, place: `${b.summary} ${b.reason}`, traits: b.fields.traits ?? "" })),
        ],
        classes: [
          ...CORE_CLASSES.filter((c) => cp[c.name] && cp[c.name] !== "Absent").map((c) => ({ name: c.name, core: true, prevalence: cp[c.name] as Prevalence, place: c.summary, features: "" })),
          ...brew.filter((b) => b.kind === "class").map((b) => ({ name: b.name, core: false, prevalence: b.prevalence, place: `${b.summary} ${b.reason}`, features: [b.fields.role, b.fields.hitDie, b.fields.features].filter(Boolean).join(". ") })),
        ],
      } as SectionData[K];
    }
    case "powers": {
      const regions = s.land?.regions.map((r) => r.name) ?? ["the heartland"];
      const nations = rng.sample(NATION_NAMES, count(req.dials, 2, 3, 4)).map((n, i) => ({ name: n, region: regions[i % regions.length]!, government: rng.pick(GOVERNMENTS), ruler: rng.pick(["an ageing queen", "a council of merchants", "a child-king and his regent", "a warlord who calls himself protector", "a high priest"]), demographics: demographics(rng, s), summary: `A power in ${regions[i % regions.length]}, ${rng.pick(["proud and overextended", "rich and nervous", "young and hungry", "old and stubborn"])}.` }));
      const factions = rng.sample(FACTIONS, count(req.dials, 3, 4, 5)).map((f) => ({ ...f, base: rng.pick(nations).name, summary: `A ${f.kind} that wants to ${f.goal.charAt(0).toLowerCase()}${f.goal.slice(1)}.` }));
      const deities = rng.sample(DEITIES, 2);
      return {
        nations,
        factions,
        religions: [{ name: `The Faith of ${deities[0]!.name}`, summary: "The largest church, woven into every court.", deities }],
        ties: [
          { from: nations[0]!.name, type: rng.pick(["rival_of", "at_war_with", "allied_with"] as const), to: nations[1]!.name, why: "Old borders and older grudges." },
          { from: factions[0]!.name, type: "controls" as const, to: nations[0]!.region, why: "Their money runs the region." },
          { from: factions[1]!.name, type: "enemy_of" as const, to: factions[0]!.name, why: "They want the same thing." },
        ],
      } as SectionData[K];
    }
    case "history": {
      const actors = [...(s.powers?.factions.map((f) => f.name) ?? []), ...(s.powers?.nations.map((n) => n.name) ?? [])];
      return {
        events: rng.sample(EVENTS, 5).map((e) => ({ ...e, involved: actors.length ? [rng.pick(actors)] : [] })),
        threads: [
          { name: `${actors[0] ?? "A rising power"} moves to seize control`, summary: p.conflict, stakes: "If nobody stops it, the balance of power breaks for a generation.", drivers: actors.slice(0, 1), urgency: 4 },
          { name: "The secret beneath the world stirs", summary: "Signs and omens multiply that something long buried is waking.", stakes: "Whatever it is will not choose sides.", drivers: actors.slice(1, 2), urgency: 2 },
        ],
      } as SectionData[K];
    }
    case "start": {
      const nation = s.powers?.nations[0];
      const town = rng.pick(TOWNS);
      const demo = demographics(rng, s);
      const shares = demo.split(", ").map((x) => x.replace(/ \d+%$/, "")).filter((x) => x !== "other");
      const classes = s.peoples?.classes.map((c) => c.name) ?? ["Fighter", "Rogue"];
      return {
        settlement: { name: town, size: req.dials.scale >= 1 ? "City" : req.dials.scale <= -1 ? "Village" : "Town", within: nation?.name ?? s.land?.regions[0]?.name ?? "", population: req.dials.scale >= 1 ? "24,000" : req.dials.scale <= -1 ? "400" : "3,500", demographics: demo, summary: `A ${rng.pick(["river", "harbour", "crossroads", "frontier"])} town where the world's troubles arrive first.`, features: "A market square, a crumbling shrine, a watch-house that's always short-staffed." },
        tavern: { name: rng.pick(TAVERNS), summary: "The town's favourite tavern, and its best source of gossip.", ambience: "Low beams, pipe smoke, a fire that never quite goes out." },
        npcs: rng.sample(NPC_NAMES, 3).map((n, i) => ({ name: n, race: rng.pick(shares.length ? shares : ["Human"]), className: i === 2 ? rng.pick(classes) : "", occupation: rng.pick(OCCUPATIONS), summary: rng.pick(["Friendly, nosy and terrible at secrets.", "Tired, honest, and starting to ask questions.", "Charming, broke, and owed a favour by everyone."]), want: rng.pick(["To get out of town before it's too late.", "To find out who's been stealing from them.", "To protect someone they love."]), secret: rng.pick(["Works for one of the factions.", "Saw something they shouldn't have.", "Is not who they claim to be."]) })),
        rumours: [
          { claim: "Lights have been seen in the old ruins at night.", truth: "Someone is digging for something there.", accuracy: 80 },
          { claim: "The mayor is in someone's pocket.", truth: "Worse: the mayor is being blackmailed.", accuracy: 50 },
        ],
        hook: `A stranger arrives in ${town} with a sealed letter for the party, and three different people try to take it from them before nightfall.`,
      } as SectionData[K];
    }
  }
  throw new Error(`Unknown section ${req.key}`);
}
