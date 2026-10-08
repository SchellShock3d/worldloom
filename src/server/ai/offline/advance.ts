/**
 * Offline world simulation for Advance World. Deterministic for a given span:
 * world threads move by their momentum, stage boundaries become events, due
 * consequences trigger, dormant threads may stir, factions driving threads
 * gain influence, threatened places lose safety, and notable events spawn
 * distorted rumours.
 */
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { consequences, entities, relationships, travelPlans } from "@/server/db/schema";
import { describeDuration, durationToMinutes, minutesPerDay, type CalendarDefinition } from "@/lib/calendar";
import { listThreads } from "@/server/services/quests";
import { emptyChangeSet, type ChangeSet } from "../changeset";
import { Rng, hashSeed } from "./rng";

export async function offlineAdvance(
  db: DB,
  opts: { worldId: string; campaignId: string; fromAt: number; toAt: number; calendar: CalendarDefinition },
): Promise<ChangeSet> {
  const { worldId, campaignId, fromAt, toAt, calendar } = opts;
  const rng = new Rng(hashSeed(worldId, fromAt, toAt));
  const cs = emptyChangeSet();
  const span = toAt - fromAt;
  const spanDays = Math.max(0, span / minutesPerDay(calendar));
  const weeks = span / durationToMinutes(calendar, 1, "weeks");
  const dayIn = () => (spanDays <= 1 ? 0 : rng.int(0, Math.max(0, Math.floor(spanDays) - 1)));
  const highlights: string[] = [];

  const threads = await listThreads(db, worldId, { statuses: ["active", "escalating", "dormant"] });
  const threadIds = threads.map((t) => t.id);
  const threatRows = threadIds.length
    ? await db
        .select({ threadId: relationships.sourceId, id: entities.id, name: entities.name, type: entities.type })
        .from(relationships)
        .innerJoin(entities, eq(entities.id, relationships.targetId))
        .where(and(inArray(relationships.sourceId, threadIds), inArray(relationships.type, ["threatens", "involves"])))
    : [];

  for (const t of threads) {
    const th = t.thread;
    const drivers = t.actors.filter((a) => a.role === "drives" || a.type === "faction");
    const places = threatRows.filter((r) => r.threadId === t.id && ["settlement", "region", "location", "nation"].includes(r.type));
    const placeRef = t.locationId ? { id: t.locationId, ref: null, name: "" } : places[0] ? { id: places[0].id, ref: null, name: places[0].name } : null;

    if (th.status === "dormant") {
      const pStir = 1 - Math.pow(0.88, Math.max(weeks, 0.15));
      if (rng.chance(pStir)) {
        cs.threadUpdates.push({ thread: { id: t.id, ref: null, name: t.name }, progressDelta: rng.int(2, 6), status: "active", nextMilestone: null, rationale: "Dormant threads stir over time." });
        cs.events.push({
          ref: null,
          title: `Signs of stirring: ${t.name}`,
          summary: `After a long quiet, there are signs that “${t.name}” is moving again.`,
          kind: "world",
          offsetDays: dayIn(),
          yearsAgo: null,
          location: placeRef,
          involved: t.actors.slice(0, 4).map((a) => ({ id: a.id, ref: null, name: a.name })),
          visibility: "secret",
          rationale: "A dormant thread woke up.",
        });
        highlights.push(`${t.name} stirs`);
      }
      continue;
    }

    const base = th.momentum * Math.max(weeks, 0) * (th.status === "escalating" ? 1.5 : 1);
    let delta = Math.round(base * (0.6 + rng.float() * 0.8));
    if (delta === 0 && span > 0 && rng.chance(Math.min(0.9, base))) delta = 1;
    if (delta <= 0) continue;
    const newProgress = Math.min(100, th.progress + delta);
    let status: "escalating" | "resolved" | null = null;
    if (newProgress >= 100) status = "resolved";
    else if (th.status === "active" && th.urgency >= 4 && newProgress >= 60) status = "escalating";
    const stagesCount = t.stages.length;
    const oldStage = stagesCount > 1 ? Math.min(stagesCount - 1, Math.floor((th.progress / 100) * stagesCount)) : 0;
    const newStage = stagesCount > 1 ? Math.min(stagesCount - 1, Math.floor((newProgress / 100) * stagesCount)) : 0;
    const nextStage = t.stages[newStage + 1];
    cs.threadUpdates.push({
      thread: { id: t.id, ref: null, name: t.name },
      progressDelta: delta,
      status,
      nextMilestone: newStage > oldStage && nextStage ? nextStage.title : null,
      rationale: `Momentum ${th.momentum}/week over ${describeDuration(calendar, span)}${th.status === "escalating" ? " (escalating)" : ""}.`,
    });

    const involved = t.actors.slice(0, 4).map((a) => ({ id: a.id, ref: null, name: a.name }));
    const evRef = `ev-${t.id.slice(0, 8)}`;
    let created = false;
    if (newStage > oldStage && t.stages[newStage]) {
      const stage = t.stages[newStage]!;
      cs.events.push({
        ref: evRef,
        title: `${t.name}: ${stage.title}`,
        summary: stage.description || `“${t.name}” reaches a new stage: ${stage.title}.`,
        kind: "world",
        offsetDays: dayIn(),
        yearsAgo: null,
        location: placeRef,
        involved,
        visibility: "secret",
        rationale: "The thread crossed a stage boundary.",
      });
      highlights.push(`${t.name} reaches “${stage.title}”`);
      created = true;
    } else if (status === "resolved") {
      cs.events.push({
        ref: evRef,
        title: `${t.name} comes to a head`,
        summary: th.possibleOutcomes ? `Outcome to decide: ${th.possibleOutcomes.split("\n")[0]}` : `“${t.name}” reaches its conclusion.`,
        kind: "world",
        offsetDays: dayIn(),
        yearsAgo: null,
        location: placeRef,
        involved,
        visibility: "secret",
        rationale: "Progress reached 100%.",
      });
      highlights.push(`${t.name} comes to a head`);
      created = true;
    } else if (th.nextMilestoneAt !== null && th.nextMilestoneAt > fromAt && th.nextMilestoneAt <= toAt && th.nextMilestone) {
      cs.events.push({
        ref: evRef,
        title: th.nextMilestone,
        summary: `Scheduled milestone of “${t.name}”.`,
        kind: "world",
        offsetDays: Math.floor((th.nextMilestoneAt - fromAt) / minutesPerDay(calendar)),
        yearsAgo: null,
        location: placeRef,
        involved,
        visibility: "secret",
        rationale: "Its milestone date fell inside this span.",
      });
      highlights.push(th.nextMilestone);
      created = true;
    }
    if (created && placeRef && rng.chance(0.75)) {
      const accuracy = rng.int(25, 85);
      cs.rumours.push({
        title: `Talk of ${t.name.toLowerCase()}`,
        claim: distort(t.name, rng, accuracy),
        truth: `The thread “${t.name}” advanced.`,
        accuracy,
        distortion: accuracy > 60 ? "Broadly right, details muddled." : "Garbled and exaggerated in the retelling.",
        originEvent: { id: null, ref: evRef, name: t.name },
        circulatesIn: [placeRef],
        spreadBy: [],
        rationale: "Word of notable events spreads, imperfectly.",
      });
    }
    for (const d of drivers.slice(0, 2)) {
      cs.metricChanges.push({ entity: { id: d.id, ref: null, name: d.name }, label: "Influence", delta: Math.max(1, Math.ceil(delta / 5)), rationale: `Advancing “${t.name}”.` });
    }
    for (const p of places.slice(0, 2)) {
      cs.metricChanges.push({ entity: { id: p.id, ref: null, name: p.name }, label: "Safety", delta: -Math.max(1, Math.ceil(delta / 6)), rationale: `Threatened by “${t.name}”.` });
    }
  }

  // Consequences and promises that come due.
  const due = await db
    .select()
    .from(consequences)
    .where(and(eq(consequences.worldId, worldId), eq(consequences.campaignId, campaignId), inArray(consequences.status, ["pending", "foreshadowed"]), lte(consequences.dueAt, toAt)));
  for (const c of due) {
    const overdueAlready = c.dueAt !== null && c.dueAt < fromAt;
    cs.consequenceUpdates.push({ consequenceId: c.id, status: "triggered", rationale: overdueAlready ? "It was already overdue." : "Its due date passed during this span." });
    cs.events.push({
      ref: null,
      title: c.kind === "promise" ? `Deadline passes: ${c.title}` : c.title,
      summary: c.description.replace(/@\[([^\]]+)\]\(entity:[^)]+\)/g, "$1") || c.cause,
      kind: "campaign",
      offsetDays: c.dueAt !== null && !overdueAlready ? Math.floor((c.dueAt - fromAt) / minutesPerDay(calendar)) : 0,
      yearsAgo: null,
      location: null,
      involved: c.actorId ? [{ id: c.actorId, ref: null, name: "" }] : [],
      visibility: "secret",
      rationale: c.kind === "promise" ? "Decide whether the promise was kept." : "A consequence of the party's actions lands.",
    });
    highlights.push(c.title);
  }

  // Travel that completes inside the span.
  const trips = await db
    .select()
    .from(travelPlans)
    .where(and(eq(travelPlans.campaignId, campaignId), eq(travelPlans.status, "underway"), sql`${travelPlans.departedAt} + coalesce(${travelPlans.estimatedMinutes}, 0) <= ${toAt}`));
  for (const tr of trips) {
    if (!tr.destinationId) continue;
    cs.events.push({
      ref: null,
      title: `The party arrives${tr.name ? `: ${tr.name}` : ""}`,
      summary: "Journey's end.",
      kind: "campaign",
      offsetDays: Math.max(0, Math.floor(((tr.departedAt ?? fromAt) + (tr.estimatedMinutes ?? 0) - fromAt) / minutesPerDay(calendar))),
      yearsAgo: null,
      location: { id: tr.destinationId, ref: null, name: "" },
      involved: [],
      visibility: "public",
      rationale: "A planned journey completes.",
    });
  }

  cs.summary = highlights.length
    ? `Over ${describeDuration(calendar, span)}: ${highlights.slice(0, 5).join("; ")}${highlights.length > 5 ? `; and ${highlights.length - 5} more` : ""}.`
    : `${describeDuration(calendar, span)} pass quietly. World threads inch forward but nothing reaches a turning point.`;
  return cs;
}

function distort(name: string, rng: Rng, accuracy: number) {
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  if (accuracy > 65) return rng.pick([`They say ${lower} is gathering pace.`, `Travellers report that ${lower} is getting worse.`, `Word is ${lower} has taken a turn.`]);
  if (accuracy > 40) return rng.pick([`Someone swore ${lower} is all over now, but nobody believes them.`, `A drunk claims ${lower} is the work of the crown.`, `Folk say ${lower} is twice as bad as it really is.`]);
  return rng.pick([`An old woman insists ${lower} is a punishment from the gods.`, `They say ${lower} was started by foreigners.`, `Children whisper that ${lower} is a curse from the old ruins.`]);
}
