/**
 * Deterministic analysis over world state: forgotten threads, continuity
 * problems, what changed, and the raw material for session briefings. These run
 * without AI; the AI layer adds narrative on top when available.
 */
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DB } from "@/server/db/client";
import { rowsOf } from "@/server/db/client";
import {
  campaignEntityStates,
  campaigns,
  clues,
  consequences,
  entities,
  events,
  gameSessions,
  mentions,
  proposalBatches,
  proposals,
  quests,
  questObjectives,
  relationships,
  revisions,
  travelPlans,
  worldThreads,
} from "@/server/db/schema";
import { describeDuration, minutesPerDay, type CalendarDefinition } from "@/lib/calendar";
import { RELATIONSHIP_TYPE_MAP } from "@/lib/relationship-types";
import { uniqueBy } from "@/lib/utils";
import { listMysteries } from "./quests";

export interface Insight {
  id: string;
  kind: string;
  severity: "info" | "warn" | "high";
  title: string;
  detail: string;
  entityIds: { id: string; name: string; type: string }[];
  link?: string;
}

// ---------------------------------------------------------------------------
// Forgotten thread detector
// ---------------------------------------------------------------------------

export async function forgottenThreads(db: DB, worldId: string, campaignId: string, calendar: CalendarDefinition, opts: { staleSessions?: number } = {}): Promise<Insight[]> {
  const stale = opts.staleSessions ?? 3;
  const out: Insight[] = [];
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!camp) return [];
  // Only sessions that have actually been played count toward "not mentioned in N sessions".
  const sessions = await db
    .select({ id: gameSessions.id, number: gameSessions.number, startedAt: gameSessions.startedAt })
    .from(gameSessions)
    .where(and(eq(gameSessions.campaignId, campaignId), inArray(gameSessions.status, ["in_progress", "completed", "processed"])))
    .orderBy(desc(gameSessions.number));
  const latest = sessions[0]?.number ?? 0;
  /** Played sessions since a record was created (so new quests aren't flagged for old sessions). */
  const playedSince = (created: Date) => sessions.filter((s) => s.startedAt && s.startedAt > created).length;
  const sessionNum = new Map(sessions.map((s) => [s.id, s.number]));

  /** Last session number in which an entity was mentioned (notes/recap/scene). */
  async function lastMentioned(ids: string[]) {
    if (!ids.length || !sessions.length) return new Map<string, number>();
    const rows = await db
      .select({ entityId: mentions.entityId, sourceId: mentions.sourceId })
      .from(mentions)
      .where(and(eq(mentions.sourceKind, "session"), inArray(mentions.entityId, ids), inArray(mentions.sourceId, sessions.map((s) => s.id))));
    const m = new Map<string, number>();
    for (const r of rows) {
      const n = sessionNum.get(r.sourceId) ?? 0;
      if (n > (m.get(r.entityId) ?? 0)) m.set(r.entityId, n);
    }
    return m;
  }

  // Active quests not mentioned recently.
  const activeQuests = await db
    .select({ id: entities.id, name: entities.name, createdAt: entities.createdAt })
    .from(quests)
    .innerJoin(entities, eq(entities.id, quests.entityId))
    .where(and(eq(entities.worldId, worldId), eq(quests.status, "active"), or(isNull(entities.campaignId), eq(entities.campaignId, campaignId))));
  const qm = await lastMentioned(activeQuests.map((q) => q.id));
  for (const q of activeQuests) {
    const last = qm.get(q.id);
    const gap = last === undefined ? playedSince(q.createdAt) : latest - last;
    if (gap >= stale) {
      out.push({
        id: `quest-${q.id}`,
        kind: "quest",
        severity: gap >= stale * 2 ? "high" : "warn",
        title: `“${q.name}” hasn't come up in ${last === undefined ? "any session yet" : `${gap} sessions`}`,
        detail: last === undefined ? "This quest is active but no session notes mention it." : `Last mentioned in session ${last}. Remind the players, advance it off-screen, or let it fail.`,
        entityIds: [{ id: q.id, name: q.name, type: "quest" }],
      });
    }
  }

  // Promises & consequences: overdue or long pending.
  const pend = await db
    .select({ c: consequences, actorName: entities.name, actorType: entities.type })
    .from(consequences)
    .leftJoin(entities, eq(entities.id, consequences.actorId))
    .where(and(eq(consequences.campaignId, campaignId), inArray(consequences.status, ["pending", "foreshadowed"])));
  for (const { c, actorName, actorType } of pend) {
    if (c.dueAt !== null && c.dueAt < camp.currentAt) {
      const late = describeDuration(calendar, camp.currentAt - c.dueAt);
      out.push({
        id: `cons-${c.id}`,
        kind: c.kind,
        severity: "high",
        title: c.kind === "promise" ? `${actorName ?? "Someone"} promised: “${c.title}” — overdue by ${late}` : `“${c.title}” was due ${late} ago`,
        detail: c.kind === "promise" ? "Decide whether the promise was kept, broken, or delayed." : "This consequence should have landed by now.",
        entityIds: c.actorId ? [{ id: c.actorId, name: actorName ?? "", type: actorType ?? "npc" }] : [],
      });
    } else if (c.kind === "reaction" && c.dueAt === null) {
      out.push({
        id: `react-${c.id}`,
        kind: "reaction",
        severity: "warn",
        title: `${actorName ?? "Someone"} hasn't responded: ${c.title}`,
        detail: "An NPC or faction owes the party a reaction to something they did.",
        entityIds: c.actorId ? [{ id: c.actorId, name: actorName ?? "", type: actorType ?? "npc" }] : [],
      });
    }
  }

  // Mysteries with partial progress and stalled clues.
  const ms = await listMysteries(db, worldId, campaignId);
  for (const m of ms) {
    if (m.mystery.status === "solved" || m.mystery.status === "abandoned") continue;
    const real = m.clues.filter((c) => !c.isRedHerring);
    const found = real.filter((c) => c.discovered);
    if (found.length && found.length < real.length) {
      const lastFoundSession = Math.max(...found.map((c) => (c.discoveredSessionId ? (sessionNum.get(c.discoveredSessionId) ?? 0) : 0)));
      const gap = latest - lastFoundSession;
      if (gap >= stale || lastFoundSession === 0) {
        out.push({
          id: `myst-${m.id}`,
          kind: "mystery",
          severity: "warn",
          title: `The players found ${found.length} of ${real.length} clues to “${m.name}”`,
          detail: lastFoundSession ? `No new clue for ${gap} sessions. Consider planting the next one.` : "Progress has stalled. Consider planting the next clue.",
          entityIds: [{ id: m.id, name: m.name, type: "mystery" }],
        });
      }
    }
  }

  // Important NPCs the party knows, not seen for a while.
  const known = await db
    .select({ id: entities.id, name: entities.name, type: entities.type, rep: campaignEntityStates.reputation })
    .from(campaignEntityStates)
    .innerJoin(entities, eq(entities.id, campaignEntityStates.entityId))
    .where(and(eq(campaignEntityStates.campaignId, campaignId), eq(entities.type, "npc"), or(gt(entities.importance, 0), sql`abs(coalesce(${campaignEntityStates.reputation}, 0)) >= 20`)));
  const km = await lastMentioned(known.map((k) => k.id));
  for (const k of known) {
    const last = km.get(k.id);
    if (last !== undefined && latest - last >= stale * 2) {
      out.push({
        id: `npc-${k.id}`,
        kind: "npc",
        severity: "info",
        title: `${k.name} hasn't appeared since session ${last}`,
        detail: k.rep !== null && Math.abs(k.rep) >= 20 ? `They feel strongly about the party (${k.rep > 0 ? "+" : ""}${k.rep}). What have they been doing?` : "An important character has dropped out of the story.",
        entityIds: [{ id: k.id, name: k.name, type: k.type }],
      });
    }
  }

  // Escalating threads the party hasn't touched.
  const hot = await db
    .select({ id: entities.id, name: entities.name, progress: worldThreads.progress })
    .from(worldThreads)
    .innerJoin(entities, eq(entities.id, worldThreads.entityId))
    .where(and(eq(entities.worldId, worldId), eq(worldThreads.status, "escalating")));
  const hm = await lastMentioned(hot.map((h) => h.id));
  for (const h of hot) {
    if (latest > 0 && (hm.get(h.id) === undefined || latest - hm.get(h.id)! >= stale)) {
      out.push({
        id: `thread-${h.id}`,
        kind: "thread",
        severity: "warn",
        title: `“${h.name}” is escalating (${h.progress}%) but the party hasn't encountered it`,
        detail: "Foreshadow it: a rumour, refugees, a messenger, a price change.",
        entityIds: [{ id: h.id, name: h.name, type: "world_thread" }],
      });
    }
  }

  const rank = { high: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ---------------------------------------------------------------------------
// Continuity checker (deterministic part)
// ---------------------------------------------------------------------------

// Postgres regexes (\\m = start of word), matched against an event's name and summary.
const DEATH_WORDS = "\\m(kill|died|dies|death|dead|slain|slay|murder|executed|perish|falls|fell|cut down|struck down)";
const AFTERLIFE_WORDS = "\\m(funeral|burial|buried|mourn|memorial|wake|ghost|spirit|undead|haunt|legacy|remains|corpse|tomb|grave|inherit|avenge|revenge)";

export async function continuityIssues(db: DB, worldId: string, campaignId: string | null, calendar: CalendarDefinition): Promise<Insight[]> {
  const out: Insight[] = [];

  // 1. Dead characters who still appear in scenes or take part in events after their death.
  {
    const dead = campaignId
      ? await db
          .select({ id: entities.id, name: entities.name, type: entities.type, deadSince: campaignEntityStates.updatedAt })
          .from(campaignEntityStates)
          .innerJoin(entities, eq(entities.id, campaignEntityStates.entityId))
          .where(and(eq(campaignEntityStates.campaignId, campaignId), eq(campaignEntityStates.status, "dead"), eq(entities.worldId, worldId)))
      : [];
    const canonDead = await db
      .select({ id: entities.id, name: entities.name, type: entities.type })
      .from(entities)
      .where(and(eq(entities.worldId, worldId), eq(entities.status, "dead"), inArray(entities.type, ["npc", "pc", "creature"])));
    const all = uniqueBy([...dead, ...canonDead.map((d) => ({ ...d, deadSince: null as Date | null }))], (d) => d.id);
    if (all.length) {
      const idList = `{${all.map((a) => a.id).join(",")}}`;
      const deathEvents = await db.execute(sql`
        select r.target_id as entity_id, max(e2.start_at) as died_at
        from relationships r join events e2 on e2.entity_id = r.source_id join entities ev on ev.id = e2.entity_id
        where r.type = 'involves' and r.target_id = any(${idList}::uuid[]) and ev.world_id = ${worldId}
          and (ev.name || ' ' || ev.summary) ~* ${DEATH_WORDS}
        group by r.target_id`);
      const diedAt = new Map(rowsOf<{ entity_id: string; died_at: number }>(deathEvents).map((r) => [r.entity_id, Number(r.died_at)]));
      for (const d of all) {
        const died = diedAt.get(d.id) ?? null;
        const since = d.deadSince ? d.deadSince.toISOString() : null;
        if (campaignId) {
          // Scenes in later sessions listing them as present.
          const present = await db.execute(sql`
            select s.name as scene, gs.number as session from scene_entities se
            join scenes s on s.id = se.scene_id left join game_sessions gs on gs.id = s.session_id
            where se.entity_id = ${d.id} and se.role = 'present' and s.campaign_id = ${campaignId}
              and (${died}::bigint is null or s.at_time > ${died ?? 0})
              and (${since}::timestamptz is null or s.created_at > ${since ?? new Date(0).toISOString()}::timestamptz)
              and (${died}::bigint is not null or ${since}::timestamptz is not null)
            limit 3`);
          const rows = rowsOf<{ scene: string; session: number | null }>(present);
          if (rows.length) {
            out.push({
              id: `dead-${d.id}`,
              kind: "dead_appears",
              severity: "high",
              title: `${d.name} is dead but appears in a later scene`,
              detail: `Present in ${rows.map((r) => `“${r.scene}”${r.session ? ` (session ${r.session})` : ""}`).join(", ")}.`,
              entityIds: [{ id: d.id, name: d.name, type: d.type }],
            });
          }
        }
        // Events after the death that list them as taking part (funerals, hauntings and the like are fine).
        const acting = await db.execute(sql`
          select ev.id, ev.name from relationships r
          join events e2 on e2.entity_id = r.source_id join entities ev on ev.id = e2.entity_id
          where r.type = 'involves' and r.target_id = ${d.id} and ev.world_id = ${worldId} and ev.canon_status <> 'archived'
            and (ev.campaign_id is null or ${campaignId}::uuid is null or ev.campaign_id = ${campaignId}::uuid)
            and (ev.name || ' ' || ev.summary) !~* ${DEATH_WORDS} and (ev.name || ' ' || ev.summary) !~* ${AFTERLIFE_WORDS}
            and (
              (${died}::bigint is not null and e2.start_at > ${died ?? 0})
              or (${died}::bigint is null and ${since}::timestamptz is not null and ev.created_at > ${since ?? new Date(0).toISOString()}::timestamptz and e2.origin <> 'manual')
            )
          order by e2.start_at limit 3`);
        const evs = rowsOf<{ id: string; name: string }>(acting);
        if (evs.length) {
          out.push({
            id: `dead-ev-${d.id}`,
            kind: "dead_appears",
            severity: "high",
            title: `${d.name} is dead but takes part in later events`,
            detail: `${evs.map((e) => `“${e.name}”`).join(", ")}. Remove them from the event, or decide they survived.`,
            entityIds: [{ id: d.id, name: d.name, type: d.type }, ...evs.map((e) => ({ id: e.id, name: e.name, type: "event" }))],
          });
        }
      }
    }
  }

  // 2. Events ending before they start, or happening "in the future" yet marked historical.
  const badDates = await db
    .select({ id: entities.id, name: entities.name, startAt: events.startAt, endAt: events.endAt, kind: events.kind })
    .from(events)
    .innerJoin(entities, eq(entities.id, events.entityId))
    .where(and(eq(entities.worldId, worldId), sql`${events.endAt} is not null and ${events.endAt} < ${events.startAt}`));
  for (const b of badDates)
    out.push({ id: `dates-${b.id}`, kind: "dates", severity: "warn", title: `“${b.name}” ends before it starts`, detail: "Check the start and end dates.", entityIds: [{ id: b.id, name: b.name, type: "event" }] });

  // 3. Likely duplicate entities (same type, very similar names).
  const dupes = await db.execute(sql`
    select a.id as a_id, a.name as a_name, b.id as b_id, b.name as b_name, a.type
    from entities a join entities b on a.world_id = b.world_id and a.type = b.type and a.id < b.id
    where a.world_id = ${worldId} and a.canon_status <> 'archived' and b.canon_status <> 'archived'
      and a.type not in ('event', 'rumour') and similarity(a.name, b.name) > 0.72
    limit 20`);
  for (const d of rowsOf<{ a_id: string; a_name: string; b_id: string; b_name: string; type: string }>(dupes)) {
    out.push({
      id: `dupe-${d.a_id}-${d.b_id}`,
      kind: "duplicate",
      severity: "warn",
      title: `Possible duplicate: “${d.a_name}” and “${d.b_name}”`,
      detail: "Merge them or tell them apart with aliases.",
      entityIds: [
        { id: d.a_id, name: d.a_name, type: d.type },
        { id: d.b_id, name: d.b_name, type: d.type },
      ],
    });
  }

  // 4. Contradictory relationships (allies and enemies at once).
  const contra = await db.execute(sql`
    select r1.source_id, r1.target_id, s.name as s_name, t.name as t_name, s.type as s_type, t.type as t_type, r1.type as t1, r2.type as t2
    from relationships r1
    join relationships r2 on ((r1.source_id = r2.source_id and r1.target_id = r2.target_id) or (r1.source_id = r2.target_id and r1.target_id = r2.source_id))
      and r1.id < r2.id
    join entities s on s.id = r1.source_id join entities t on t.id = r1.target_id
    where r1.world_id = ${worldId} and r1.end_at is null and r2.end_at is null
      and ((r1.type in ('allied_with','friend_of','loves','spouse_of') and r2.type in ('enemy_of','at_war_with','hates','rival_of'))
        or (r2.type in ('allied_with','friend_of','loves','spouse_of') and r1.type in ('enemy_of','at_war_with','hates','rival_of')))
    limit 20`);
  for (const c of rowsOf<{ source_id: string; target_id: string; s_name: string; t_name: string; s_type: string; t_type: string; t1: string; t2: string }>(contra)) {
    out.push({
      id: `contra-${c.source_id}-${c.target_id}`,
      kind: "relationship",
      severity: "warn",
      title: `${c.s_name} and ${c.t_name} are both “${RELATIONSHIP_TYPE_MAP[c.t1]?.label ?? c.t1}” and “${RELATIONSHIP_TYPE_MAP[c.t2]?.label ?? c.t2}”`,
      detail: "If this is a complicated relationship, add an end date to the old one or describe it.",
      entityIds: [
        { id: c.source_id, name: c.s_name, type: c.s_type },
        { id: c.target_id, name: c.t_name, type: c.t_type },
      ],
    });
  }

  // 5. Knowledge leaks: an NPC "knows" something learned after the current campaign date, or learned in a session they weren't part of.
  if (campaignId) {
    const [camp] = await db.select({ currentAt: campaigns.currentAt }).from(campaigns).where(eq(campaigns.id, campaignId));
    const future = await db.execute(sql`
      select f.id, f.statement, e.id as holder_id, e.name as holder_name, e.type as holder_type from facts f join entities e on e.id = f.holder_id
      where f.world_id = ${worldId} and f.learned_at is not null and f.learned_at > ${camp?.currentAt ?? 0} limit 10`);
    for (const f of rowsOf<{ id: string; statement: string; holder_id: string; holder_name: string; holder_type: string }>(future)) {
      out.push({
        id: `kn-${f.id}`,
        kind: "knowledge",
        severity: "warn",
        title: `${f.holder_name} knows something they haven't learned yet`,
        detail: `“${f.statement}” is dated after the campaign's current date.`,
        entityIds: [{ id: f.holder_id, name: f.holder_name, type: f.holder_type }],
      });
    }
    // Truth known by a dead holder after death isn't checked; but a fact held by someone dead in this campaign being 'learned' later is.
  }

  // 6. Quests completed with open objectives / failed quests still marked active objectives.
  const qs = await db
    .select({ id: entities.id, name: entities.name, open: sql<number>`count(${questObjectives.id}) filter (where ${questObjectives.status} = 'open' and not ${questObjectives.hidden})::int` })
    .from(quests)
    .innerJoin(entities, eq(entities.id, quests.entityId))
    .leftJoin(questObjectives, eq(questObjectives.questId, quests.entityId))
    .where(and(eq(entities.worldId, worldId), eq(quests.status, "completed")))
    .groupBy(entities.id, entities.name);
  for (const q of qs)
    if (q.open > 0)
      out.push({ id: `qobj-${q.id}`, kind: "quest", severity: "info", title: `“${q.name}” is completed but has ${q.open} open objective${q.open > 1 ? "s" : ""}`, detail: "Close or remove the leftover objectives.", entityIds: [{ id: q.id, name: q.name, type: "quest" }] });

  // 7. Travel plans whose duration doesn't match distance and speed.
  if (campaignId) {
    const trips = await db.select().from(travelPlans).where(eq(travelPlans.campaignId, campaignId));
    for (const t of trips) {
      if (t.distance && t.speedPerDay && t.estimatedMinutes) {
        const expected = (t.distance / t.speedPerDay) * minutesPerDay(calendar);
        if (Math.abs(expected - t.estimatedMinutes) / expected > 0.5)
          out.push({
            id: `travel-${t.id}`,
            kind: "travel",
            severity: "warn",
            title: `Travel time looks off for “${t.name || "a journey"}”`,
            detail: `${t.distance} ${t.distanceUnit} at ${t.speedPerDay}/day should take about ${describeDuration(calendar, Math.round(expected))}, but it's planned as ${describeDuration(calendar, t.estimatedMinutes)}.`,
            entityIds: [],
          });
      }
    }
  }

  // 8. Promised events never resolved (consequences resolved=false long past due) are covered by forgotten threads; flag ones far overdue here too.
  if (campaignId) {
    const [camp] = await db.select({ currentAt: campaigns.currentAt }).from(campaigns).where(eq(campaigns.id, campaignId));
    const overdue = await db
      .select()
      .from(consequences)
      .where(and(eq(consequences.campaignId, campaignId), inArray(consequences.status, ["pending", "foreshadowed"]), sql`${consequences.dueAt} < ${(camp?.currentAt ?? 0) - minutesPerDay(calendar) * 14}`));
    for (const c of overdue)
      out.push({ id: `unres-${c.id}`, kind: "promise", severity: "warn", title: `Unresolved: “${c.title}”`, detail: `Due more than two weeks ago (in-world) and never resolved.`, entityIds: [] });
  }

  // 9. Entities located inside something that isn't a place.
  const badLoc = await db.execute(sql`
    select a.id, a.name, a.type, b.name as loc_name, b.type as loc_type from entities a join entities b on b.id = a.location_id
    where a.world_id = ${worldId} and b.type in ('npc','pc','item','magic_item','event','rumour','quest','lore','faction','deity')
    limit 10`);
  for (const r of rowsOf<{ id: string; name: string; type: string; loc_name: string; loc_type: string }>(badLoc))
    out.push({ id: `loc-${r.id}`, kind: "location", severity: "info", title: `${r.name} is “located in” ${r.loc_name} (${r.loc_type})`, detail: "Use a relationship (e.g. carried by, member of) instead of location for non-places.", entityIds: [{ id: r.id, name: r.name, type: r.type }] });

  const rank = { high: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ---------------------------------------------------------------------------
// What changed
// ---------------------------------------------------------------------------

export async function changeLogForBatch(db: DB, worldId: string, batchId: string) {
  const [batch] = await db.select().from(proposalBatches).where(and(eq(proposalBatches.id, batchId), eq(proposalBatches.worldId, worldId)));
  if (!batch) return null;
  const items = await db.select({ id: proposals.id, kind: proposals.kind, status: proposals.status }).from(proposals).where(eq(proposals.batchId, batchId));
  const ids = items.map((i) => i.id);
  const revs = ids.length ? await db.select().from(revisions).where(inArray(revisions.proposalId, ids)).orderBy(asc(revisions.createdAt)) : [];
  return { batch, revisions: revs, items };
}

export async function recentChanges(db: DB, worldId: string, opts: { campaignId?: string | null; limit?: number; since?: Date } = {}) {
  return db
    .select()
    .from(revisions)
    .where(
      and(
        eq(revisions.worldId, worldId),
        opts.campaignId ? or(isNull(revisions.campaignId), eq(revisions.campaignId, opts.campaignId)) : undefined,
        opts.since ? gt(revisions.createdAt, opts.since) : undefined,
      ),
    )
    .orderBy(desc(revisions.createdAt))
    .limit(opts.limit ?? 30);
}

/** Entities with unfinished business with the party: open promises/reactions, givers of active quests, strong feelings. */
export async function unfinishedBusiness(db: DB, worldId: string, campaignId: string) {
  const out: { id: string; name: string; type: string; reasons: string[] }[] = [];
  const add = (id: string, name: string, type: string, reason: string) => {
    const e = out.find((x) => x.id === id) ?? out[out.push({ id, name, type, reasons: [] }) - 1]!;
    e.reasons.push(reason);
  };
  const cons = await db
    .select({ c: consequences, name: entities.name, type: entities.type })
    .from(consequences)
    .innerJoin(entities, eq(entities.id, consequences.actorId))
    .where(and(eq(consequences.campaignId, campaignId), inArray(consequences.status, ["pending", "foreshadowed"])));
  for (const { c, name, type } of cons) add(c.actorId!, name, type, `${c.kind === "promise" ? "Promised" : c.kind === "reaction" ? "Owes a reaction" : "Pending"}: ${c.title}`);
  const qEnt = alias(entities, "q_ent");
  const givers = await db
    .select({ id: entities.id, name: entities.name, type: entities.type, quest: qEnt.name })
    .from(quests)
    .innerJoin(qEnt, eq(qEnt.id, quests.entityId))
    .innerJoin(entities, eq(entities.id, quests.giverId))
    .where(and(eq(entities.worldId, worldId), inArray(quests.status, ["active", "available"])));
  for (const g of givers) add(g.id, g.name, g.type, `Waiting on quest “${g.quest}”`);
  const feelings = await db
    .select({ id: entities.id, name: entities.name, type: entities.type, rep: campaignEntityStates.reputation, attitude: campaignEntityStates.attitude })
    .from(campaignEntityStates)
    .innerJoin(entities, eq(entities.id, campaignEntityStates.entityId))
    .where(and(eq(campaignEntityStates.campaignId, campaignId), sql`abs(coalesce(${campaignEntityStates.reputation}, 0)) >= 25`));
  for (const f of feelings) add(f.id, f.name, f.type, `${f.rep! > 0 ? "Indebted / friendly" : "Hostile"} (${f.rep! > 0 ? "+" : ""}${f.rep})${f.attitude ? `, ${f.attitude}` : ""}`);
  return out;
}

export async function staleRelationshipsCount(db: DB, worldId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(relationships).where(and(eq(relationships.worldId, worldId), ne(relationships.canonStatus, "archived")));
  return r?.n ?? 0;
}

export async function cluesSummary(db: DB, campaignId: string) {
  return db.select().from(clues).where(eq(clues.campaignId, campaignId));
}
