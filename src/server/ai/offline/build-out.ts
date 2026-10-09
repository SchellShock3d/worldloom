/**
 * Offline build-out: the same section shape Claude returns, from Worldloom's own tables. It keeps
 * the feature usable (and testable) without a key; with Claude connected this is never used.
 */
import type { DB } from "@/server/db/client";
import type { Entity } from "@/server/db/schema";
import { Rng, hashSeed } from "./rng";
import * as B from "./banks";
import { demographicsFor, nameGenerator, racePicker } from "./generate";
import type { BuildEntry, BuildSectionData, BuildSectionDef } from "@/lib/build-out";
import type { BuildSectionRequest } from "../tasks/build-out";

const DISTRICTS = ["the Old Quarter", "Lantern Row", "the Narrows", "Temple Hill", "the Tanneries", "Market Steps", "the Low Docks", "Gallows Green"];
const LANDMARKS = ["the Broken Bell Tower", "the Weeping Arch", "the Drowned Stair", "the Hollow Oak", "the Black Obelisk", "the Old King's Bridge"];
const SITES = ["the Sunken Vault", "the Barrow of Nine Lamps", "the Glass Caves", "the Shattered Abbey", "the Ashen Mine", "the Silent Keep"];
const AREAS = ["Collapsed gatehouse", "Hall of statues", "Flooded crypt", "Shrine of bones", "Narrow bridge", "Treasury", "Guard barracks", "Sealed reliquary"];
const FACTION_NOUNS = ["Hand", "Lantern", "Compact", "Circle", "Brotherhood", "Company", "Order", "Ledger"];
const FACTION_ADJ = ["Grey", "Silent", "Gilded", "Ashen", "Iron", "Crimson", "Hollow", "Ninth"];
const CREATURES = ["Marsh Strangler", "Ash Hound", "Bone Heron", "Cave Lurker", "Gloomwing", "Thorn Boar"];
const ITEMS = ["the Lantern of Saint Orla", "a cracked silver compass", "the Ninefold Key", "a ledger bound in eelskin", "the Warden's Signet", "a mirror that shows yesterday"];
const TOWNS = ["Harrowford", "Saltmere", "Duncairn", "Westwick", "Thornbury", "Coldharbour"];
const GODS = ["Velith", "Orun", "Saelwen", "Kharos", "Imbra", "Taneth"];

