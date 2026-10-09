/**
 * Build out: the world creator's draft-and-steer loop, for any entry already in the world.
 * Claude writes a few linked sections around one entry (a town gets districts, powers, places to
 * go, people and trouble); the DM keeps, redoes or steers each one, then adds it all at once.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// What Claude returns for one section
// ---------------------------------------------------------------------------

const link = z.object({
  to: z.string().describe("Exact name of the other entry: the focus, an entry in this build-out, or an existing one"),
  type: z.string().describe("Relationship key, e.g. leads, member_of, rules, controls, works_at, owns, serves, allied_with, rival_of, enemy_of, parent_of, sibling_of, friend_of, worships, guards, inhabits, seeks, related_to"),
  why: z.string().describe("One short sentence"),
});

export const buildEntrySchema = z.object({
  type: z.string().describe("Entry type key, from the types allowed in this section"),
  name: z.string(),
  summary: z.string().describe("One or two sentences"),
  details: z.string().describe("A short paragraph (or a few bullets) of playable detail, markdown. No secrets here."),
  secret: z.string().describe("A DM-only secret or twist, or empty"),
  within: z.string().describe("Exact name of where it is: the focus, another entry in this build-out, or an existing place. Empty if it isn't tied to a place."),
  fields: z.array(z.object({ key: z.string(), value: z.string() })).describe("Type-specific details, using the field keys listed for that type"),
  links: z.array(link),
});
export type BuildEntry = z.infer<typeof buildEntrySchema>;

export const buildSectionSchema = z.object({
  article: z.string().describe("Markdown added to the focus entry's article under this section's heading, or empty"),
  fields: z.array(z.object({ key: z.string(), value: z.string() })).describe("Values for the focus entry's empty fields, or empty"),
  entries: z.array(buildEntrySchema),
  links: z.array(link).describe("Relationships from the focus entry itself to other entries, or empty"),
  rumours: z.array(z.object({ claim: z.string().describe("What people say"), truth: z.string().describe("What's actually true (DM only)") })),
  hooks: z.array(z.string().describe("One line")),
});
export type BuildSectionData = z.infer<typeof buildSectionSchema>;

// ---------------------------------------------------------------------------
// Plans: which sections each kind of entry gets
// ---------------------------------------------------------------------------

export interface BuildSectionDef {
  key: string;
  title: string;
  /** One line for the setup screen. */
  blurb: string;
  /** Shown while Claude writes ("Walking the streets…"). */
  working: string;
  /** What to write. `{name}` is the focus entry's name. */
  task: string;
  /** Entry types this section may create. Empty: it only adds to the focus entry. */
  types: string[];
  /** How many new entries: [essentials, go deep]. */
  count: [number, number];
  /** Sections this one is written from (if they're part of the build). */
  depends: string[];
  nudges: string[];
  rumours?: boolean;
  hooks?: boolean;
}

export interface BuildPlan {
  key: string;
  sections: BuildSectionDef[];
}

const TROUBLE_NUDGES = ["More urgent", "Tie it to a world thread", "Something supernatural", "Make it a mystery", "Lower stakes, more personal"];

const about = (blurb: string, working: string, task: string, nudges: string[]): BuildSectionDef => ({ key: "about", title: "The basics", blurb, working, task, types: [], count: [0, 0], depends: [], nudges });

const trouble = (title: string, blurb: string, types: string[], depends: string[], task: string): BuildSectionDef => ({
  key: "trouble",
  title,
  blurb,
  working: "Stirring up trouble",
  task,
  types,
  count: [1, 2],
  depends,
  nudges: TROUBLE_NUDGES,
  rumours: true,
  hooks: true,
});

