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

function cleanLine(line: string) {
  return line
    .replace(MENTION_RE, (_m, name: string) => name)
    .replace(/^[\s>*\-•\d.)]+/, "")
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
      if (RULES.helped.test(t)) delta = 15;
      if (RULES.harmed.test(t)) delta = -20;
      if (delta && !repDone.has(x)) {
        repDone.set(x, delta);
        cs.campaignStates.push({ entity: ref(x), status: null, location: null, reputationDelta: delta, attitude: delta > 0 ? "grateful" : "resentful", playersDiscovered: false, rationale: `Notes: “${t}”` });
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