export async function offlineBuildSection(db: DB, req: BuildSectionRequest & { focus: Entity; def: BuildSectionDef; n: number }): Promise<BuildSectionData> {
  const { focus, def, n } = req;
  const rng = new Rng(hashSeed(focus.id, def.key, req.mode, (req.notes ?? []).join("|"), req.mode === "redo" ? Date.now() : 0));
  const name = await nameGenerator(db, focus.worldId, rng);
  const race = await racePicker(db, focus.worldId, rng, focus.locationId ?? focus.id);
  const out: BuildSectionData = { article: "", fields: [], entries: [], links: [], rumours: [], hooks: [] };
  const taken = new Set<string>();
  const unique = (make: () => string) => {
    for (let i = 0; i < 12; i++) {
      const x = make();
      if (!taken.has(x)) {
        taken.add(x);
        return x;
      }
    }
    return `${make()} ${taken.size + 1}`;
  };
  const cap = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());

  const npc = (role: string, links: BuildEntry["links"] = [], within = ""): BuildEntry => ({
    type: "npc",
    name: unique(name),
    summary: `${cap(role)}; ${rng.pick(B.PERSONALITY)}.`,
    details: `${cap(rng.pick(B.APPEARANCE))}. ${cap(rng.pick(B.MANNERISMS))}. Wants to ${rng.pick(B.MOTIVATIONS)}.`,
    secret: `Secretly ${rng.pick(B.SECRETS)}.`,
    within,
    fields: [
      { key: "species", value: race() },
      { key: "occupation", value: role },
      { key: "motivations", value: rng.pick(B.MOTIVATIONS) },
      { key: "fears", value: rng.pick(B.FEARS) },
    ],
    links,
  });

  const make = (type: string): BuildEntry => {
    switch (type) {
      case "npc":
        return npc(rng.pick(B.OCCUPATIONS));
      case "faction":
      case "organization":
        return { type, name: unique(() => `The ${rng.pick(FACTION_ADJ)} ${rng.pick(FACTION_NOUNS)}`), summary: `A ${rng.pick(B.FACTION_TYPES)} that wants to ${rng.pick(B.FACTION_GOALS)}.`, details: "", secret: rng.pick(B.SECRETS).replace(/^/, "Its leader "), within: "", fields: [{ key: "goals", value: rng.pick(B.FACTION_GOALS) }], links: [] };
      case "tavern":
        return { type, name: unique(() => `The ${rng.pick(B.TAVERN_FIRST)} ${rng.pick(B.TAVERN_SECOND)}`), summary: cap(rng.pick(B.TAVERN_AMBIENCE)), details: `On the menu: ${rng.sample(B.MENU_ITEMS, 2).join("; ")}.`, secret: "", within: "", fields: [], links: [] };
      case "shop": {
        const kind = rng.pick(B.SHOP_TYPES);
        return { type, name: unique(() => `${name().split(" ").pop()} ${rng.pick(B.SHOP_NAMES)}`), summary: `A ${kind}.`, details: (B.SHOP_INVENTORY[kind] ?? []).map(([i, p]) => `- ${i}: ${p}`).join("\n"), secret: "", within: "", fields: [{ key: "shopType", value: kind }], links: [] };
      }
      case "location":
        return def.key === "areas"
          ? { type, name: unique(() => rng.pick(AREAS)), summary: "A chamber with signs of an old struggle.", details: rng.pick(B.COMPLICATIONS), secret: "", within: focus.name, fields: [{ key: "kind", value: "room" }], links: [] }
          : { type, name: unique(() => cap(rng.pick(DISTRICTS))), summary: `A quarter of ${focus.name} known for ${rng.pick(B.SETTLEMENT_FEATURES)}.`, details: "", secret: "", within: focus.name, fields: [{ key: "kind", value: "district" }], links: [] };
      case "landmark":
        return { type, name: unique(() => cap(rng.pick(LANDMARKS))), summary: "A place locals give directions by, and avoid after dark.", details: "", secret: "", within: focus.name, fields: [], links: [] };
      case "dungeon":
        return { type, name: unique(() => cap(rng.pick(SITES))), summary: "A ruin that swallowed the last party who went looking.", details: "", secret: "", within: focus.name, fields: [], links: [] };
      case "settlement":
        return { type, name: unique(() => rng.pick(TOWNS)), summary: `A town known for ${rng.pick(B.SETTLEMENT_FEATURES)}.`, details: "", secret: "", within: focus.name, fields: [{ key: "size", value: rng.pick(["Village", "Town"]) }], links: [] };
      case "creature":
        return { type, name: unique(() => rng.pick(CREATURES)), summary: "A predator that hunts the edges of settled land.", details: "", secret: "", within: "", fields: [], links: [{ to: focus.name, type: "inhabits", why: "Its hunting ground." }] };
      case "item":
      case "magic_item":
        return { type, name: unique(() => cap(rng.pick(ITEMS))), summary: "Old, valuable, and wanted by more than one person.", details: "", secret: "", within: "", fields: [], links: [] };
      case "deity":
        return { type, name: unique(() => rng.pick(GODS)), summary: `God of ${rng.pick(B.DEITY_DOMAINS)}.`, details: "", secret: "", within: "", fields: [{ key: "domains", value: rng.pick(B.DEITY_DOMAINS) }], links: [{ to: focus.name, type: "worshipped_by", why: "Its faithful." }] };
      case "religion":
        return { type, name: unique(() => `The Faith of ${focus.name}`), summary: "Its faithful gather at dawn.", details: "", secret: "", within: "", fields: [], links: [] };
      case "world_thread":
        return { type, name: unique(() => `Trouble in ${focus.name}`), summary: rng.pick(B.COMPLICATIONS), details: "If nobody acts, it gets worse within the month.", secret: "", within: "", fields: [], links: [] };
      default:
        return { type, name: unique(() => `${cap(type.replace(/_/g, " "))} of ${focus.name}`), summary: "", details: "", secret: "", within: "", fields: [], links: [] };
    }
  };

  if (def.key === "about") {
    out.article = `${focus.name} is known for ${rng.pick(B.SETTLEMENT_FEATURES)}. Locals are ${rng.pick(B.PERSONALITY)}.`;
    if (["settlement", "region", "nation"].includes(focus.type)) {
      const demo = await demographicsFor(db, focus.worldId, rng);
      if (demo) out.fields.push({ key: "demographics", value: demo });
    }
  }
  for (let i = 0; i < n && def.types.length; i++) {
    const e = make(def.types[i % def.types.length]!);
    if (e.type === "npc" && ["power", "leaders", "court"].includes(def.key)) e.links.push({ to: focus.name, type: i === 0 ? (focus.type === "faction" || focus.type === "organization" ? "leads" : "rules") : "serves", why: "Their place in it." });
    if (e.type === "npc" && ["members", "clergy", "staff"].includes(def.key)) e.links.push({ to: focus.name, type: def.key === "staff" ? "works_at" : "member_of", why: "Where they belong." });
    if (e.type === "npc" && def.key === "circle") e.links.push({ to: focus.name, type: rng.pick(["friend_of", "rival_of", "sibling_of"]), why: "An old tie." });
    out.entries.push(e);
  }
  if (def.rumours) {
    out.rumours = rng.sample(B.SECRETS, 3).map((s) => ({ claim: `Someone in ${focus.name} ${s}.`, truth: "Partly true, but not who people think." }));
  }
  if (def.hooks) out.hooks = rng.sample(B.COMPLICATIONS, 3);
  return out;
}