export const BUILD_PLANS: Record<string, BuildPlan> = {
  settlement: {
    key: "settlement",
    sections: [
      about("Look and feel, who lives here, how it's run and what it's known for.", "Walking the streets", "Describe {name}: its look, sounds and smells, the peoples who live here and how they get along, how it's governed, what it trades in, and what it's known for across the world.", ["Grittier", "Grander", "Stranger", "Poorer", "Richer", "More magical"]),
      { key: "districts", title: "Districts & sights", blurb: "Neighbourhoods and landmarks, each with its own character.", working: "Mapping the districts", task: "Map out {name}'s districts (type location, with field kind \"district\") and the sights people talk about (type landmark). Each district needs its own character, who you'd find there, and something to do. Landmarks should be places players remember.", types: ["location", "landmark"], count: [2, 4], depends: ["about"], nudges: ["More districts", "A dangerous quarter", "Something underground", "A holy site", "A market"] },
      { key: "power", title: "Who holds power", blurb: "Rulers, councils, guilds, and whoever runs things from the shadows.", working: "Finding out who's in charge", task: "Decide who really runs {name}: the official ruler or council, the guilds, houses or temples with money and influence, and whoever pulls strings from the shadows. Use links (rules, leads, member_of, controls, rival_of, enemy_of, allied_with) to tie them to {name}, to each other, and to existing powers in the world.", types: ["npc", "faction", "organization"], count: [2, 4], depends: ["about"], nudges: ["More corruption", "A power struggle", "Add a criminal underworld", "A religious authority", "Someone new in charge"] },
      { key: "haunts", title: "Where to go", blurb: "Taverns, shops, a temple, and the people who run them.", working: "Opening the doors", task: "Give {name} places the party will visit: a tavern or inn, a couple of shops, a temple or shrine (type location, field kind \"temple\"), and something only this world would have. Give each a distinct proprietor or keeper (an npc linked works_at or owns). Put each within {name} or one of its districts.", types: ["tavern", "shop", "location", "npc"], count: [3, 6], depends: ["about"], nudges: ["A shady fence", "A famous inn", "An odd specialty shop", "Cheaper and rougher", "Somewhere magical"] },
      { key: "people", title: "People to meet", blurb: "Locals with wants, secrets and reasons to talk to the party.", working: "Meeting the locals", task: "Create memorable locals the party could meet: each with a race from this world's peoples, an occupation, a want, a secret, and a mannerism or way of speaking. Tie each to the powers or places of {name} with links, and put them within {name} or one of its districts or establishments.", types: ["npc"], count: [3, 5], depends: ["power"], nudges: ["Quirkier", "More sinister", "Someone who needs help", "A potential ally", "Someone who knows too much"] },
      trouble("Trouble & rumours", "A local problem, rumours with the truth behind them, and adventure hooks.", ["world_thread", "creature", "npc"], ["people"], "Give {name} trouble the party can get pulled into: one local problem that will get worse if nobody acts (a world_thread, with its stakes in details), plus anyone or anything new it needs. Then 3 rumours with the truth behind each, and 3 adventure hooks that use the people and places of {name}."),
    ],
  },
  region: {
    key: "region",
    sections: [
      about("Terrain, climate, who lives here, and what makes it dangerous.", "Surveying the land", "Describe {name}: its terrain and climate through the seasons, what travelling it is like, who lives here and how, what it's rich or poor in, and why people fear or covet it.", ["Harsher", "More beautiful", "Stranger", "More settled", "Wilder"]),
      { key: "settlements", title: "Towns & cities", blurb: "Where people live, from the biggest city to a lonely outpost.", working: "Founding the towns", task: "Create the places where people live in {name}, from its largest town to a remote outpost. Give each a reason to exist here, and fill size, population, demographics (from this world's peoples) and government.", types: ["settlement"], count: [2, 4], depends: ["about"], nudges: ["A bigger city", "More remote", "A town with a dark secret", "A trading hub"] },
      { key: "wilds", title: "Wild places", blurb: "Ruins, wonders and dangerous ground between the towns.", working: "Exploring the wilds", task: "Create the wild places of {name}: ruins, natural wonders, lairs and dungeons worth an expedition. Each needs a reason to go and a reason to be afraid.", types: ["landmark", "dungeon", "location"], count: [2, 4], depends: ["about"], nudges: ["A dungeon", "Ancient ruins", "Something beautiful", "Something cursed"] },
      { key: "powers", title: "Who holds power", blurb: "Lords, factions, and whoever controls the roads and riches.", working: "Finding out who's in charge", task: "Decide who holds power in {name}: lords, factions and whoever controls its roads, mines, rivers or borders. Link them to the places they control or rule, to each other, and to existing powers in the world.", types: ["faction", "npc", "organization"], count: [2, 3], depends: ["settlements"], nudges: ["More conflict", "A rebel movement", "An absent ruler", "Outsiders moving in"] },
      { key: "dangers", title: "Dangers", blurb: "Creatures and hazards that make the journey worth telling.", working: "Releasing the monsters", task: "Create the creatures that make {name} dangerous, suited to its terrain and to this world. Link each to the place it inhabits.", types: ["creature"], count: [1, 3], depends: ["wilds"], nudges: ["Scarier", "Stranger", "Smarter", "Something people worship"] },
      trouble("Trouble & rumours", "A brewing conflict, rumours, and adventure hooks.", ["world_thread", "npc"], ["powers"], "Give {name} trouble the party can get pulled into: one conflict or threat that will grow if nobody acts (a world_thread, with its stakes in details), plus anyone new it needs. Then 3 rumours with the truth behind each, and 3 adventure hooks across the region."),
    ],
  },
  nation: {
    key: "nation",
    sections: [
      about("Government, laws, culture, wealth and military.", "Drafting the laws", "Describe {name}: how it's governed and who can rise in it, its notable laws and customs, what its people value, how it makes its money, how strong its military is, and how it sees its neighbours.", ["More authoritarian", "More decadent", "Poorer", "More pious", "On the brink"]),
      { key: "places", title: "Cities & holdings", blurb: "Its capital, its great cities, and places it can't afford to lose.", working: "Raising the cities", task: "Create {name}'s capital (if it has none yet), its other important cities, and a fortress, mine or holy site it can't afford to lose. Fill size, population, demographics and government for settlements.", types: ["settlement", "landmark"], count: [2, 4], depends: ["about"], nudges: ["A grander capital", "A border fortress", "A city in revolt", "A port"] },
      { key: "court", title: "Rulers & court", blurb: "The ruler, heirs, advisors and rivals for the throne.", working: "Seating the court", task: "Create {name}'s ruler (unless one exists), heirs, advisors and the rivals at court. Link the ruler with rules, and tie the rest to each other (serves, parent_of, sibling_of, rival_of, enemy_of) so the court has tensions a party can step into.", types: ["npc"], count: [2, 4], depends: ["about"], nudges: ["A weak ruler", "A scheming advisor", "A succession crisis", "A beloved heir"] },
      { key: "factions", title: "Factions & houses", blurb: "Noble houses, guilds and rebels, and where it stands with its neighbours.", working: "Gathering the factions", task: "Create the noble houses, guilds, churches or rebels that compete inside {name}, tied to the court with links. In the focus links, set {name}'s stance toward existing nations (allied_with, rival_of, at_war_with) where it matters.", types: ["faction", "organization"], count: [2, 3], depends: ["court"], nudges: ["More rebellion", "A powerful guild", "A secret society", "Foreign agents"] },
      trouble("Trouble & rumours", "A crisis in the making, rumours, and adventure hooks.", ["world_thread", "npc"], ["factions"], "Give {name} a crisis that will come to a head if nobody acts (a world_thread, with its stakes in details), plus anyone new it needs. Then 3 rumours with the truth behind each, and 3 adventure hooks the party could take on in {name}."),
    ],
  },
  faction: {
    key: "faction",
    sections: [
      about("Goals, methods, structure and reputation.", "Reading their charter", "Describe {name}: what it wants, how it works toward it, how it's organised and how people join or rise, what the public thinks of it, and the lines it won't cross (or will).", ["More ruthless", "More idealistic", "More secretive", "More powerful", "Desperate"]),
      { key: "leaders", title: "Leadership", blurb: "Who leads it, and who wants their job.", working: "Finding the leaders", task: "Create {name}'s leader (unless one exists) and their lieutenants or rivals for the top. Link the leader with leads and the rest with member_of or serves, and give them tensions with each other.", types: ["npc"], count: [1, 3], depends: ["about"], nudges: ["A charismatic leader", "A puppet leader", "A coming coup", "Older and wiser"] },
      { key: "members", title: "Agents & members", blurb: "The people who do its work in the world.", working: "Recruiting members", task: "Create {name}'s agents and members the party might meet: a recruiter, an enforcer, a spy or informant, a disillusioned member. Each with a race from this world's peoples, a want and a secret; link them member_of {name} and tie them to the leaders.", types: ["npc"], count: [2, 4], depends: ["leaders"], nudges: ["A double agent", "Someone who wants out", "More dangerous", "A friendly face"] },
      { key: "holdings", title: "Holdings & fronts", blurb: "Headquarters, safehouses and the businesses that hide them.", working: "Finding the safehouses", task: "Create {name}'s headquarters, safehouses and the legitimate fronts that hide them, placed within existing places of the world where possible. Link {name} to each with owns or controls.", types: ["location", "landmark", "shop", "tavern"], count: [1, 3], depends: ["about"], nudges: ["A hidden lair", "A respectable front", "More holdings", "Somewhere abroad"] },
      { key: "ties", title: "Allies & enemies", blurb: "Who they work with, who they're fighting, and who they're using.", working: "Drawing the battle lines", task: "Set {name}'s place among the world's powers. Use the focus links to tie {name} to existing factions, nations, religions and people (allied_with, rival_of, enemy_of, employs, seeks). Create a new rival or patron only if the world is missing one.", types: ["faction", "organization", "npc"], count: [0, 2], depends: ["about"], nudges: ["More enemies", "A surprising ally", "A powerful patron", "A betrayal brewing"] },
      trouble("Schemes", "What they're plotting now, rumours about them, and hooks.", ["world_thread"], ["leaders"], "Create {name}'s current scheme: what it's trying to pull off now and what happens if it succeeds (a world_thread linked from {name} with drives). Then 3 rumours about {name} with the truth behind each, and 3 hooks that put the party in its path."),
    ],
  },
  religion: {
    key: "religion",
    sections: [
      about("Beliefs, rites, holy days, and what it promises its faithful.", "Reading the scriptures", "Describe {name}: what it teaches, what it demands, its rites and holy days, what it promises the faithful in life and after death, how it's organised, and how the rest of the world sees it.", ["Stricter", "Kinder", "Stranger", "More political", "Older"]),
      { key: "divine", title: "The divine", blurb: "The gods, saints or powers it worships.", working: "Naming the gods", task: "Create the gods, saints or powers {name} worships, unless they already exist (then link to them instead). Give each domains and a portfolio, and link each to {name} with worshipped_by.", types: ["deity"], count: [1, 3], depends: ["about"], nudges: ["A darker god", "A forgotten saint", "A rival god", "Gods who walk the world"] },
      { key: "clergy", title: "Clergy & orders", blurb: "Priests, holy orders and the faithful who serve.", working: "Ordaining the clergy", task: "Create {name}'s high priest or leader (unless one exists), a holy order or monastery (an organization), and priests the party might meet, each with a want and a secret. Link them with leads, member_of or serves.", types: ["npc", "organization"], count: [2, 4], depends: ["about"], nudges: ["A militant order", "A corrupt priest", "A living saint", "A heretic"] },
      { key: "places", title: "Holy places", blurb: "Temples, shrines and pilgrimage sites.", working: "Consecrating the shrines", task: "Create {name}'s great temple, a shrine or pilgrimage site, and a holy place that's been lost or defiled. Place them within existing places of the world where possible.", types: ["location", "landmark", "dungeon"], count: [1, 3], depends: ["about"], nudges: ["A lost temple", "A grand cathedral", "A hidden shrine"] },
      { key: "relics", title: "Relics", blurb: "Sacred objects, and who wants them.", working: "Unearthing relics", task: "Create relics sacred to {name}: what each does, where it is now, and who wants it. Put each within a place if it has one.", types: ["magic_item", "item"], count: [1, 2], depends: ["about"], nudges: ["More powerful", "A stolen relic", "A cursed relic"] },
      trouble("Heresies & trouble", "Schisms, heresies, rumours and hooks.", ["faction", "npc", "world_thread"], ["clergy"], "Create the schism, heresy or outside threat troubling {name} (a faction or world_thread), linked to the clergy. Then 3 rumours with the truth behind each, and 3 hooks that draw the party in."),
    ],
  },
  deity: {
    key: "deity",
    sections: [
      about("Domains, symbols, personality, myths, and what they demand.", "Listening to the myths", "Describe {name}: domains, holy symbol, how they appear and act, the myths told about them, what they ask of followers, and what they hate.", ["More fearsome", "More benevolent", "More capricious", "Older", "Diminished"]),
      { key: "worship", title: "Worship", blurb: "The faith or cult that worships them, and its priests.", working: "Gathering the faithful", task: "Create the religion or cult that worships {name} (unless one exists; then link to it), and priests or prophets the party might meet. Link the religion with worshipped_by from {name} in the focus links, and the priests with serves.", types: ["religion", "organization", "npc"], count: [1, 3], depends: ["about"], nudges: ["A secret cult", "A great church", "A single prophet"] },
      { key: "places", title: "Holy places", blurb: "Temples, shrines and places touched by the god.", working: "Consecrating the shrines", task: "Create the temples, shrines and places touched by {name}, within existing places of the world where possible.", types: ["location", "landmark", "dungeon"], count: [1, 3], depends: ["about"], nudges: ["A lost temple", "Where the god walked", "A forbidden site"] },
      { key: "relics", title: "Relics", blurb: "Sacred objects, and who wants them.", working: "Unearthing relics", task: "Create relics of {name}: what each does, where it is now, and who wants it.", types: ["magic_item", "item"], count: [1, 2], depends: ["about"], nudges: ["More powerful", "A stolen relic", "A cursed relic"] },
      { key: "servants", title: "Servants & rivals", blurb: "Divine servants, monsters, and the gods they war with.", working: "Summoning the servants", task: "Create {name}'s divine servants or sacred beasts, and in the focus links set their rivalries with existing gods (rival_of, enemy_of). Create a rival god only if none exists.", types: ["creature", "deity", "npc"], count: [1, 3], depends: ["about"], nudges: ["Something terrifying", "A fallen servant", "A divine war"] },
      trouble("Myths & trouble", "What the god wants now, rumours, and hooks.", ["world_thread", "npc"], ["worship"], "Create what {name} or their followers want right now and what happens if they get it (a world_thread). Then 3 rumours with the truth behind each, and 3 hooks."),
    ],
  },
  person: {
    key: "person",
    sections: [
      about("Background, appearance, personality, voice, wants and fears.", "Getting to know them", "Write {name}'s story: where they come from, the turning points that made them, how they look and carry themselves, how they talk, what they want, what they fear, and how they treat strangers.", ["More sympathetic", "More sinister", "Funnier", "More tragic", "More ambitious"]),
      { key: "circle", title: "Their circle", blurb: "Family, friends, rivals, a mentor or an enemy.", working: "Meeting their people", task: "Create the people in {name}'s life: family, a friend, a rival, a mentor or an enemy. Each with a race from this world's peoples and a clear feeling about {name}; link them to {name} (parent_of, sibling_of, spouse_of, friend_of, rival_of, mentor_of, enemy_of, loves, owes).", types: ["npc"], count: [2, 4], depends: ["about"], nudges: ["More family", "A dangerous enemy", "A lost love", "Someone they owe"] },
      { key: "places", title: "Places & possessions", blurb: "Their home, their haunts, and what they never let go of.", working: "Looking around their home", task: "Create {name}'s home or base, a place they're always found, and a possession they treasure (with owns or possesses links from {name} in the focus links).", types: ["location", "shop", "tavern", "item", "magic_item"], count: [1, 3], depends: ["about"], nudges: ["Something magical", "A secret room", "Somewhere surprising"] },
      trouble("Secrets & schemes", "What they're hiding, what they're planning, and hooks.", ["world_thread", "faction", "npc"], ["circle"], "Decide {name}'s secrets and current scheme (write them in the article inside a :::dm block), tie them to existing factions or threads with focus links where it fits, and create anything new it needs. Then 3 rumours about {name} with the truth behind each, and 3 hooks that bring them into the party's story."),
    ],
  },
  site: {
    key: "site",
    sections: [
      about("History, atmosphere, how to get in, and why anyone would.", "Lighting a torch", "Describe {name}: who made it and why, what happened to it, what it looks, sounds and smells like now, how to find it and get in, and why anyone would risk it.", ["Creepier", "Grander", "Older", "More dangerous", "More wondrous"]),
      { key: "areas", title: "Areas", blurb: "Rooms or zones, each with a feature, a danger or a clue.", working: "Mapping the halls", task: "Create {name}'s key areas (type location, within {name}), in the order a party would find them. Each needs something to see, a danger or puzzle, and a clue to the place's story.", types: ["location"], count: [3, 6], depends: ["about"], nudges: ["More areas", "A trap", "A puzzle", "A secret passage", "A boss room"] },
      { key: "inhabitants", title: "Who's there", blurb: "Monsters, guardians and anyone else who calls it home.", working: "Waking the inhabitants", task: "Create who and what lives in {name} now: monsters, guardians, a leader, maybe someone who can be talked to. Link creatures with inhabits or guards, and put each within {name} or one of its areas.", types: ["creature", "npc"], count: [2, 4], depends: ["about"], nudges: ["Scarier", "Someone to talk to", "A tougher boss", "Something tragic"] },
      { key: "treasure", title: "Treasure", blurb: "What's worth the risk, and where it's hidden.", working: "Hiding the treasure", task: "Create the treasure in {name}: what each piece is or does, and where it's hidden (within one of the areas). Link guardians to what they guard.", types: ["item", "magic_item"], count: [1, 3], depends: ["areas"], nudges: ["More valuable", "Something cursed", "Something the party needs"] },
      trouble("History & secrets", "What really happened here, rumours, and hooks.", ["npc", "world_thread"], ["inhabitants"], "Reveal what really happened at {name} (in the article inside a :::dm block) and anything new it needs. Then 3 rumours about {name} with the truth behind each, and 3 hooks that send a party here."),
    ],
  },
  venue: {
    key: "venue",
    sections: [
      about("The look, the smells, what's on offer and what it's known for.", "Pushing open the door", "Describe {name}: what you see, hear and smell walking in, who comes here, what's on offer and at what price, the house rules, and what it's known for. Fill the menu, specialties or inventory fields if it has them.", ["Rougher", "Fancier", "Cosier", "Stranger", "Busier"]),
      { key: "staff", title: "Staff & regulars", blurb: "Who runs it, who works here, and who never leaves.", working: "Meeting the regulars", task: "Create the owner (unless one exists), staff and regulars of {name}: each with a race from this world's peoples, a want and a secret. Link staff with works_at or owns, and give the regulars ties to each other.", types: ["npc"], count: [2, 4], depends: ["about"], nudges: ["Quirkier", "A troublemaker", "Someone hiding", "An old adventurer"] },
      trouble("Gossip & trouble", "What's said over the counter, and hooks.", ["npc", "faction"], ["staff"], "Give {name} trouble: a debt, a rival, a secret in the back room, anything new it needs. Then 3 rumours overheard here with the truth behind each, and 3 hooks that start here."),
    ],
  },
  culture: {
    key: "culture",
    sections: [
      about("Daily life, values, customs, art, food and names.", "Learning their ways", "Describe {name}: daily life, what they value and despise, customs around birth, coming of age, marriage and death, their art, food and festivals, how they name their children, and how they see outsiders.", ["Stricter", "More festive", "More insular", "More warlike", "More mystical"]),
      { key: "places", title: "Homelands & sacred places", blurb: "Where they live, and places that matter to them.", working: "Walking their homelands", task: "Create the places that matter to {name}: a town or community where they're many, and a sacred or ancestral site. Place each within existing regions where possible.", types: ["settlement", "landmark", "location"], count: [1, 3], depends: ["about"], nudges: ["A lost homeland", "A great city", "A sacred grove"] },
      { key: "people", title: "Notable people", blurb: "Elders, heroes and outcasts.", working: "Meeting the elders", task: "Create notable people of {name}: an elder or leader, a hero or legend, and an outcast. Each with a want and a secret; link them belongs_to {name}.", types: ["npc"], count: [2, 3], depends: ["about"], nudges: ["A rebel", "A legendary hero", "A traitor"] },
      trouble("Tensions", "Old grudges, rumours and hooks.", ["faction", "world_thread"], ["people"], "Give {name} a tension, inside or with outsiders, that could boil over, and anything new it needs. Then 3 rumours about {name} with the truth behind each, and 3 hooks."),
    ],
  },
  general: {
    key: "general",
    sections: [
      about("More detail, filled-in fields, and what makes it matter.", "Digging deeper", "Expand {name} with specific, playable detail consistent with everything known: what it is, where it came from, why it matters now, and what the party could do with it.", ["Darker", "Stranger", "More important", "More personal"]),
      { key: "connections", title: "Connections", blurb: "The people, places and things tied to it.", working: "Following the threads", task: "Create the people, places and things most tied to {name}, each linked to it, and link {name} to existing entries where it matters (focus links).", types: ["npc", "location", "landmark", "faction", "organization", "item", "magic_item", "creature"], count: [2, 4], depends: ["about"], nudges: ["More people", "A place to visit", "A dangerous connection"] },
      trouble("Hooks & rumours", "Rumours with the truth behind them, and hooks.", ["npc", "world_thread"], ["connections"], "Write 3 rumours about {name} with the truth behind each, and 3 hooks that bring it into play. Create anything new they need."),
    ],
  },
};

