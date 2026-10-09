/**
 * Follow-on changes: something big changed about one entry; propose what the rest of the world
 * needs to do about it (successors, reactions, quests and threads that depended on it, rumours,
 * who now knows). Ends in a proposal batch for the DM to review, like every state-changing task.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities } from "@/server/db/schema";
import { buildDmContext, entityCard } from "../context";
import { emptyChangeSet } from "../changeset";
import { Rng, hashSeed } from "../offline/rng";
import { runChangeSetTask, type ChangeSetTaskResult } from "./run";
import { touchesOf } from "@/server/services/follow-on";

export async function followOnChanges(b: { db: DB; worldId: string; campaignId: string | null; userId: string; entityId: string; change: string; campaignOnly: boolean }): Promise<ChangeSetTaskResult> {
  const [e] = await b.db.select().from(entities).where(and(eq(entities.id, b.entityId), eq(entities.worldId, b.worldId)));
  if (!e) throw new Error("That entry no longer exists.");
  const touches = await touchesOf(b.db, b.worldId, e.id);
  const ctx = await buildDmContext(b.db, { worldId: b.worldId, campaignId: b.campaignId, focusIds: [e.id, ...touches.slice(0, 12).map((t) => t.id)], query: `${e.name} ${b.change}`, budgetChars: 26000, maxEntities: 16 });
  const card = await entityCard(b.db, b.worldId, e, { campaignId: b.campaignId, bodyChars: 2500, relLimit: 30 });
  const scope = b.campaignOnly
    ? "This change happened in the campaign only, not in world canon. Keep the follow-ons in the campaign too: campaignStates for statuses and locations, questUpdates, consequences, rumours, facts and threadUpdates. Don't change world canon with entityUpdates."
    : "This is a change to world canon. Use entityUpdates for other entries' new statuses, summaries or locations; new relationships for new roles (a successor leads, an heir rules); newEntities only for someone or something that must exist now (a successor, a claimant).";

  return runChangeSetTask({
    db: b.db,
    worldId: b.worldId,
    campaignId: b.campaignId,
    userId: b.userId,
    source: "follow_on",
    sections: ["entityUpdates", "relationships", "newEntities", "questUpdates", "threadUpdates", "campaignStates", "consequences", "rumours", "facts", "events", "metricChanges"],
    title: `Follow-on: ${b.change.length > 90 ? `${b.change.slice(0, 87)}…` : b.change}`,
    context: `${ctx.text}\n\n# What changed\n${card}\n\nThe DM just made this change: ${b.change}.\nIt touches: ${touches.map((t) => `${t.name} {id:${t.id}}`).join(", ") || "nothing directly"}.`,
    now: ctx.bundle.now,
    calendar: ctx.bundle.calendar,
    instructions: `The change above is already done; don't propose it again. Propose the follow-on changes the rest of the world needs so it stays consistent and alive:
- roles ${e.name} held that someone must now fill (a successor, a new leader, a regent) and who's positioning for them;
- how the factions, nations, people and places tied to ${e.name} react, and what they do next;
- quests, mysteries and world threads that depended on ${e.name}: objectives that fail or change, threads that speed up or stall;
- what happens to anything ${e.name} held, guarded or contained;
- how word spreads (rumours, with how accurate they are) and who now knows the truth (facts).
Only what follows logically from the records: 3 to 10 of the most important changes, each with a one-line rationale. ${scope}`,
    offline: async () => {
      const rng = new Rng(hashSeed(e.id, b.change));
      const cs = emptyChangeSet();
      for (const t of touches.filter((x) => ["npc", "faction", "organization", "nation", "settlement"].includes(x.type)).slice(0, 3)) {
        cs.consequences.push({ kind: "reaction", title: `${t.name} reacts to the news about ${e.name}`, description: `${t.name} ${rng.pick(["moves to fill the gap", "demands to know what happened", "quietly changes their plans", "sees an opportunity"])}.`, cause: b.change, actor: { id: t.id, ref: null, name: t.name }, severity: rng.int(2, 4), dueInDays: rng.int(1, 10), rationale: `${t.name} is tied to ${e.name}.` });
      }
      cs.rumours.push({ title: `News of ${e.name}`, claim: `Word is going around that ${b.change.charAt(0).toLowerCase()}${b.change.slice(1)}.`, truth: b.change, accuracy: rng.int(50, 85), distortion: "The details grow in the telling.", originEvent: null, circulatesIn: [], spreadBy: [], rationale: "News travels." });
      cs.summary = "Rule-based suggestions. Connect Claude for follow-ons reasoned from your world's records.";
      return cs;
    },
  });
}
