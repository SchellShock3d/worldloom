/**
 * Offline generator: template-driven creation that still uses world context
 * (names from the world's own tables/cultures, the requested location, nearby
 * factions). Produces the same change-set shape the model would.
 */
import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, randomTableEntries, randomTables } from "@/server/db/schema";
import { emptyChangeSet, type ChangeSet, type AiRef } from "../changeset";
import { findNamedEntities } from "../context";
import { Rng, hashSeed } from "./rng";
import * as B from "./banks";
import { ENTITY_TYPE_MAP } from "@/lib/entity-types";

const TYPE_WORDS: [RegExp, string][] = [
  [/\b(tavern|inn|alehouse|pub)\b/i, "tavern"],
  [/\b(shop|store|smith|merchant|market stall|alchemist)\b/i, "shop"],
  [/\b(town|village|city|hamlet|settlement)\b/i, "settlement"],
  [/\b(faction|guild|cult|order|house|gang|company)\b/i, "faction"],
  [/\b(religion|church|faith|temple order)\b/i, "religion"],
  [/\b(god|goddess|deity)\b/i, "deity"],
  [/\b(dungeon|crypt|ruin|lair|cave|tomb)\b/i, "dungeon"],
  [/\b(rumou?rs?|gossip)\b/i, "rumour"],
  [/\b(quests?|job|mission|bounty)\b/i, "quest"],
  [/\b(magic item|artifact|enchanted)\b/i, "magic_item"],
  [/\b(item|treasure|weapon)\b/i, "item"],
  [/\b(historical event|history|battle|war)\b/i, "event"],
  [/\b(monster|creature|beast)\b/i, "creature"],
  [/\b(npc|character|person|someone|villain|merchant|guard|noble|priest)\b/i, "npc"],
];

export function detectType(request: string): string | null {
  for (const [re, t] of TYPE_WORDS) if (re.test(request)) return t;
  return null;
}

export function detectCount(request: string): number {
  const m = request.match(/\b(\d{1,2})\b/);
  if (m) return Math.max(1, Math.min(8, Number(m[1])));
  const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2, few: 3, several: 4 };
  for (const [w, n] of Object.entries(words)) if (new RegExp(`\\b${w}\\b`, "i").test(request)) return n;
  return 1;
}

async function tableEntries(db: DB, worldId: string, name: string) {
  const rows = await db
    .select({ text: randomTableEntries.text })
    .from(randomTableEntries)
    .innerJoin(randomTables, eq(randomTables.id, randomTableEntries.tableId))
    .where(and(eq(randomTables.worldId, worldId), ilike(randomTables.name, name)));
  return rows.map((r) => r.text);
}