const PLAN_FOR_TYPE: Record<string, string> = {
  settlement: "settlement",
  region: "region",
  continent: "region",
  nation: "nation",
  faction: "faction",
  organization: "faction",
  religion: "religion",
  deity: "deity",
  npc: "person",
  pc: "person",
  dungeon: "site",
  landmark: "site",
  location: "site",
  tavern: "venue",
  shop: "venue",
  culture: "culture",
  race: "culture",
};

export function planFor(type: string): BuildPlan {
  return BUILD_PLANS[PLAN_FOR_TYPE[type] ?? "general"]!;
}

/** Sections in a build, with dependencies on sections the DM left out dropped. */
export function sectionsIn(plan: BuildPlan, keys: string[]): BuildSectionDef[] {
  const chosen = plan.sections.filter((s) => keys.includes(s.key));
  const inBuild = new Set(chosen.map((s) => s.key));
  return chosen.map((s) => ({ ...s, depends: s.depends.flatMap((d) => (inBuild.has(d) ? [d] : dependsVia(plan, d, inBuild))) }));
}

/** If a section depends on one that's left out, it depends on what that one depended on. */
function dependsVia(plan: BuildPlan, key: string, inBuild: Set<string>): string[] {
  const s = plan.sections.find((x) => x.key === key);
  if (!s) return [];
  return s.depends.flatMap((d) => (inBuild.has(d) ? [d] : dependsVia(plan, d, inBuild)));
}

