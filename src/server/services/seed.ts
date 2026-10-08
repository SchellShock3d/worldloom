/**
 * Demo world: "The Shattered Crown". Richly interconnected so every system has
 * something to show: NPC knowledge boundaries, world threads with stages,
 * overdue promises, a mystery with clues, nested maps, sessions with notes,
 * and pending consequences. Only created when a user asks for it.
 */
import { eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { campaigns, worlds, maps, mapMarkers, mapRegions, mapLayers, entityMetrics, randomTables, randomTableEntries, encounters, encounterCombatants, travelPlans, worldThreads } from "@/server/db/schema";
import { toAbsolute, durationToMinutes, DEFAULT_CALENDAR } from "@/lib/calendar";
import { mentionToken } from "@/lib/mentions";
import { createWorld } from "./worlds";
import { createEntity } from "./entities";
import { createRelationship } from "./relationships";
import { createEvent } from "./timeline";
import { createFact } from "./knowledge";
import { createCampaign, setCampaignEntityState } from "./campaigns";
import { createConsequence, createClue, setClueDiscovered, saveNote } from "./play";
import { createSession, updateSession, saveScene, activateScene } from "./sessions";
import { saveFile } from "./files";
import type { Actor } from "./history";
import type { EntityInput } from "@/lib/validation";

export async function createDemoWorld(db: DB, userId: string) {
  const actor: Actor & { userId: string } = { type: "system", userId };
  const cal = DEFAULT_CALENDAR;
  const world = await createWorld(db, actor, {
    name: "The Shattered Crown",
    genre: "High fantasy",
    tone: "Political intrigue with creeping dread",
    magicLevel: "Moderate",
    techLevel: "Medieval",
    description:
      "The Kingdom of Valeria is rotting from the crown down. Prince Edric is dead, King Aldren is failing, and the regent Lord Vael tightens his grip on Highcourt. To the north the Black Hand bleeds the Northroad, a plague creeps toward Riverfall, and in the Ashfall Wastes a cult digs for a relic that should stay buried. Across the sea, the Iron Empire is watching.",
    calendarPreset: "wheel",
    startYear: 1012,
  });
  const W = world.id;
  const now = toAbsolute(cal, { year: 1012, month: 5, day: 14, hour: 18 });
  const days = (n: number) => durationToMinutes(cal, n, "days");
  const years = (n: number) => durationToMinutes(cal, n, "years");
  await db.update(worlds).set({ currentAt: now, settings: { aiCreativity: "balanced", houseRules: "Grounded, morally grey politics. Magic is rare and costly." } }).where(eq(worlds.id, W));

  const id: Record<string, string> = {};
  const mk = async (key: string, input: EntityInput) => {
    const e = await createEntity(db, W, actor, input, { skipMentionResolution: true });
    id[key] = e.id;
    return e.id;
  };
  const L = (key: string, name: string) => mentionToken(name, id[key]!);
  const rel = (a: string, type: string, b: string, description = "", extra: { campaignId?: string; strength?: number } = {}) =>
    createRelationship(db, W, actor, { sourceId: id[a]!, targetId: id[b]!, type, description, campaignId: extra.campaignId ?? null, strength: extra.strength ?? null, visibility: "secret" });

  // --- Geography --------------------------------------------------------
  await mk("aldmere", { type: "continent", name: "Aldmere", summary: "The great continent, from the frozen Marches to the Ashfall Wastes.", visibility: "public", importance: 1, fields: { climate: "Temperate" } });
  await mk("heartlands", { type: "region", name: "The Heartlands", summary: "Rolling farmland and river valleys; the breadbasket of Valeria.", locationId: id.aldmere, visibility: "public", fields: { climate: "Temperate", terrain: "Farmland, rivers" } });
  await mk("marches", { type: "region", name: "The Northern Marches", summary: "Cold, forested borderlands where the Northroad runs to Riverfall.", locationId: id.aldmere, visibility: "public", fields: { climate: "Subarctic", terrain: "Pine forest, hills", dangers: "Wolves, bandits, early snow" } });
  await mk("ashfall", { type: "region", name: "The Ashfall Wastes", summary: "A grey desert where a war of sorcerers burned the land three centuries ago.", locationId: id.aldmere, visibility: "public", fields: { climate: "Arid", terrain: "Ash dunes, glassed stone" } });
  await mk("valeria", { type: "nation", name: "Kingdom of Valeria", summary: "An old kingdom with a dying king and a regent who rules in his name.", locationId: id.heartlands, visibility: "public", importance: 2, status: "in crisis", fields: { government: "Monarchy (regency)", population: "About 2 million" } });
  await mk("empire", { type: "nation", name: "The Iron Empire", summary: "A disciplined, expansionist empire across the Grey Sea.", locationId: id.aldmere, visibility: "public", importance: 1, status: "stable", fields: { government: "Military autocracy" } });
  await mk("highcourt", { type: "settlement", name: "Highcourt", summary: "Capital of Valeria: white walls, gilded domes, and whispers in every corridor.", locationId: id.heartlands, visibility: "public", importance: 2, fields: { size: "Metropolis", population: "120,000", government: "Royal court" } });
  await mk("stonehaven", {
    type: "settlement",
    name: "Stonehaven",
    summary: "A walled river city that feeds half the kingdom — and is running out of grain.",
    locationId: id.heartlands,
    visibility: "public",
    importance: 2,
    status: "troubled",
    fields: { size: "City", population: "18,000", government: "Merchant council", economy: "Grain, river trade, wool", defenses: "Old walls, a city watch stretched thin" },
    body: "Stonehaven straddles the Vell river where the Northroad begins. Its granaries are the largest in Valeria.\n\n:::dm\nThe council is riddled with guild informants. Two councillors are already in the Thieves' Guild's pocket.\n:::",
  });
  await mk("riverfall", { type: "settlement", name: "Riverfall", summary: "A northern timber town at the end of the Northroad, now gripped by sickness.", locationId: id.marches, visibility: "public", importance: 1, status: "troubled", fields: { size: "Town", population: "2,400", climate: "Subarctic" } });
  await mk("northroad", { type: "location", name: "The Northroad", summary: "The only good road between Stonehaven and the north. Merchants pay for guards — or pay the Black Hand.", locationId: id.marches, visibility: "public", importance: 1, fields: { kind: "road" } });
  await mk("greywatch", { type: "location", name: "Fort Greywatch", summary: "An undermanned fortress guarding the midpoint of the Northroad.", locationId: id.marches, visibility: "public", importance: 1, status: "troubled", fields: { kind: "fortress", features: "Two towers, one of them half-collapsed; forty soldiers where there should be two hundred." } });
  await mk("vault", {
    type: "dungeon",
    name: "The Sunken Vault",
    summary: "A buried treasury of the old sorcerer-kings, half-swallowed by ash.",
    locationId: id.ashfall,
    visibility: "secret",
    status: "unexplored",
    fields: { dungeonType: "Vault / tomb", danger: "Deadly", inhabitants: "Ash wraiths, sand-choked constructs" },
    body: ":::dm\nThe Sun Crown lies in the innermost chamber. The cult has the first half of a map to it.\n:::",
  });
  await mk("lantern", {
    type: "tavern",
    name: "The Drowned Lantern",
    summary: "A riverside tavern where bargemen, smugglers and off-duty guards drink side by side.",
    locationId: id.stonehaven,
    visibility: "public",
    status: "open",
    fields: { quality: "Modest", ambience: "Low beams, river damp, a fiddler who only knows sea shanties", rooms: "6 rooms at 5 sp a night", menu: [{ name: "Eel pie", price: "6 cp" }, { name: "River ale", price: "4 cp" }, { name: "Spiced wine", price: "2 sp" }] },
  });
  await mk("marrows", { type: "shop", name: "Marrow & Sons", summary: "The best smithy in Stonehaven, three generations old.", locationId: id.stonehaven, visibility: "public", status: "open", fields: { shopType: "Blacksmith", pricing: "Fair", inventory: [{ name: "Longsword", price: "15 gp" }, { name: "Chain shirt", price: "50 gp" }, { name: "Horseshoes", price: "2 gp" }] } });
  await mk("councilhall", { type: "location", name: "Stonehaven Council Hall", summary: "Where the merchant council argues over grain and taxes.", locationId: id.stonehaven, visibility: "public", fields: { kind: "civic hall" } });

  // --- Powers ----------------------------------------------------------
  await mk("auriel", { type: "deity", name: "Auriel", summary: "Goddess of the dawn, harvest and oaths.", visibility: "public", fields: { domains: ["dawn", "harvest", "oaths"], alignment: "Lawful good", symbol: "A rising sun over wheat" } });
  await mk("ashenking", { type: "deity", name: "The Ashen King", summary: "A sorcerer-king who made himself a god, now bound beneath the Wastes.", visibility: "secret", status: "imprisoned", fields: { domains: ["fire", "tyranny"], trueNature: "Not a god at all: a lich whose phylactery is the Sun Crown." } });
  await mk("dawnfaith", { type: "religion", name: "The Dawn Faith", summary: "Valeria's state church, devoted to Auriel.", visibility: "public", status: "widespread", fields: { tenets: "Keep your oaths. Feed the hungry. Greet the dawn.", practices: "Dawn vigils, harvest blessings" } });
  await mk("blackhand", {
    type: "faction",
    name: "The Black Hand",
    summary: "A brigand company that 'taxes' the Northroad and is growing bolder.",
    visibility: "public",
    importance: 2,
    status: "rising",
    fields: { factionType: "Brigand company", goals: "Control the Northroad and everything that moves along it.", resources: "Sixty blades, informants in Stonehaven", currentPlans: "Take Fort Greywatch while its garrison is weak." },
  });
  await mk("cult", {
    type: "faction",
    name: "The Cult of Ash",
    summary: "Worshippers of the Ashen King who believe the Sun Crown will return him.",
    visibility: "secret",
    importance: 2,
    status: "active",
    fields: { factionType: "Cult", goals: "Recover the Sun Crown and free the Ashen King.", resources: "Zealots, old maps, a sympathiser at court", secrets: "Lord Vael has been funding their expedition." },
  });
  await mk("guild", { type: "faction", name: "The Stonehaven Thieves' Guild", summary: "Smugglers and fences who want a council that answers to them.", locationId: id.stonehaven, visibility: "secret", status: "active", fields: { factionType: "Guild", goals: "Overthrow the Stonehaven council." } });
  await mk("wardens", { type: "faction", name: "The Grey Wardens", summary: "The garrison order of Fort Greywatch, sworn to keep the Northroad open.", locationId: id.greywatch, visibility: "public", status: "weakened", fields: { factionType: "Knightly order", motto: "The road endures." } });

  // --- People ----------------------------------------------------------
  await mk("aldren", { type: "npc", name: "King Aldren", summary: "The ailing king of Valeria, grieving his son and growing weaker by the week.", locationId: id.highcourt, visibility: "public", importance: 2, fields: { species: "Human", occupation: "King", age: "68", personality: "Once formidable, now confused and grief-struck." } });
  await mk("edric", { type: "npc", name: "Prince Edric", summary: "The king's only son, found dead in his chambers two months ago.", locationId: id.highcourt, visibility: "public", status: "dead", importance: 1, fields: { species: "Human", occupation: "Crown prince" } });
  await mk("vael", {
    type: "npc",
    name: "Lord Vael",
    summary: "Chancellor and regent; charming, patient and utterly ruthless.",
    locationId: id.highcourt,
    visibility: "public",
    importance: 2,
    fields: { species: "Human", occupation: "Lord Chancellor & regent", personality: "Gracious in public, glacial in private.", motivations: "Rule Valeria in fact and, soon, in name.", secrets: "Murdered Prince Edric and is slowly poisoning the king." },
    body: "Lord Vael has served three kings and outlived every rival.\n\n:::dm\nVael poisoned Prince Edric with nightshade and blamed the northern rebels. He is funding the Cult of Ash, believing he can control what they unleash.\n:::",
  });
  await mk("varo", { type: "npc", name: "Captain Varo", summary: "Captain of the Highcourt guard: honest, tired, and starting to ask questions.", locationId: id.highcourt, visibility: "public", importance: 1, fields: { species: "Human", occupation: "Captain of the guard", personality: "Dutiful and blunt.", motivations: "Find the truth about the prince's death." } });
  await mk("marr", {
    type: "npc",
    name: "Lady Marr",
    summary: "A noble with a gift for secrets; she knows more about the prince's death than she says.",
    locationId: id.stonehaven,
    visibility: "public",
    importance: 2,
    fields: { species: "Half-elf", occupation: "Noble, spymaster", personality: "Elegant, wry, always three moves ahead.", voice: "Low, amused; never raises her voice.", motivations: "Expose Vael without getting killed.", secrets: "Has Prince Edric's signet ring." },
  });
  await mk("grell", { type: "npc", name: "Grell", aliases: ["the Bandit Captain"], summary: "Black Hand captain who ran the Northroad ambushes.", locationId: id.northroad, visibility: "public", fields: { species: "Half-orc", occupation: "Bandit captain" } });
  await mk("mara", { type: "npc", name: "Mara Thorne", summary: "Grell's lieutenant: smarter than him, and now unchecked.", locationId: id.northroad, visibility: "secret", importance: 1, fields: { species: "Human", occupation: "Bandit lieutenant", motivations: "Take Grell's place and prove the Black Hand can hold a fortress." } });
  await mk("ossian", { type: "npc", name: "Brother Ossian", summary: "High priest of the Cult of Ash, soft-spoken and certain.", locationId: id.ashfall, visibility: "secret", importance: 1, fields: { species: "Human", occupation: "Cult high priest" } });
  await mk("wenna", { type: "npc", name: "Sister Wenna", summary: "A Dawn Faith healer in Stonehaven, desperate to get medicine to Riverfall.", locationId: id.stonehaven, visibility: "public", fields: { species: "Halfling", occupation: "Priestess and healer" } });
  await mk("tobin", { type: "npc", name: "Tobin Marrow", summary: "Master smith of Marrow & Sons; gruff, fair, and hears everything.", locationId: id.marrows, visibility: "public", fields: { species: "Dwarf", occupation: "Blacksmith" } });
  await mk("hollis", { type: "npc", name: "Hollis Pell", summary: "Keeper of the Drowned Lantern, collector of gossip.", locationId: id.lantern, visibility: "public", fields: { species: "Human", occupation: "Innkeeper", personality: "Friendly, nosy, terrible at keeping secrets." } });
  await mk("fenna", { type: "npc", name: "Old Fenna", summary: "Riverfall's herbalist, the only one treating the sick.", locationId: id.riverfall, visibility: "public", fields: { species: "Human", occupation: "Herbalist" } });

  // --- Things & creatures ---------------------------------------------------
  await mk("suncrown", {
    type: "magic_item",
    name: "The Sun Crown",
    summary: "A crown of red gold said to hold the dawn itself.",
    locationId: id.vault,
    visibility: "secret",
    importance: 2,
    fields: { rarity: "Artifact", itemType: "Wondrous item (crown)", attunement: "Yes, by a creature of royal blood", curse: "It is the Ashen King's phylactery. Wearing it lets him whisper." },
  });
  await mk("signet", { type: "item", name: "Prince Edric's Signet", summary: "The prince's ring, missing since his death.", visibility: "secret", fields: { category: "Quest item", value: "Priceless as evidence" } });
  await mk("wraith", { type: "creature", name: "Ash Wraith", summary: "A choking shade of cinders that haunts the Wastes.", locationId: id.ashfall, visibility: "secret", fields: { size: "Medium", creatureType: "undead", challenge: "3", armorClass: 13, hitPoints: "45 (10d8)", speed: "0 ft., fly 40 ft. (hover)", abilities: { str: 6, dex: 16, con: 14, int: 10, wis: 12, cha: 14 }, traits: "Ash Body. Can move through spaces as narrow as 1 inch.", actions: "Smothering Touch. +5 to hit, 2d8 + 3 necrotic; target can't speak until the end of its next turn." } });
  await mk("cutthroat", { type: "creature", name: "Black Hand Cutthroat", summary: "A Northroad brigand: cheap blade, expensive grudges.", visibility: "public", fields: { size: "Medium", creatureType: "humanoid", challenge: "1/2", armorClass: 13, hitPoints: "16 (3d8 + 3)", speed: "30 ft.", abilities: { str: 12, dex: 14, con: 12, int: 10, wis: 10, cha: 10 }, actions: "Shortsword. +4 to hit, 1d6 + 2 piercing." } });

  // --- Lore -------------------------------------------------------------
  await mk("overview", {
    type: "lore",
    name: "The Shattered Crown: an overview",
    summary: "How Valeria came to the brink.",
    visibility: "public",
    importance: 2,
    fields: { category: "Overview" },
    body: `Three centuries after the War of Ash, ${L("valeria", "Valeria")} believes itself safe. It is not.\n\n## The court\n${L("aldren", "King Aldren")} has not been himself since ${L("edric", "Prince Edric")} died. ${L("vael", "Lord Vael")} governs as regent from ${L("highcourt", "Highcourt")}.\n\n## The north\n${L("blackhand", "The Black Hand")} raids ${L("northroad", "the Northroad")} while sickness spreads toward ${L("riverfall", "Riverfall")}.\n\n:::dm\nThe heart of the campaign: Vael murdered the prince and is bankrolling the Cult of Ash. If the cult recovers the Sun Crown, the Ashen King returns.\n:::`,
  });

  // --- Relationships -------------------------------------------------------
  await rel("aldren", "rules", "valeria");
  await rel("aldren", "parent_of", "edric");
  await rel("vael", "serves", "aldren", "Publicly loyal; privately the hand on the knife.");
  await rel("vael", "hates", "marr", "He suspects she knows.", { strength: 4 });
  await rel("varo", "serves", "aldren");
  await rel("marr", "rival_of", "vael");
  await rel("grell", "member_of", "blackhand");
  await rel("mara", "member_of", "blackhand");
  await rel("ossian", "leads", "cult");
  await rel("cult", "worships", "ashenking");
  await rel("auriel", "worshipped_by", "dawnfaith");
  await rel("wenna", "member_of", "dawnfaith");
  await rel("tobin", "owns", "marrows");
  await rel("hollis", "owns", "lantern");
  await rel("blackhand", "controls", "northroad", "Collects tolls by blade.");
  await rel("blackhand", "enemy_of", "wardens");
  await rel("empire", "rival_of", "valeria");
  await rel("cult", "seeks", "suncrown");
  await rel("vael", "employs", "cult", "Secret funding for the expedition.");
  await rel("marr", "possesses", "signet");
  await rel("wraith", "inhabits", "ashfall");
  await rel("guild", "enemy_of", "councilhall");

  // --- World threads -------------------------------------------------------
  const thread = async (key: string, name: string, summary: string, t: { status: "active" | "escalating" | "dormant"; progress: number; urgency: number; momentum: number; goals: string; nextMilestone?: string; nextMilestoneAt?: number | null; outcomes: string; stages: string[] }, drivers: string[], threatens: string[]) => {
    await mk(key, {
      type: "world_thread",
      name,
      summary,
      visibility: "secret",
      importance: 2,
      thread: { status: t.status, progress: t.progress, urgency: t.urgency, momentum: t.momentum, goals: t.goals, nextMilestone: t.nextMilestone ?? "", nextMilestoneAt: t.nextMilestoneAt ?? null, possibleOutcomes: t.outcomes, triggers: "", startAt: now - days(60), stageIndex: Math.min(t.stages.length - 1, Math.floor((t.progress / 100) * t.stages.length)), stages: t.stages.map((s) => ({ title: s, description: "" })) },
    });
    for (const d of drivers) await rel(d, "drives", key);
    for (const x of threatens) await rel(key, "threatens", x);
  };
  await thread("t-empire", "The Iron Empire prepares to invade Valeria", "Imperial spies, border probes, and a fleet gathering across the Grey Sea.", { status: "active", progress: 32, urgency: 4, momentum: 6, goals: "Strike while Valeria is leaderless.", outcomes: "Invasion in spring; or a treaty bought with northern land.", stages: ["Spies at court", "Border skirmishes", "The fleet gathers", "Invasion"] }, ["empire"], ["valeria"]);
  await thread("t-cult", "The Cult of Ash searches for the Sun Crown", "The cult is digging in the Wastes with a half-map and royal money.", { status: "active", progress: 55, urgency: 4, momentum: 12, goals: "Recover the Sun Crown and wake the Ashen King.", outcomes: "The cult finds the crown; the party intercepts it; or the Vault's guardians wake.", stages: ["Rumours of the Crown", "The cult finds the map", "Expedition to the Vault", "The Crown awakens"] }, ["cult"], ["vault"]);
  await thread("t-guild", "The Thieves' Guild attempts to overthrow the Stonehaven council", "Bribes, blackmail and a planned riot over grain prices.", { status: "active", progress: 20, urgency: 3, momentum: 6, goals: "A council that answers to the Guild.", outcomes: "A riot topples the council; or the watch cracks down.", stages: ["Buying councillors", "Bread riots", "The council falls"] }, ["guild"], ["stonehaven"]);
  await thread("t-plague", "The plague spreads north", "A wasting fever moving up the Northroad toward Riverfall.", { status: "escalating", progress: 62, urgency: 5, momentum: 10, goals: "(none: it is a sickness)", outcomes: "Riverfall is quarantined; or a cure is found in time.", stages: ["First cases on the river", "Spreading along the road", "Riverfall falls sick", "Quarantine"] }, [], ["riverfall"]);
  await thread("t-blackhand", "The Black Hand tightens its grip on the Northroad", "With fewer soldiers on the road every month, the Black Hand grows bolder.", { status: "active", progress: 48, urgency: 3, momentum: 10, goals: "Seize Fort Greywatch and control the whole road.", nextMilestone: "The Black Hand captures Fort Greywatch", nextMilestoneAt: now + days(8), outcomes: "Greywatch falls; or the Wardens are reinforced.", stages: ["Ambushes", "Tolls", "Siege of Greywatch", "The road belongs to the Hand"] }, ["blackhand"], ["greywatch", "northroad"]);
  await rel("t-blackhand", "involves", "mara");

  // --- History ----------------------------------------------------------
  await createEvent(db, W, actor, { title: "The Founding of Valeria", summary: "The first king unites the Heartlands.", kind: "historical", startAt: now - years(800), precision: "year", locationId: id.heartlands, visibility: "public", origin: "manual" });
  await createEvent(db, W, actor, { title: "The War of Ash", summary: "The sorcerer-kings burn the south; the Ashen King is bound and the Sun Crown sealed in the Vault.", kind: "historical", startAt: now - years(300), endAt: now - years(296), precision: "year", locationId: id.ashfall, involvedIds: [id.ashenking!, id.suncrown!], visibility: "public", origin: "manual", importance: 1 });
  await createEvent(db, W, actor, { title: "Coronation of King Aldren", summary: "", kind: "historical", startAt: now - years(40), precision: "year", locationId: id.highcourt, involvedIds: [id.aldren!], visibility: "public", origin: "manual" });
  const death = await createEvent(db, W, actor, { title: "The death of Prince Edric", summary: "The prince is found dead in his chambers. The court blames northern rebels.", kind: "character", startAt: now - days(62), precision: "day", locationId: id.highcourt, involvedIds: [id.edric!, id.vael!], visibility: "public", origin: "manual", importance: 2 });
  id.death = death.id;
  await createEvent(db, W, actor, { title: "First fever cases on the Vell", summary: "Bargemen fall sick with a wasting fever.", kind: "world", startAt: now - days(40), precision: "day", locationId: id.stonehaven, visibility: "public", origin: "manual" });

  // --- Knowledge: the prince's murder ---------------------------------------
  const truth = await createFact(db, W, actor, { holderId: null, subjectId: id.edric, statement: "Prince Edric was murdered by Lord Vael, who poisoned him with nightshade.", truthStatus: "true", confidence: 100 });
  await createFact(db, W, actor, { holderId: id.varo, subjectId: id.edric, statement: "The prince is dead, and the official story doesn't add up.", truthStatus: "partial", confidence: 70, truthRefId: truth.id });
  await createFact(db, W, actor, { holderId: id.hollis, subjectId: id.edric, statement: "The northern rebels killed the prince.", truthStatus: "false", confidence: 85, truthRefId: truth.id, source: "Gossip from bargemen" });
  await createFact(db, W, actor, { holderId: id.marr, subjectId: id.edric, statement: "Lord Vael killed the prince; the signet ring proves he was in the chamber.", truthStatus: "true", confidence: 95, truthRefId: truth.id });
  await createFact(db, W, actor, { holderId: id.vael, subjectId: id.edric, statement: "I poisoned Edric. Only the ring could ever tie me to it.", truthStatus: "true", confidence: 100, truthRefId: truth.id });
  await createFact(db, W, actor, { holderId: null, subjectId: id.vael, statement: "Lord Vael is secretly funding the Cult of Ash's expedition.", truthStatus: "true", confidence: 100 });
  await createFact(db, W, actor, { holderId: id.mara, subjectId: id.greywatch, statement: "Fort Greywatch's east tower has a collapsed postern no one guards.", truthStatus: "true", confidence: 90 });

  // --- Rumours ---------------------------------------------------------------
  const rumour = async (key: string, title: string, claim: string, truthText: string, accuracy: number, places: string[]) => {
    await mk(key, { type: "rumour", name: title, summary: claim, visibility: "public", status: "circulating", rumour: { claim, truth: truthText, accuracy, distortion: "", originText: "", startedAt: now - days(10) } });
    for (const p of places) await rel(key, "circulates_in", p);
  };
  await rumour("r-rebels", "The rebels killed the prince", "Northern rebels slipped into the palace and murdered Prince Edric.", "Lord Vael did it.", 5, ["highcourt", "stonehaven"]);
  await rumour("r-grain", "Stonehaven's granaries are half empty", "The granaries are half empty and the council is hiding it.", "They're at a third. It's worse.", 70, ["stonehaven"]);
  await rumour("r-ship", "A black ship on the Vell", "A ship with black sails came upriver at night and left before dawn.", "An imperial courier ship meeting a contact.", 60, ["stonehaven", "lantern"]);

  // --- Campaign ----------------------------------------------------------------
  const camp = await createCampaign(db, W, actor, {
    name: "The Crown and the Ash",
    premise: "Hired to clear bandits from the Northroad, the party stumbles into the murder of a prince and a cult's hunt for a buried god.",
    partyName: "The Lantern Company",
    startingLocationId: id.stonehaven,
  });
  const C = camp.id;
  await db
    .update(campaigns)
    .set({ currentAt: now, currentWeather: "Warm evening, storm clouds over the river", partyInventory: "- 214 gp in a shared purse\n- Grell's map of Northroad ambush points\n- Writ of passage from the Grey Wardens\n- 3 healing draughts", partyFunds: "214 gp" })
    .where(eq(campaigns.id, C));
  const pcs: [string, string, string, string, number][] = [
    ["kestra", "Kestra Vance", "Sam", "Rogue", 4],
    ["bram", "Bram Ironside", "Jo", "Fighter", 4],
    ["elowen", "Elowen Larkspur", "Alex", "Cleric of Auriel", 4],
    ["fitch", "Fitch", "Rae", "Wizard", 4],
  ];
  for (const [key, name, player, cls, level] of pcs) {
    await mk(key, { type: "pc", name, campaignId: C, visibility: "public", status: "active", fields: { playerName: player, className: cls, level, hpMax: 28 + level * 2, ac: 14 + (cls === "Fighter" ? 3 : 0), passivePerception: 12, initiativeBonus: cls === "Rogue" ? 4 : 1 } });
  }
  await rel("elowen", "worships", "auriel");

  // Campaign overlay: what happened in THIS campaign.
  await setCampaignEntityState(db, W, C, actor, { entityId: id.grell!, status: "dead", knowledge: "discovered" });
  await setCampaignEntityState(db, W, C, actor, { entityId: id.blackhand!, reputation: -35, attitude: "out for blood", knowledge: "discovered" });
  await setCampaignEntityState(db, W, C, actor, { entityId: id.wardens!, reputation: 25, attitude: "grateful", knowledge: "discovered" });
  await setCampaignEntityState(db, W, C, actor, { entityId: id.marr!, reputation: 15, attitude: "intrigued", knowledge: "discovered" });
  await setCampaignEntityState(db, W, C, actor, { entityId: id.mara!, knowledge: "rumoured" });

  // Quests
  await mk("q-road", { type: "quest", name: "Clear the Northroad", campaignId: C, summary: "The Grey Wardens pay for every bandit captain brought down.", visibility: "public", quest: { status: "active", priority: 2, giverId: id.wardens, rewards: "50 gp per captain; a writ of passage", prerequisites: "", consequences: "", playerKnowledge: "", objectives: [{ text: "Find the bandits' camp", status: "done", hidden: false }, { text: "Defeat Grell", status: "done", hidden: false }, { text: "Report to Fort Greywatch", status: "open", hidden: false }, { text: "Deal with whoever replaces Grell", status: "open", hidden: true }] } });
  await mk("q-prince", { type: "quest", name: "Who killed the prince?", campaignId: C, summary: "Lady Marr hints that the official story of Prince Edric's death is a lie.", visibility: "public", quest: { status: "active", priority: 3, giverId: id.marr, rewards: "Lady Marr's patronage", prerequisites: "", consequences: "Exposing Vael makes the party the most hunted people in Valeria.", playerKnowledge: "The prince died two months ago; Lady Marr doubts the rebels did it.", objectives: [{ text: "Meet Lady Marr again", status: "open", hidden: false }, { text: "Find the prince's missing signet", status: "open", hidden: false }] } });
  await mk("q-medicine", { type: "quest", name: "Medicine for Riverfall", campaignId: C, summary: "Sister Wenna needs a wagon of herbs escorted up the Northroad.", visibility: "public", quest: { status: "available", priority: 2, giverId: id.wenna, rewards: "The Dawn Faith's blessing; 30 gp", prerequisites: "", consequences: "", playerKnowledge: "", objectives: [{ text: "Escort the herb wagon to Riverfall", status: "open", hidden: false }] } });
  await rel("q-road", "involves", "northroad");
  await rel("q-prince", "involves", "vael");
  await rel("q-medicine", "involves", "riverfall");

  // Mystery
  await mk("m-prince", { type: "mystery", name: "The death of Prince Edric", campaignId: C, summary: "Who killed the prince, and why?", visibility: "secret", mystery: { question: "Who killed Prince Edric, and why?", truth: "Lord Vael poisoned him with nightshade to clear his path to the throne, then blamed the rebels.", status: "open" } });
  const clue1 = await createClue(db, W, C, actor, { mysteryId: id["m-prince"], description: "The prince's signet ring was missing from his body.", sourceText: "Captain Varo", sourceEntityId: id.varo, isRedHerring: false });
  await createClue(db, W, C, actor, { mysteryId: id["m-prince"], description: "A vial of nightshade was found in the palace kitchens and quietly destroyed.", locationId: id.highcourt, isRedHerring: false });
  await createClue(db, W, C, actor, { mysteryId: id["m-prince"], description: "Lady Marr has the signet ring, taken from Vael's study.", sourceEntityId: id.marr, isRedHerring: false });
  await createClue(db, W, C, actor, { mysteryId: id["m-prince"], description: "Rebel pamphlets were found near the body.", locationId: id.highcourt, isRedHerring: true });

  // Sessions
  const s1 = await createSession(db, W, C, actor, { title: "The Road North" });
  await updateSession(db, W, C, s1.id, {
    status: "processed",
    startedAt: new Date(Date.now() - 14 * 864e5),
    endedAt: new Date(Date.now() - 14 * 864e5 + 4 * 36e5),
    inWorldStartAt: now - days(16),
    inWorldEndAt: now - days(12),
    notes: `Party hired by ${L("wardens", "The Grey Wardens")} at ${L("greywatch", "Fort Greywatch")}. Tracked ambushes along ${L("northroad", "the Northroad")}. Found the bandit camp.`,
    recap: `The Lantern Company took the Grey Wardens' coin to clear ${L("northroad", "the Northroad")} and tracked the ambushers to a camp in the pines.`,
  });
  await setClueDiscovered(db, W, actor, clue1.id, true, { sessionId: s1.id, knowerIds: [id.kestra!] });
  const s2 = await createSession(db, W, C, actor, { title: "Blood on the Northroad" });
  await updateSession(db, W, C, s2.id, {
    status: "processed",
    startedAt: new Date(Date.now() - 7 * 864e5),
    endedAt: new Date(Date.now() - 7 * 864e5 + 4 * 36e5),
    inWorldStartAt: now - days(10),
    inWorldEndAt: now - days(9),
    notes: `Raided the camp at dawn. Bram killed ${L("grell", "Grell")} in a duel. ${L("mara", "Mara Thorne")} escaped with half the gang.\nFound Grell's map of ambush points.\nBack in ${L("stonehaven", "Stonehaven")}, met ${L("marr", "Lady Marr")} at ${L("lantern", "The Drowned Lantern")}. She promised to contact the party within a week about "the matter of the prince".\n${L("hollis", "Hollis Pell")} told everyone the rebels killed the prince.`,
    recap: `At dawn the company stormed the bandit camp. Bram cut down ${L("grell", "Grell")}, but ${L("mara", "Mara Thorne")} escaped with half the gang. In ${L("stonehaven", "Stonehaven")}, the mysterious ${L("marr", "Lady Marr")} sought them out with an offer, and a promise to send word within the week.`,
  });
  const grellDeath = await createEvent(db, W, actor, { title: "Grell falls on the Northroad", summary: "Bram Ironside kills the Black Hand captain in single combat.", kind: "campaign", startAt: now - days(10), precision: "day", locationId: id.northroad, involvedIds: [id.grell!, id.bram!, id.blackhand!], campaignId: C, sessionId: s2.id, visibility: "discovered", origin: "session" });
  const s3 = await createSession(db, W, C, actor, { title: "Into Stonehaven" });
  await updateSession(db, W, C, s3.id, { prep: `- Has ${L("marr", "Lady Marr")} sent word? (She's late.)\n- Grain prices spiking; mood in the city is ugly.\n- ${L("mara", "Mara Thorne")} is planning something at ${L("greywatch", "Fort Greywatch")}.` });

  // Consequences & promises
  await createConsequence(db, W, C, actor, { kind: "promise", title: "Lady Marr will contact the party about the prince", description: `${L("marr", "Lady Marr")} promised to send word within a week.`, cause: "Session 2", actorId: id.marr, sessionId: s2.id, severity: 3, dueAt: now - days(2) });
  await createConsequence(db, W, C, actor, { kind: "consequence", title: "Mara Thorne takes control of Grell's gang", description: `With ${L("grell", "Grell")} dead, ${L("mara", "Mara Thorne")} consolidates the survivors and wants revenge.`, cause: "The party killed Grell", actorId: id.mara, causeEventId: grellDeath.id, sessionId: s2.id, severity: 3, dueAt: now + days(5) });
  await createConsequence(db, W, C, actor, { kind: "reaction", title: "The Black Hand answers Grell's death", description: `${L("blackhand", "The Black Hand")} hasn't responded to the party killing one of its captains.`, cause: "The party killed Grell", actorId: id.blackhand, sessionId: s2.id, severity: 4 });

  // Scenes for the next session
  const sc1 = await saveScene(db, W, C, { name: "The Drowned Lantern at dusk", sessionId: s3.id, locationId: id.lantern, atTime: now, mood: "Tense, crowded", lighting: "Lamplight and pipe smoke", weather: "Storm brewing over the river", description: `The common room is packed with bargemen arguing about grain. ${L("hollis", "Hollis Pell")} waves the party over: someone left a sealed letter.`, presentIds: [id.hollis!], threadIds: [id["t-guild"]!] });
  await saveScene(db, W, C, { name: "Bread riot at the Council Hall", sessionId: s3.id, locationId: id.councilhall, mood: "Angry", description: "A crowd demands the granaries be opened. Guild agitators work the edges.", threadIds: [id["t-guild"]!] });
  await activateScene(db, C, sc1.id);

  // Metrics
  const metric = async (key: string, label: string, value: number) =>
    db.insert(entityMetrics).values({ worldId: W, entityId: id[key]!, key: label.toLowerCase().replace(/\W+/g, "_"), label, value });
  await metric("blackhand", "Influence", 58);
  await metric("northroad", "Safety", 35);
  await metric("stonehaven", "Food prices", 72);
  await metric("aldren", "Health", 40);
  await metric("wardens", "Strength", 30);
  await metric("cult", "Influence", 45);

  // Travel
  await db.insert(travelPlans).values({ worldId: W, campaignId: C, name: "Stonehaven to Riverfall", originId: id.stonehaven, destinationId: id.riverfall, distance: 72, method: "foot", speedPerDay: 24, estimatedMinutes: days(3), terrain: "Road through pine forest", notes: "Fort Greywatch is the halfway point.", stops: [{ name: "Fort Greywatch", entityId: id.greywatch }] });

  // Encounter
  const [enc] = await db
    .insert(encounters)
    .values({ worldId: W, campaignId: C, name: "Ambush at the Greywatch bend", description: "Mara Thorne's survivors hit the party where the road narrows.", locationId: id.northroad, questId: id["q-road"], rewards: "Mara's orders, 40 gp", status: "ready" })
    .returning();
  const combat = [
    { name: "Mara Thorne", entityId: id.mara, side: "enemy" as const, hpMax: 45, ac: 15, initiativeBonus: 3, stats: { cr: "3" } },
    { name: "Black Hand Cutthroat 1", entityId: id.cutthroat, side: "enemy" as const, hpMax: 16, ac: 13, initiativeBonus: 2, stats: { cr: "1/2" } },
    { name: "Black Hand Cutthroat 2", entityId: id.cutthroat, side: "enemy" as const, hpMax: 16, ac: 13, initiativeBonus: 2, stats: { cr: "1/2" } },
    { name: "Black Hand Cutthroat 3", entityId: id.cutthroat, side: "enemy" as const, hpMax: 16, ac: 13, initiativeBonus: 2, stats: { cr: "1/2" } },
  ];
  for (const [i, c] of combat.entries()) await db.insert(encounterCombatants).values({ ...c, encounterId: enc!.id, hpCurrent: c.hpMax, position: i });
  for (const [i, [key, name]] of pcs.entries()) await db.insert(encounterCombatants).values({ encounterId: enc!.id, entityId: id[key], name, side: "party", hpMax: 36, hpCurrent: 36, ac: name.includes("Bram") ? 17 : 14, initiativeBonus: name.includes("Kestra") ? 4 : 1, position: 10 + i });

  // Region-specific random table
  const [tbl] = await db.insert(randomTables).values({ worldId: W, name: "Northroad travel events", category: "travel", description: "Rolled while travelling the Northroad.", locationId: id.northroad }).returning();
  const events = ["A Black Hand toll post, freshly built", "A merchant wagon burned out, horses gone", "Grey Warden riders pass at speed, heading north", "Refugees from Riverfall, coughing", "Wolf tracks circling the camp", "A hanged man with a black handprint on his chest"];
  await db.insert(randomTableEntries).values(events.map((text, i) => ({ tableId: tbl!.id, text, position: i })));

  await saveNote(db, W, C, userId, { title: "Player hooks", body: `- Kestra owes money to ${L("guild", "the Thieves' Guild")}.\n- Elowen dreams of a burning crown.\n- Bram wants to rejoin ${L("wardens", "the Grey Wardens")}.`, pinned: true });

  await createDemoMaps(db, W, userId, id);
  await db.update(worldThreads).set({ lastAdvancedAt: now }).where(eq(worldThreads.entityId, id["t-plague"]!));
  return { worldId: W, campaignId: C };
}

async function createDemoMaps(db: DB, worldId: string, userId: string, id: Record<string, string>) {
  const world = await saveFile(db, { worldId, ownerId: userId, filename: "aldmere.svg", mimeType: "image/svg+xml", data: Buffer.from(ALDMERE_SVG), kind: "map", trusted: true });
  const [m] = await db
    .insert(maps)
    .values({ worldId, name: "Aldmere", description: "The known world.", entityId: id.aldmere, imageFileId: world.id, width: 1600, height: 1000, scaleDistance: 1200, scaleUnit: "miles" })
    .returning();
  const [layer] = await db.insert(mapLayers).values({ mapId: m!.id, name: "Points of interest", position: 0 }).returning();
  const city = await saveFile(db, { worldId, ownerId: userId, filename: "stonehaven.svg", mimeType: "image/svg+xml", data: Buffer.from(STONEHAVEN_SVG), kind: "map", trusted: true });
  const [cm] = await db
    .insert(maps)
    .values({ worldId, name: "Stonehaven", description: "The river city.", parentMapId: m!.id, entityId: id.stonehaven, imageFileId: city.id, width: 1200, height: 800, scaleDistance: 1.5, scaleUnit: "miles" })
    .returning();
  const marker = (mapId: string, key: string | null, label: string, category: string, x: number, y: number, extra: Partial<typeof mapMarkers.$inferInsert> = {}) =>
    db.insert(mapMarkers).values({ mapId, entityId: key ? id[key] : null, label, category, x, y, layerId: mapId === m!.id ? layer!.id : null, ...extra });
  await marker(m!.id, "highcourt", "Highcourt", "settlement", 0.42, 0.62);
  await marker(m!.id, "stonehaven", "Stonehaven", "settlement", 0.5, 0.45, { childMapId: cm!.id });
  await marker(m!.id, "greywatch", "Fort Greywatch", "landmark", 0.55, 0.3);
  await marker(m!.id, "riverfall", "Riverfall", "settlement", 0.6, 0.15);
  await marker(m!.id, "vault", "The Sunken Vault", "dungeon", 0.3, 0.84, { visibility: "dm_only" });
  await marker(m!.id, null, "Black Hand camp (abandoned)", "encounter", 0.52, 0.36, { description: "Where Grell fell." });
  await marker(m!.id, null, "Imperial landing site?", "secret", 0.82, 0.56, { visibility: "dm_only", description: "Where the black ship has been seen." });
  await marker(cm!.id, "lantern", "The Drowned Lantern", "tavern", 0.36, 0.58);
  await marker(cm!.id, "marrows", "Marrow & Sons", "shop", 0.62, 0.42);
  await marker(cm!.id, "councilhall", "Council Hall", "landmark", 0.5, 0.3);
  await db.insert(mapRegions).values([
    { mapId: m!.id, name: "The Heartlands", entityId: id.heartlands, color: "#5bb3a4", points: [[0.3, 0.38], [0.66, 0.36], [0.7, 0.7], [0.36, 0.76], [0.26, 0.6]] },
    { mapId: m!.id, name: "The Northern Marches", entityId: id.marches, color: "#7aa6d6", points: [[0.36, 0.08], [0.74, 0.06], [0.68, 0.34], [0.32, 0.36]] },
    { mapId: m!.id, name: "The Ashfall Wastes", entityId: id.ashfall, color: "#cdac60", points: [[0.14, 0.72], [0.38, 0.78], [0.42, 0.95], [0.12, 0.94]] },
  ]);
}

const ALDMERE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
<defs><pattern id="w" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M0 20 Q10 14 20 20 T40 20" fill="none" stroke="#2c4157" stroke-width="1.2" opacity=".6"/></pattern></defs>
<rect width="1600" height="1000" fill="#1b2633"/><rect width="1600" height="1000" fill="url(#w)"/>
<path d="M330 70 C520 30 760 40 1010 60 C1160 80 1220 160 1200 260 C1180 330 1250 380 1280 470 C1310 560 1240 650 1130 700 C1060 740 1000 800 900 830 C760 880 700 960 560 960 C420 960 300 980 200 950 C120 920 150 820 210 760 C260 700 240 640 300 600 C360 560 330 480 390 420 C440 370 400 300 360 240 C320 180 250 110 330 70 Z" fill="#2a3530" stroke="#4d5d55" stroke-width="3"/>
<path d="M200 760 C260 720 400 720 560 780 C620 800 680 900 640 960 L200 950 Z" fill="#3b3a30" opacity=".85"/>
<path d="M520 160 L540 130 L560 160 M600 140 L622 105 L644 140 M680 170 L700 138 L720 170 M760 150 L780 118 L800 150 M840 180 L858 150 L876 180" stroke="#8a978f" stroke-width="3" fill="none" stroke-linejoin="round"/>
<path d="M980 120 C900 230 860 330 810 450 C780 520 720 560 690 640 C660 720 640 760 600 830" stroke="#4a7aa0" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M800 450 C840 380 860 330 880 300 C900 240 940 190 960 150" stroke="#c9a85c" stroke-width="3" stroke-dasharray="10 9" fill="none"/>
<path d="M800 450 C760 520 720 580 672 620" stroke="#c9a85c" stroke-width="3" stroke-dasharray="10 9" fill="none"/>
<g fill="#33463c" opacity=".9"><circle cx="900" cy="230" r="8"/><circle cx="930" cy="200" r="9"/><circle cx="960" cy="240" r="7"/><circle cx="870" cy="260" r="9"/><circle cx="990" cy="210" r="8"/><circle cx="1010" cy="250" r="7"/><circle cx="840" cy="220" r="7"/></g>
<g font-family="Georgia, serif" fill="#cfd6d2" opacity=".55" font-size="26" letter-spacing="6"><text x="580" y="250">THE NORTHERN MARCHES</text><text x="560" y="560">THE HEARTLANDS</text><text x="240" y="890">THE ASHFALL WASTES</text></g>
<text x="1330" y="560" font-family="Georgia, serif" font-style="italic" fill="#6f8aa6" font-size="30" opacity=".7">The Grey Sea</text>
</svg>`;

const STONEHAVEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">
<rect width="1200" height="800" fill="#262e2b"/>
<path d="M-20 520 C200 470 380 560 600 520 C820 480 980 380 1220 420 L1220 520 C980 480 820 580 600 610 C380 640 200 560 -20 610 Z" fill="#2e4a63"/>
<path d="M240 160 L960 140 L1010 600 L200 640 Z" fill="none" stroke="#8d9a93" stroke-width="10" stroke-linejoin="round"/>
<g fill="#3a4540" stroke="#55635c" stroke-width="2">
<rect x="300" y="200" width="160" height="110" rx="4"/><rect x="520" y="190" width="170" height="120" rx="4"/><rect x="740" y="200" width="160" height="140" rx="4"/>
<rect x="300" y="350" width="120" height="90" rx="4"/><rect x="470" y="360" width="140" height="80" rx="4"/><rect x="680" y="330" width="120" height="100" rx="4"/>
<rect x="260" y="640" width="120" height="60" rx="4"/><rect x="420" y="650" width="160" height="60" rx="4"/><rect x="640" y="630" width="140" height="70" rx="4"/>
</g>
<path d="M560 520 L640 520" stroke="#a49a7a" stroke-width="18"/>
<circle cx="600" cy="240" r="34" fill="#4a554f" stroke="#c9a85c" stroke-width="3"/>
<text x="520" y="770" font-family="Georgia, serif" font-style="italic" fill="#7e98ad" font-size="26" opacity=".8">River Vell</text>
</svg>`;
