/**
 * Offline assistant answers. Routes common DM questions to the deterministic
 * insight services so the copilot is useful without a model, and answers
 * everything else by surfacing the most relevant records.
 */
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { entities, proposalBatches } from "@/server/db/schema";
import { describeDuration, formatDate } from "@/lib/calendar";
import { getEntityType } from "@/lib/entity-types";
import { mentionToken, mentionsToPlain } from "@/lib/mentions";
import { truncate } from "@/lib/utils";
import { forgottenThreads, unfinishedBusiness, changeLogForBatch } from "@/server/services/insights";
import { listThreads } from "@/server/services/quests";
import { listTimeline } from "@/server/services/timeline";
import { getKnowledgeBoundary } from "@/server/services/knowledge";
import { findNamedEntities, type WorldBundle } from "../context";
import type { Entity } from "@/server/db/schema";

const link = (e: { id: string; name: string }) => mentionToken(e.name, e.id);

export async function offlineAnswer(db: DB, q: string, bundle: WorldBundle, relevant: Entity[]): Promise<string> {
  const worldId = bundle.world.id;
  const cid = bundle.campaign?.id ?? null;
  const ql = q.toLowerCase();

  if (/(elsewhere|happening in the world|world news|going on in the world|meanwhile|what's happening|what is happening)/.test(ql)) {
    const threads = await listThreads(db, worldId, { statuses: ["escalating", "active"] });
    const recent = await listTimeline(db, worldId, { campaignId: cid, to: bundle.now, order: "desc", limit: 6, kinds: ["world", "faction", "historical"] });
    const lines = ["**Elsewhere in the world right now:**", ""];
    for (const t of threads.slice(0, 6)) {
      const stage = t.stages[t.thread.stageIndex];
      lines.push(`- ${link(t)} is **${t.thread.status}** at ${t.thread.progress}%${stage ? ` (${stage.title})` : ""}${t.thread.nextMilestone ? `; next: ${t.thread.nextMilestone}` : ""}.`);
    }
    if (recent.length) {
      lines.push("", "**Recent developments:**");
      for (const e of recent) lines.push(`- ${formatDate(bundle.calendar, e.startAt, { precision: e.precision })}: ${link(e)}${e.location ? ` at ${link(e.location)}` : ""}`);
    }
    if (lines.length <= 2) lines.push("No active world threads yet. Create a world thread to give the world momentum of its own.");
    return lines.join("\n");
  }

  if (cid && /(unfinished business|owe|unresolved|grudge|waiting on|promised)/.test(ql)) {
    const ub = await unfinishedBusiness(db, worldId, cid);
    if (!ub.length) return "Nobody has outstanding business with the party right now: no open promises, pending reactions, or strong grudges on record.";
    return ["**NPCs and factions with unfinished business:**", "", ...ub.map((u) => `- ${link(u)}: ${u.reasons.join("; ")}`)].join("\n");
  }

  if (cid && /(forgot|forgotten|lost track|dropped|neglect|haven't mentioned|resurface)/.test(ql)) {
    const items = await forgottenThreads(db, worldId, cid, bundle.calendar);
    if (!items.length) return "Nothing looks forgotten: active quests, promises and mysteries have all come up recently.";
    return ["**Threads worth resurfacing:**", "", ...items.slice(0, 10).map((i) => `- ${i.title}. ${i.detail}`)].join("\n");
  }

  if (cid && /(what changed|while .*travel|since last|what happened while|changed while)/.test(ql)) {
    const [last] = await db
      .select()
      .from(proposalBatches)
      .where(and(eq(proposalBatches.worldId, worldId), eq(proposalBatches.campaignId, cid), eq(proposalBatches.source, "advance")))
      .orderBy(desc(proposalBatches.createdAt))
      .limit(1);
    if (!last) return "The world hasn't been advanced yet in this campaign. Use **Advance time** (in the clock menu) to simulate what happens while the party travels or rests.";
    const log = await changeLogForBatch(db, worldId, last.id);
    const span = last.fromAt !== null && last.toAt !== null ? `${formatDate(bundle.calendar, last.fromAt)} → ${formatDate(bundle.calendar, last.toAt)} (${describeDuration(bundle.calendar, last.toAt - last.fromAt)})` : "";
    return [`**Last time the world advanced** ${span}:`, "", last.summary, "", ...(log?.revisions ?? []).slice(0, 15).map((r) => `- ${r.summary}`)].join("\n");
  }

  const knowMatch = ql.match(/what (?:does|do) (.+?) (?:know|believe|think)/);
  if (knowMatch) {
    const ids = await findNamedEntities(db, worldId, knowMatch[1]!, cid, 1);
    if (ids[0]) {
      const [e] = await db.select().from(entities).where(eq(entities.id, ids[0]));
      const kb = await getKnowledgeBoundary(db, worldId, ids[0], cid);
      if (!kb.own.length && !kb.viaGroups.length) return `No knowledge is recorded for ${link(e!)} yet. Add facts on their page (Knowledge tab) so roleplay respects what they know.`;
      return [
        `**What ${link(e!)} knows or believes:**`,
        "",
        ...kb.own.map((f) => `- ${f.fact.statement}${f.fact.truthStatus === "false" ? " _(false belief)_" : f.fact.truthStatus === "partial" ? " _(partial)_" : ""}`),
        ...(kb.viaGroups.length ? ["", "_Through their circles:_", ...kb.viaGroups.map((f) => `- ${f.fact.statement} (${f.holderName})`)] : []),
      ].join("\n");
    }
  }

  // Default: describe the most relevant records.
  if (!relevant.length) {
    return `I couldn't find anything in your world records about that. Try naming a person, place or faction, or ask “what is happening elsewhere?”, “what plot threads have I forgotten?”, or “who has unfinished business with the party?”.\n\n_Offline mode: answers come straight from your records. Add an Anthropic API key for free-form reasoning._`;
  }
  const lines = ["Here's what your records say:", ""];
  for (const e of relevant.slice(0, 5)) {
    const def = getEntityType(e.type);
    lines.push(`**${link(e)}** · ${def.label}${e.status ? ` · ${e.status}` : ""}`);
    if (e.summary) lines.push(e.summary);
    else if (e.body) lines.push(truncate(mentionsToPlain(e.body).replace(/:::dm[\s\S]*?:::/g, "").trim(), 240));
    lines.push("");
  }
  lines.push("_Offline mode: answers come straight from your records. Add an Anthropic API key for free-form reasoning._");
  return lines.join("\n");
}