export async function nameGenerator(db: DB, worldId: string, rng: Rng, cultureId?: string | null) {
  let given = await tableEntries(db, worldId, "Given names");
  let family = await tableEntries(db, worldId, "Family names");
  if (cultureId) {
    const [c] = await db.select({ fields: entities.fields }).from(entities).where(eq(entities.id, cultureId));
    const sample = (c?.fields as { sampleNames?: string[] } | undefined)?.sampleNames;
    if (sample?.length) given = sample;
  }
  if (!given.length) given = ["Aldric", "Brisa", "Corwin", "Della", "Edric", "Fenna"];
  if (!family.length) family = ["Ashdown", "Blackbriar", "Coldwater", "Dunmere"];
  const used = new Set<string>();
  return () => {
    for (let i = 0; i < 10; i++) {
      const n = `${rng.pick(given)} ${rng.pick(family)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `${rng.pick(given)} ${rng.pick(family)}`;
  };
}

interface GenOpts {
  worldId: string;
  campaignId: string | null;
  request: string;
  type?: string | null;
  count?: number;
  locationId?: string | null;
  seed?: number;
}

export async function offlineGenerate(db: DB, opts: GenOpts): Promise<ChangeSet> {
  const rng = new Rng(opts.seed ?? hashSeed(opts.request, Date.now()));
  const type = opts.type ?? detectType(opts.request) ?? "npc";
  const count = opts.count ?? detectCount(opts.request);
  const cs = emptyChangeSet();

  // Location: explicit, else the first named place in the request.
  let location: { id: string; name: string; type: string } | null = null;
  const locIds = opts.locationId ? [opts.locationId] : await findNamedEntities(db, opts.worldId, opts.request, opts.campaignId);
  if (locIds.length) {
    const rows = await db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(and(eq(entities.worldId, opts.worldId), inArray(entities.id, locIds)));
    location = rows.find((r) => ENTITY_TYPE_MAP[r.type]?.isPlace) ?? null;
  }
  const locRef: AiRef | null = location ? { id: location.id, ref: null, name: location.name } : null;
  const nearbyFactions = await db
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .where(and(eq(entities.worldId, opts.worldId), eq(entities.type, "faction"), or(isNull(entities.campaignId), opts.campaignId ? eq(entities.campaignId, opts.campaignId) : isNull(entities.campaignId))))
    .limit(20);
  const name = await nameGenerator(db, opts.worldId, rng);
  const where = location ? ` in ${location.name}` : "";

  const npc = (ref: string, occupation?: string) => {
    const n = name();
    const occ = occupation ?? rng.pick(B.OCCUPATIONS);
    const species = rng.pick(B.SPECIES);
    const motivation = rng.pick(B.MOTIVATIONS);
    const secret = rng.pick(B.SECRETS);
    cs.newEntities.push({
      ref,
      type: "npc",
      name: n,
      summary: `A ${rng.pick(B.PERSONALITY).split(",")[0]} ${species} ${occ}${where}.`,
      body: `${n} wants to ${motivation}.\n\n:::dm\n${n} ${secret}.\n:::`,
      status: "alive",
      location: locRef,
      fields: [
        { key: "species", value: species },
        { key: "occupation", value: occ },
        { key: "appearance", value: rng.pick(B.APPEARANCE) },
        { key: "personality", value: rng.pick(B.PERSONALITY) },
        { key: "mannerisms", value: rng.pick(B.MANNERISMS) },
        { key: "motivations", value: motivation },
        { key: "fears", value: rng.pick(B.FEARS) },
        { key: "secrets", value: secret },
      ],
      tags: [],
      aliases: [],
      visibility: "secret",
      importance: 0,
      rationale: location ? `Fits ${location.name}.` : "Generated from your world's name tables.",
    });
    if (nearbyFactions.length && rng.chance(0.35)) {
      const f = rng.pick(nearbyFactions);
      cs.relationships.push({ source: { id: null, ref, name: n }, target: { id: f.id, ref: null, name: f.name }, type: "member_of", description: "Quietly connected.", rationale: `Ties the new character to ${f.name}.` });
    }
    return n;
  };

  for (let i = 0; i < count; i++) {
    const ref = `${type}-${i + 1}`;
    switch (type) {
      case "npc":
        npc(ref);
        break;
      case "tavern": {
        const tname = `The ${rng.pick(B.TAVERN_FIRST)} ${rng.pick(B.TAVERN_SECOND)}`;
        const menu = rng.sample(B.MENU_ITEMS, 5).map(([n, p]) => ({ key: "", value: `${n} — ${p}` }));
        cs.newEntities.push({
          ref,
          type: "tavern",
          name: tname,
          summary: `A ${rng.pick(["well-loved", "rough", "respectable", "dubious", "busy"])} tavern${where}.`,
          body: `${rng.pick(B.TAVERN_AMBIENCE)}.\n\n**Tonight:** ${rng.pick(["a dice tournament", "a travelling bard", "a wake for a sailor", "a betrothal party", "nothing much, which is suspicious"])}.`,
          status: "open",
          location: locRef,
          fields: [
            { key: "quality", value: rng.pick(["Poor", "Modest", "Comfortable"]) },
            { key: "ambience", value: rng.pick(B.TAVERN_AMBIENCE) },
            { key: "rooms", value: `${rng.int(2, 9)} rooms at ${rng.int(3, 8)} sp a night` },
            { key: "patrons", value: menu.length ? "Locals, travellers, and the occasional off-duty guard" : "" },
          ],
          tags: ["tavern"],
          aliases: [],
          visibility: "public",
          importance: 0,
          rationale: location ? `Gives ${location.name} a place to gather.` : "A place for the party to find work and gossip.",
        });
        const owner = npc(`${ref}-owner`, "innkeeper");
        cs.relationships.push({ source: { id: null, ref: `${ref}-owner`, name: owner }, target: { id: null, ref, name: tname }, type: "owns", description: "", rationale: "Every tavern needs a keeper." });
        cs.rumours.push({
          title: `Talk at ${tname}`,
          claim: rng.pick(await tableEntries(db, opts.worldId, "Rumour starters").then((r) => (r.length ? r : ["Strange lights were seen near the old mill."]))),
          truth: "",
          accuracy: rng.int(20, 80),
          distortion: "Exaggerated with each retelling.",
          originEvent: null,
          circulatesIn: [{ id: null, ref, name: tname }],
          spreadBy: [],
          rationale: "Taverns are where rumours start.",
        });
        break;
      }
      case "shop": {
        const st = rng.pick(B.SHOP_TYPES);
        const owner = name();
        const sname = `${owner.split(" ")[1]} ${rng.pick(B.SHOP_NAMES)}`;
        const inv = (B.SHOP_INVENTORY[st] ?? B.SHOP_INVENTORY["general goods"]!).map(([n, p]) => `${n} (${p})`).join("; ");
        cs.newEntities.push({
          ref,
          type: "shop",
          name: sname,
          summary: `A ${st}${where}, run by ${owner}.`,
          body: `Stock: ${inv}.`,
          status: "open",
          location: locRef,
          fields: [
            { key: "shopType", value: st },
            { key: "pricing", value: rng.pick(["Cheap", "Fair", "Fair", "Expensive"]) },
            { key: "hours", value: "Dawn to dusk, closed on holy days" },
            { key: "specialItems", value: rng.pick(["A locked case of items 'not for sale'", "One genuinely magical trinket, mislabelled", "Nothing special, unless you ask the right way"]) },
          ],
          tags: ["shop"],
          aliases: [],
          visibility: "public",
          importance: 0,
          rationale: "Somewhere to spend coin.",
        });
        cs.newEntities.push({
          ref: `${ref}-owner`,
          type: "npc",
          name: owner,
          summary: `Proprietor of ${sname}.`,
          body: `Runs the shop and knows every customer by name.`,
          status: "alive",
          location: locRef,
          fields: [
            { key: "occupation", value: st === "general goods" ? "shopkeeper" : st },
            { key: "personality", value: rng.pick(B.PERSONALITY) },
            { key: "mannerisms", value: rng.pick(B.MANNERISMS) },
          ],
          tags: [],
          aliases: [],
          visibility: "public",
          importance: 0,
          rationale: "The shop's owner.",
        });
        cs.relationships.push({ source: { id: null, ref: `${ref}-owner`, name: owner }, target: { id: null, ref, name: sname }, type: "owns", description: "", rationale: "Owner of the shop." });
        break;
      }
      case "settlement": {
        const sname = `${rng.pick(["Stone", "Ash", "Raven", "Mill", "Thorn", "Salt", "Elder", "Wolf"])}${rng.pick(["haven", "ford", "brook", "hollow", "wick", "march", "gate", "mere"])}`;
        cs.newEntities.push({
          ref,
          type: "settlement",
          name: sname,
          summary: `A ${rng.pick(["Village", "Town", "Town", "City"]).toLowerCase()}${where} known for ${rng.pick(["its wool", "its wine", "a famous shrine", "its mines", "its fish market", "smuggling"])}.`,
          body: `Notable: ${rng.pick(B.SETTLEMENT_FEATURES)}.\n\n:::dm\nTrouble brewing: ${rng.pick(B.COMPLICATIONS)}\n:::`,
          status: "stable",
          location: locRef,
          fields: [
            { key: "size", value: rng.pick(["Village", "Town", "City"]) },
            { key: "population", value: String(rng.int(2, 60) * 100) },
            { key: "government", value: rng.pick(["Elected reeve", "Hereditary lord", "Merchant council", "Temple elders"]) },
            { key: "notableFeatures", value: rng.pick(B.SETTLEMENT_FEATURES) },
          ],
          tags: [],
          aliases: [],
          visibility: "public",
          importance: 1,
          rationale: "A new place to visit.",
        });
        break;
      }
      case "faction": {
        const ft = rng.pick(B.FACTION_TYPES);
        const fname = `The ${rng.pick(["Black", "Silver", "Ashen", "Hollow", "Crimson", "Grey", "Gilded"])} ${rng.pick(["Hand", "Lantern", "Circle", "Thorn", "Oath", "Veil", "Crown"])}`;
        const goal = rng.pick(B.FACTION_GOALS);
        cs.newEntities.push({
          ref,
          type: "faction",
          name: fname,
          summary: `A ${ft} that seeks to ${goal}.`,
          body: `${fname} recruits quietly and rewards loyalty.\n\n:::dm\nTheir true aim goes further: ${rng.pick(B.FACTION_GOALS)}.\n:::`,
          status: "active",
          location: locRef,
          fields: [
            { key: "factionType", value: ft },
            { key: "goals", value: goal },
            { key: "resources", value: rng.pick(["coin and informants", "a fortified hall and fifty blades", "old magic and older debts", "the ear of a noble"]) },
            { key: "currentPlans", value: `Move against a rival${where} within the month.` },
          ],
          tags: [],
          aliases: [],
          visibility: "secret",
          importance: 1,
          rationale: "Adds a group with goals that can drive world threads.",
        });
        const leader = npc(`${ref}-leader`);
        cs.relationships.push({ source: { id: null, ref: `${ref}-leader`, name: leader }, target: { id: null, ref, name: fname }, type: "leads", description: "", rationale: "Every faction needs a face." });
        break;
      }
      case "religion":
      case "deity": {
        const domain = rng.pick(B.DEITY_DOMAINS);
        const dname = `${rng.pick(["Aur", "Vel", "Mor", "Sel", "Tha", "Iri", "Kael", "Oss"])}${rng.pick(["andor", "ith", "ane", "eus", "ora", "is", "ath"])}`;
        cs.newEntities.push({
          ref: `${ref}-deity`,
          type: "deity",
          name: dname,
          summary: `God of ${domain}.`,
          body: `Depicted as ${rng.pick(["a veiled figure holding a lantern", "a great horned stag", "a woman of storm and salt", "a faceless smith"])}.`,
          status: "active",
          location: null,
          fields: [{ key: "domains", value: `${domain}, ${rng.pick(B.DEITY_DOMAINS)}` }, { key: "alignment", value: rng.pick(["Lawful good", "Neutral", "Chaotic neutral", "Lawful neutral"]) }],
          tags: [],
          aliases: [],
          visibility: "public",
          importance: 0,
          rationale: "A power for people to pray to.",
        });
        if (type === "religion") {
          const rname = `The Church of ${dname}`;
          cs.newEntities.push({
            ref,
            type: "religion",
            name: rname,
            summary: `Followers of ${dname}, god of ${domain}.`,
            body: `Rites centre on ${rng.pick(["dawn vigils", "offerings of salt", "the burning of written confessions", "pilgrimages to high places"])}.`,
            status: "established",
            location: locRef,
            fields: [{ key: "tenets", value: rng.pick(["Hospitality is sacred.", "Debts must be paid.", "The dead must be remembered by name."]) }],
            tags: [],
            aliases: [],
            visibility: "public",
            importance: 0,
            rationale: "Organised worship.",
          });
          cs.relationships.push({ source: { id: null, ref: `${ref}-deity`, name: dname }, target: { id: null, ref, name: rname }, type: "worshipped_by", description: "", rationale: "Links god and faith." });
        }
        break;
      }
      case "dungeon": {
        const dname = `The ${rng.pick(["Sunken", "Whispering", "Forgotten", "Shattered", "Hollow"])} ${rng.pick(["Crypt", "Vault", "Mine", "Halls", "Sanctum"])}`;
        cs.newEntities.push({
          ref,
          type: "dungeon",
          name: dname,
          summary: `A ${rng.pick(["flooded", "collapsed", "sealed", "haunted"])} ruin${where}.`,
          body: `Entrance: ${rng.pick(["behind a waterfall", "beneath a ruined chapel", "a sinkhole that opened last spring"])}.\n\n:::dm\nAt its heart: ${rng.pick(["a sleeping guardian", "a cursed relic", "the remains of a lost expedition", "a portal that opens at the new moon"])}.\n:::`,
          status: "unexplored",
          location: locRef,
          fields: [
            { key: "dungeonType", value: rng.pick(["crypt", "mine", "temple", "lair"]) },
            { key: "danger", value: rng.pick(["Moderate", "High"]) },
            { key: "inhabitants", value: rng.pick(["scavengers and worse", "the restless dead", "a family of trolls", "cultists"]) },
          ],
          tags: [],
          aliases: [],
          visibility: "secret",
          importance: 0,
          rationale: "Somewhere dangerous to explore.",
        });
        break;
      }
      case "quest": {
        const giver = npc(`${ref}-giver`);
        const qname = rng.pick(["Recover the stolen ledger", "Find the missing ferryman", "Clear the old mill", "Escort the pilgrim", "Silence the bells"]);
        cs.newEntities.push({
          ref,
          type: "quest",
          name: qname,
          summary: `${giver} needs help${where}.`,
          body: `**Reward:** ${rng.int(2, 20) * 10} gp.\n\n:::dm\nComplication: ${rng.pick(B.COMPLICATIONS)}\n:::`,
          status: null,
          location: locRef,
          fields: [],
          tags: [],
          aliases: [],
          visibility: "public",
          importance: 0,
          rationale: "A hook to pull the party in.",
        });
        cs.relationships.push({ source: { id: null, ref, name: qname }, target: { id: null, ref: `${ref}-giver`, name: giver }, type: "involves", description: "Quest giver", rationale: "Who offers the job." });
        break;
      }
      case "rumour": {
        const starters = await tableEntries(db, opts.worldId, "Rumour starters");
        const claim = starters.length ? rng.pick(starters) : "Something stirs in the hills.";
        cs.rumours.push({
          title: claim.split(" ").slice(0, 6).join(" "),
          claim,
          truth: "",
          accuracy: rng.int(10, 90),
          distortion: rng.pick(["Details swapped between two people.", "Numbers exaggerated tenfold.", "Mostly true, wrong culprit."]),
          originEvent: null,
          circulatesIn: locRef ? [locRef] : [],
          spreadBy: [],
          rationale: "Gossip for the party to overhear.",
        });
        break;
      }
      case "item":
      case "magic_item": {
        const magic = type === "magic_item";
        const iname = `${rng.pick(["Ember", "Hollow", "Saint's", "Widow's", "Stormglass", "Raven"])} ${rng.pick(["Blade", "Lantern", "Ring", "Cloak", "Compass", "Key"])}`;
        cs.newEntities.push({
          ref,
          type,
          name: iname,
          summary: magic ? `An enchanted ${iname.split(" ")[1]!.toLowerCase()} with a troubled history.` : `A notable ${iname.split(" ")[1]!.toLowerCase()}.`,
          body: magic ? `Grants its bearer ${rng.pick(["sight in darkness", "warmth against any cold", "a whisper of warning before danger", "the ability to speak with birds"])}.\n\n:::dm\nCurse: ${rng.pick(["it slowly erases its bearer's memories", "it calls to its original owner", "it cannot be put down for long"])}.\n:::` : "",
          status: "intact",
          location: locRef,
          fields: magic ? [{ key: "rarity", value: rng.pick(["Uncommon", "Rare", "Very rare"]) }, { key: "attunement", value: rng.pick(["No", "Yes"]) }] : [{ key: "category", value: "Treasure" }, { key: "value", value: `${rng.int(5, 200)} gp` }],
          tags: [],
          aliases: [],
          visibility: "secret",
          importance: 0,
          rationale: "Treasure with a story.",
        });
        break;
      }
      case "event": {
        cs.events.push({
          ref,
          title: rng.pick(["The Burning of the Granary", "The Night of Falling Stars", "The Siege at the Ford", "The Plague Winter", "The Treaty of Salt"]),
          summary: "A turning point people still talk about.",
          kind: "historical",
          offsetDays: 0,
          yearsAgo: rng.int(5, 300),
          location: locRef,
          involved: [],
          visibility: "public",
          rationale: "Gives the world some history.",
        });
        break;
      }
      case "creature": {
        const cname = `${rng.pick(["Marsh", "Ash", "Hollow", "Thorn", "Glass"])} ${rng.pick(["Stalker", "Wyrmling", "Hound", "Shrike", "Lurker"])}`;
        cs.newEntities.push({
          ref,
          type: "creature",
          name: cname,
          summary: `A predator of ${location?.name ?? "the wilds"}.`,
          body: `Hunts ${rng.pick(["at dusk", "in packs", "by mimicking voices", "from the treetops"])}.`,
          status: "common",
          location: locRef,
          fields: [
            { key: "size", value: rng.pick(["Small", "Medium", "Large"]) },
            { key: "creatureType", value: rng.pick(["beast", "monstrosity", "fey", "undead"]) },
            { key: "challenge", value: rng.pick(["1/2", "1", "2", "3", "5"]) },
            { key: "armorClass", value: String(rng.int(11, 16)) },
            { key: "hitPoints", value: `${rng.int(11, 60)}` },
          ],
          tags: [],
          aliases: [],
          visibility: "secret",
          importance: 0,
          rationale: "A threat that fits the region.",
        });
        break;
      }
      default:
        npc(ref);
    }
  }
  const made = [...cs.newEntities.map((e) => e.name), ...cs.rumours.map((r) => `rumour “${r.title}”`), ...cs.events.map((e) => e.title)];
  cs.summary = `Generated ${made.slice(0, 4).join(", ")}${made.length > 4 ? ` and ${made.length - 4} more` : ""}${where}. Offline generator: connect an AI model for richer, context-aware results.`;
  return cs;
}
