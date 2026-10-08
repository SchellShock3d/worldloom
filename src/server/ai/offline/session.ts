/**
 * Offline session-notes analysis. Reads @mentions (and plain names), splits
 * notes into happenings, and applies conservative keyword rules. The result is
 * a starting point for the DM to edit, clearly labelled as rule-based.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { clues, entities, mysteries } from "@/server/db/schema";
import { MENTION_RE } from "@/lib/mentions";
import { getNameIndex } from "@/server/services/history";
import { emptyChangeSet, type ChangeSet, type AiRef } from "../changeset";

const RULES = {
  death: /\b(killed|slew|slain|died|dies|dead|executed|murdered|perished)\b/i,
  captured: /\b(captured|imprisoned|arrested|jailed|taken prisoner)\b/i,
  missing: /\b(fled|vanished|disappeared|went missing|escaped)\b/i,
  helped: /\b(helped|saved|rescued|aided|protected|healed|freed|defended)\b/i,
  harmed: /\b(insulted|attacked|robbed|betrayed|angered|threatened|humiliated|stole from|cheated)\b/i,
  promise: /\b(promised|swore|vowed|agreed to|will meet|owes us|pledged|offered to)\b/i,
  questDone: /\b(completed|finished|fulfilled|turned in|delivered)\b/i,
  questStart: /\b(accepted|took on|agreed to help|started|signed up)\b/i,
  questFail: /\b(failed|abandoned|gave up on)\b/i,
  learned: /\b(learned|discovered|found out|revealed|realized|realised|uncovered|deduced)\b/i,
  gained: /\b(found|looted|bought|received|gained|obtained|were given|was given|picked up|stole)\b\s+(?:a |an |the |some )?([^.,;!?\n]{3,60})/i,
  lost: /\b(lost|sold|gave away|spent|used up|broke)\b\s+(?:a |an |the |some |their )?([^.,;!?\n]{3,60})/i,
  moved: /\b(moved to|went to|travelled to|traveled to|arrived at|left for|returned to|headed to)\b/i,
  hostile: /\b(hates?|despises|loathes|furious|enraged|resents|distrusts|wants revenge|swore revenge|vows? revenge|holds a grudge|turned against|is angry|now angry|humiliated by|won't forgive)\b/i,
  friendly: /\b(trusts|likes|admires|is grateful|thanked|is fond of|respects|befriended|became friends|owes us a favou?r|owes the party)\b/i,
  newQuest: /\b(?:accepted|took on|agreed to take|signed up for|were hired for|was hired for)\s+(?:the\s+|a\s+|an\s+)?(.{3,60}?)\s+(?:quest|job|contract|task|mission|commission)\b/i,
  notable: /\b(killed|defeated|rescued|discovered|arrived|met|betrayed|destroyed|stole|burned|captured|freed|escaped|agreed|signed|crowned|attacked|ambushed|fought|negotiated|found)\b/i,
};

function dueDays(line: string): number {
  const m = line.match(/\bin (\d{1,3}) days?\b/i) ?? line.match(/\bwithin (\d{1,3}) days?\b/i);
  if (m) return Number(m[1]);
  if (/\btomorrow\b/i.test(line)) return 1;
  if (/\b(a|one) week\b/i.test(line)) return 7;
  if (/\b(a|one) month\b/i.test(line)) return 30;
  if (/\bfortnight\b/i.test(line)) return 14;
  return 7;
}

/** Strip markdown list/quote markers, quick-log time stamps ("- **18:00** …") and emphasis. */
export function cleanLine(line: string) {
  return line
    .replace(MENTION_RE, (_m, name: string) => name)
    .replace(/^[\s>*\-•]+/, "")
    .replace(/^\d{1,3}[.)]\s+/, "")
    .replace(/^(?:\*\*|__)?\[?\d{1,2}:\d{2}(?:\s?[ap]\.?m\.?)?\]?(?:\*\*|__)?\s*[-–—:]?\s*/i, "")
    .replace(/\*\*|__/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function offlineProcessSession(
  db: DB,
  opts: { worldId: string; campaignId: string; notes: string; sessionNumber: number },
): Promise<ChangeSet> {
  const cs = emptyChangeSet();
  const index = await getNameIndex(db, opts.worldId, opts.campaignId);
  const lines = opts.notes
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z@])/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3);

  // Entities mentioned per line: explicit tokens plus plain names.
  const perLine: { raw: string; text: string; ids: string[] }[] = [];
  const allIds = new Set<string>();
  // Notes say "Varo" for "Captain Varo": also match people's names without their title, when that's
  // unambiguous. Short forms only match capitalised, so "back to town" never means "Old Town".
  const TITLE = /^(captain|lady|lord|sister|brother|king|queen|prince|princess|sir|dame|master|mistress|father|mother|old|duke|duchess|baron|baroness|count|countess|high priest|priestess|commander|general|magister)\s+/i;
  const personIds = new Set(
    (await db.select({ id: entities.id }).from(entities).where(and(eq(entities.worldId, opts.worldId), inArray(entities.type, ["npc", "pc", "creature"])))).map((r) => r.id),
  );
  const short = new Map<string, { id: string; name: string } | null>();
  for (const e of index) {
    if (!personIds.has(e.id)) continue;
    const m = e.name.match(TITLE);
    if (!m) continue;
    const rest = e.name.slice(m[0].length);
    if (rest.length < 3 || !/^\p{Lu}/u.test(rest) || index.some((o) => o.name.toLowerCase() === rest.toLowerCase())) continue;
    short.set(rest.toLowerCase(), short.has(rest.toLowerCase()) ? null : { id: e.id, name: rest });
  }
  const shortNames = [...short.values()].filter((v): v is { id: string; name: string } => !!v);
  const sortedNames = [...index].filter((e) => e.name.length > 2).sort((a, b) => b.name.length - a.name.length);
  const unresolvedNew = new Map<string, string>(); // name → line
  for (const raw of lines) {
    const ids = new Set<string>();
    for (const m of raw.matchAll(MENTION_RE)) ids.add(m[2]!.toLowerCase());
    const plain = raw.replace(MENTION_RE, " ");
    const lower = plain.toLowerCase();
    for (const e of sortedNames) {
      const n = e.name.toLowerCase();
      const i = lower.indexOf(n);
      if (i >= 0 && !/[\p{L}]/u.test(lower[i - 1] ?? " ") && !/[\p{L}]/u.test(lower[i + n.length] ?? " ")) ids.add(e.id);
    }
    for (const e of shortNames) {
      const i = plain.indexOf(e.name);
      if (i >= 0 && !/[\p{L}]/u.test(plain[i - 1] ?? " ") && !/[\p{L}]/u.test(plain[i + e.name.length] ?? " ")) ids.add(e.id);
    }
    // "@New Person" that didn't resolve to anything known.
    for (const m of plain.matchAll(/@([A-Z][\p{L}'-]+(?: [A-Z][\p{L}'-]+){0,2})/gu)) {
      if (!index.some((e) => e.name.toLowerCase() === m[1]!.toLowerCase())) unresolvedNew.set(m[1]!, cleanLine(raw));
    }
    ids.forEach((i) => allIds.add(i));
    perLine.push({ raw, text: cleanLine(raw), ids: [...ids] });
  }

  const ents = allIds.size
    ? await db.select({ id: entities.id, name: entities.name, type: entities.type, visibility: entities.visibility }).from(entities).where(and(eq(entities.worldId, opts.worldId), inArray(entities.id, [...allIds])))
    : [];
  const byId = new Map(ents.map((e) => [e.id, e]));
  const ref = (id: string): AiRef => ({ id, ref: null, name: byId.get(id)?.name ?? "" });
  const ofType = (ids: string[], types: string[]) => ids.filter((i) => types.includes(byId.get(i)?.type ?? ""));
  const PEOPLE = ["npc", "creature"];
  const GROUPS = ["faction", "organization", "religion", "settlement", "nation"];
  const PLACES = ["settlement", "location", "region", "tavern", "shop", "dungeon", "landmark", "nation", "continent"];

  const recapLines: string[] = [];
  const statusDone = new Set<string>();
  const repDone = new Map<string, number>();

  // Mystery clue matching.
  const mysteryRows = await db.select({ id: mysteries.entityId }).from(mysteries).innerJoin(entities, eq(entities.id, mysteries.entityId)).where(eq(entities.worldId, opts.worldId));
  const clueRows = mysteryRows.length
    ? await db.select().from(clues).where(and(inArray(clues.mysteryId, mysteryRows.map((m) => m.id)), eq(clues.discovered, false)))
    : [];

  for (const l of perLine) {
    const t = l.text;
    if (!t) continue;
    const people = ofType(l.ids, PEOPLE);
    const groups = ofType(l.ids, GROUPS);
    const places = ofType(l.ids, PLACES);
    const quests = ofType(l.ids, ["quest"]);

    if (RULES.notable.test(t) || l.ids.length) recapLines.push(t);

    if (RULES.notable.test(t) && t.length > 12) {
      cs.events.push({
        ref: null,
        title: t.length > 70 ? t.slice(0, 67).replace(/\s+\S*$/, "") + "…" : t,
        summary: t,
        kind: "campaign",
        offsetDays: 0,
        yearsAgo: null,
        location: places[0] ? ref(places[0]) : null,
        involved: l.ids.filter((i) => !places.slice(0, 1).includes(i)).slice(0, 6).map(ref),
        visibility: "discovered",
        rationale: `Session ${opts.sessionNumber} notes.`,
      });
    }

    for (const p of people) {
      if (statusDone.has(p)) continue;
      const name = byId.get(p)!.name.toLowerCase();
      // Require the verb near the name to avoid "X killed Y" marking X dead: prefer the object of the verb.
      const after = t.toLowerCase().split(name)[0] ?? "";
      if (RULES.death.test(t) && (RULES.death.test(after) || /\b(died|dies|perished|is dead|was killed|was slain)\b/i.test(t))) {
        cs.campaignStates.push({ entity: ref(p), status: "dead", location: null, reputationDelta: null, attitude: null, playersDiscovered: false, rationale: `Notes: “${t}”` });
        statusDone.add(p);
      } else if (RULES.captured.test(t) && RULES.captured.test(after)) {
        cs.campaignStates.push({ entity: ref(p), status: "imprisoned", location: null, reputationDelta: null, attitude: null, playersDiscovered: false, rationale: `Notes: “${t}”` });
        statusDone.add(p);
      } else if (RULES.missing.test(t)) {
        cs.campaignStates.push({ entity: ref(p), status: "missing", location: null, reputationDelta: null, attitude: null, playersDiscovered: false, rationale: `Notes: “${t}”` });
        statusDone.add(p);
      }
    }

    for (const x of [...people.filter((p) => byId.get(p)?.type === "npc"), ...groups]) {
      let delta = 0;
      let attitude: string | null = null;
      if (RULES.helped.test(t)) [delta, attitude] = [15, "grateful"];
      if (RULES.harmed.test(t)) [delta, attitude] = [-20, "resentful"];
      if (!delta && RULES.hostile.test(t)) [delta, attitude] = [-15, "hostile"];
      if (!delta && RULES.friendly.test(t)) [delta, attitude] = [10, "friendly"];
      if (delta && !repDone.has(x)) {
        repDone.set(x, delta);
        cs.campaignStates.push({ entity: ref(x), status: null, location: null, reputationDelta: delta, attitude, playersDiscovered: false, rationale: `Notes: “${t}”` });
      }
    }

    if (RULES.promise.test(t) && people.length) {
      const actor = people.find((p) => byId.get(p)?.type === "npc") ?? people[0]!;
      cs.consequences.push({
        kind: "promise",
        title: t.length > 80 ? t.slice(0, 77) + "…" : t,
        description: t,
        cause: `Session ${opts.sessionNumber}`,
        actor: ref(actor),
        severity: 2,
        dueInDays: dueDays(t),
        rationale: "A commitment was made; Worldloom will remind you when it's due.",
      });
    }

    for (const q of quests) {
      const status = RULES.questDone.test(t) ? "completed" : RULES.questFail.test(t) ? "failed" : RULES.questStart.test(t) ? "active" : null;
      if (status) cs.questUpdates.push({ quest: ref(q), status, completedObjectives: [], failedObjectives: [], newObjectives: [], rationale: `Notes: “${t}”` });
    }
    // "Accepted the Sun Crown quest" with no quest of that name yet: draft one.
    const nq = !quests.length ? t.match(RULES.newQuest) : null;
    if (nq) {
      const title = nq[1]!.replace(/^((the|a|an|their|this|that|his|her|our|my|your|its|another|some)\s+)+/i, "").replace(/^\w/, (c) => c.toUpperCase());
      const qref = `quest-${title.toLowerCase().replace(/\W+/g, "-")}`;
      const determiner = /^(the|a|an|their|this|that|his|her|our|my|your|its|another|some|new|same)$/i.test(title);
      if (title.length >= 3 && !determiner && !cs.newEntities.some((e) => e.ref === qref)) {
        const giver = people.find((p) => byId.get(p)?.type === "npc");
        cs.newEntities.push({
          ref: qref,
          type: "quest",
          name: title,
          summary: t,
          body: `Accepted in session ${opts.sessionNumber}${giver ? `, from ${byId.get(giver)!.name}` : ""}.`,
          status: null,
          location: places[0] ? ref(places[0]) : null,
          fields: [],
          tags: [],
          aliases: [],
          visibility: "public",
          importance: 0,
          rationale: "The party took on a quest that isn't in your world yet.",
        });
        cs.questUpdates.push({ quest: { id: null, ref: qref, name: title }, status: "active", completedObjectives: [], failedObjectives: [], newObjectives: [], rationale: `Notes: “${t}”` });
      }
    }

    if (RULES.learned.test(t)) {
      for (const id of l.ids) {
        const e = byId.get(id);
        if (e && ["secret", "partially_known"].includes(e.visibility)) {
          cs.campaignStates.push({ entity: ref(id), status: null, location: null, reputationDelta: null, attitude: null, playersDiscovered: true, rationale: `The party learned about ${e.name}.` });
        }
      }
      const words = new Set(t.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
      for (const c of clueRows) {
        const cw = c.description.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
        const overlap = cw.filter((w) => words.has(w)).length;
        if (cw.length && overlap / cw.length >= 0.4) cs.clueUpdates.push({ clueId: c.id, discovered: true, rationale: `Matches notes: “${t}”` });
      }
    }

    const g = t.match(RULES.gained);
    if (g && !people.length) cs.inventoryAdd.push(g[2]!.trim());
    const lo = t.match(RULES.lost);
    if (lo) cs.inventoryRemove.push(lo[2]!.trim());

    if (RULES.moved.test(t) && places.length) {
      for (const p of people.filter((x) => byId.get(x)?.type === "npc")) {
        cs.campaignStates.push({ entity: ref(p), status: null, location: ref(places[places.length - 1]!), reputationDelta: null, attitude: null, playersDiscovered: false, rationale: `Notes: “${t}”` });
      }
    }
  }

  for (const [name, line] of unresolvedNew) {
    const ref = `new-${name.toLowerCase().replace(/\W+/g, "-")}`;
    cs.newEntities.push({
      ref,
      type: "npc",
      name,
      summary: `Met in session ${opts.sessionNumber}.`,
      body: `First appearance: ${line}`,
      status: "alive",
      location: null,
      fields: [],
      tags: [],
      aliases: [],
      visibility: "discovered",
      importance: 0,
      rationale: "Mentioned with @ but not yet in your world.",
    });
  }

  const recap = recapLines.slice(0, 12);
  cs.recap = recap.length ? recap.map((l) => `- ${l}`).join("\n") : null;
  const counts = [
    cs.events.length && `${cs.events.length} events`,
    cs.campaignStates.length && `${cs.campaignStates.length} character/faction changes`,
    cs.consequences.length && `${cs.consequences.length} promises`,
    cs.questUpdates.length && `${cs.questUpdates.length} quest updates`,
    cs.newEntities.length && `${cs.newEntities.length} new characters`,
  ].filter(Boolean);
  cs.summary = counts.length
    ? `Found ${counts.join(", ")} in the notes. Rule-based analysis: review carefully, or connect an AI model for a deeper read.`
    : "No clear changes found. Use @mentions for people and places in your notes so Worldloom can link them.";
  return cs;
}