export type Depth = "essentials" | "deep";
export const entryCount = (s: BuildSectionDef, depth: Depth) => s.count[depth === "deep" ? 1 : 0];

// ---------------------------------------------------------------------------
// Text versions, for prompts and collapsed views
// ---------------------------------------------------------------------------

export function buildSectionText(title: string, d: BuildSectionData): string {
  const lines: string[] = [`## ${title}`];
  if (d.article.trim()) lines.push(d.article.trim());
  for (const f of d.fields) lines.push(`- ${f.key}: ${f.value}`);
  for (const e of d.entries) {
    const links = e.links.map((l) => `${l.type.replace(/_/g, " ")} ${l.to}`).join("; ");
    lines.push(`- [${e.type}] ${e.name}${e.within ? ` (in ${e.within})` : ""}: ${e.summary}${links ? ` Links: ${links}.` : ""}`);
  }
  for (const l of d.links) lines.push(`- (focus) ${l.type.replace(/_/g, " ")} ${l.to}`);
  for (const r of d.rumours) lines.push(`- Rumour: ${r.claim} (truth: ${r.truth})`);
  for (const h of d.hooks) lines.push(`- Hook: ${h}`);
  return lines.join("\n");
}

export function buildSectionSummary(d: BuildSectionData): string {
  const names = d.entries.slice(0, 4).map((e) => e.name).join(", ") + (d.entries.length > 4 ? "…" : "");
  const parts = [d.entries.length ? `${d.entries.length} new: ${names}` : "", d.rumours.length ? `${d.rumours.length} rumours` : "", d.hooks.length ? `${d.hooks.length} hooks` : ""].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  const first = d.article.replace(/[#*_>]/g, "").trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  return first.slice(0, 160) || "Details for the article";
}

/** Fields Claude may fill on the focus entry: only those that are empty now. */
export function emptyFieldFills(fills: { key: string; value: string }[], current: Record<string, unknown>, allowed: string[]): { key: string; value: string }[] {
  const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
  const seen = new Set<string>();
  return fills.filter((f) => {
    if (!allowed.includes(f.key) || !f.value.trim() || seen.has(f.key) || !isEmpty(current[f.key])) return false;
    seen.add(f.key);
    return true;
  });
}
