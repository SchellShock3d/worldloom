import Link from "next/link";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { BookOpen, Clapperboard, Compass, FastForward, History, Inbox, Map as MapIcon, NotebookPen, Sparkles, TriangleAlert, Users } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { entities, entityMetrics, gameSessions, maps } from "@/server/db/schema";
import { getActiveCampaign } from "@/server/context";
import { listThreads } from "@/server/services/quests";
import { listTimeline } from "@/server/services/timeline";
import { recentChanges, forgottenThreads } from "@/server/services/insights";
import { listBatches } from "@/server/services/proposals";
import { listConsequences } from "@/server/services/play";
import { formatDate, describeDuration, timeOfDay } from "@/lib/calendar";
import { timeAgo } from "@/lib/utils";
import { Badge, EmptyState, Meter, Panel, PanelHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { TypeIcon } from "@/components/entity/type-icon";
import { ThreadLine } from "@/components/living/thread-line";
import { QuickActions } from "./quick-actions";

export default async function WorldDashboard({ params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { world, calendar } = await requireWorld(worldId);
  const db = await getDb();
  const { campaign, all: campaigns } = await getActiveCampaign(worldId);
  const now = campaign?.currentAt ?? world.currentAt;
  const base = `/w/${worldId}`;

  const [threads, upcoming, changes, pendingBatches, important, factions, recentLore, lastSession, firstMap, hooks, forgotten] = await Promise.all([
    listThreads(db, worldId, { statuses: ["escalating", "active", "dormant"] }),
    listTimeline(db, worldId, { campaignId: campaign?.id ?? null, from: now, order: "asc", limit: 5 }),
    recentChanges(db, worldId, { campaignId: campaign?.id ?? null, limit: 10 }),
    listBatches(db, worldId, { status: ["pending", "partial"], limit: 5 }),
    db
      .select({ id: entities.id, name: entities.name, type: entities.type, summary: entities.summary, status: entities.status })
      .from(entities)
      .where(and(eq(entities.worldId, worldId), isNull(entities.campaignId), inArray(entities.type, ["settlement", "location", "region", "nation", "dungeon", "landmark"]), ne(entities.canonStatus, "archived")))
      .orderBy(desc(entities.importance), desc(entities.updatedAt))
      .limit(6),
    db
      .select({ id: entities.id, name: entities.name, status: entities.status, summary: entities.summary })
      .from(entities)
      .where(and(eq(entities.worldId, worldId), eq(entities.type, "faction"), ne(entities.canonStatus, "archived"), ne(entities.status, "destroyed")))
      .orderBy(desc(entities.importance), desc(entities.updatedAt))
      .limit(6),
    db
      .select({ id: entities.id, name: entities.name, type: entities.type, updatedAt: entities.updatedAt })
      .from(entities)
      .where(and(eq(entities.worldId, worldId), ne(entities.type, "event"), ne(entities.canonStatus, "archived")))
      .orderBy(desc(entities.updatedAt))
      .limit(6),
    campaign ? db.select().from(gameSessions).where(eq(gameSessions.campaignId, campaign.id)).orderBy(desc(gameSessions.number)).limit(1) : Promise.resolve([]),
    db.select({ id: maps.id, name: maps.name }).from(maps).where(and(eq(maps.worldId, worldId), isNull(maps.parentMapId))).limit(1),
    campaign ? listConsequences(db, worldId, campaign.id, ["pending", "foreshadowed"]) : Promise.resolve([]),
    campaign ? forgottenThreads(db, worldId, campaign.id, calendar) : Promise.resolve([]),
  ]);
  const factionMetrics = factions.length
    ? await db.select().from(entityMetrics).where(and(inArray(entityMetrics.entityId, factions.map((f) => f.id)), eq(entityMetrics.key, "influence")))
    : [];
  const session = lastSession[0];
  const alerts = forgotten.filter((f) => f.severity !== "info").slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-brass">
            {formatDate(calendar, now, { weekday: true })} · {timeOfDay(calendar, now)}
          </p>
          <h1 className="mt-1 font-serif text-4xl font-semibold tracking-[-0.015em]">{world.name}</h1>
          <p className="mt-1 text-md text-muted">{[world.genre, world.tone].filter(Boolean).join(", ")}</p>
        </div>
        {campaign && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href={`${base}/campaigns/${campaign.id}/prepare`}>
                <NotebookPen /> Prepare next session
              </Link>
            </Button>
            <Button asChild variant="primary">
              <Link href={`${base}/campaigns/${campaign.id}/run`}>
                <Clapperboard /> {session?.status === "in_progress" ? "Continue session" : "Run session"}
              </Link>
            </Button>
          </div>
        )}
      </header>

      <QuickActions hasCampaign={!!campaign} campaignId={campaign?.id ?? null} mapId={firstMap[0]?.id ?? null} />

      {(alerts.length > 0 || pendingBatches.length > 0) && (
        <section className="mt-6 grid gap-2 md:grid-cols-2" aria-label="Alerts">
          {pendingBatches.slice(0, 2).map(({ batch, pending }) => (
            <Link key={batch.id} href={`${base}/proposals/${batch.id}`} className="flex items-start gap-3 rounded-lg border border-arcane/25 bg-arcane-soft/50 px-4 py-3 hover:border-arcane/50">
              <Inbox className="mt-0.5 size-4 shrink-0 text-arcane" />
              <span className="min-w-0">
                <span className="block font-medium">{batch.title}</span>
                <span className="block text-sm text-muted">{pending} proposals waiting for review</span>
              </span>
            </Link>
          ))}
          {alerts.map((a) => (
            <Link key={a.id} href={campaign ? `${base}/campaigns/${campaign.id}#insights` : base} className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 hover:border-line-strong">
              <TriangleAlert className={a.severity === "high" ? "mt-0.5 size-4 shrink-0 text-ember" : "mt-0.5 size-4 shrink-0 text-brass"} />
              <span className="min-w-0">
                <span className="block font-medium">{a.title}</span>
                <span className="block text-sm text-muted">{a.detail}</span>
              </span>
            </Link>
          ))}
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel>
            <PanelHeader
              title="World threads"
              description="Ongoing processes that move with or without the party."
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href={`${base}/threads`}>All threads</Link>
                </Button>
              }
            />
            {threads.length ? (
              <ul className="divide-y divide-line">
                {threads.slice(0, 6).map((t) => {
                  const stage = t.stages[t.thread.stageIndex];
                  return (
                    <li key={t.id}>
                      <Link href={`${base}/e/${t.id}`} className="block px-4 py-3 hover:bg-surface-2/60">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate font-medium">{t.name}</span>
                          <span className="shrink-0 text-xs tabular text-muted">
                            {t.thread.status === "escalating" ? <span className="text-ember">Escalating</span> : t.thread.status === "dormant" ? "Dormant" : "Active"} · {t.thread.progress}%
                          </span>
                        </div>
                        <ThreadLine className="mt-2" progress={t.thread.progress} status={t.thread.status} stages={t.stages.length} stageIndex={t.thread.stageIndex} />
                        <p className="mt-1.5 truncate text-xs text-faint">
                          {stage ? `Stage: ${stage.title}` : ""}
                          {t.thread.nextMilestone ? `${stage ? " · " : ""}Next: ${t.thread.nextMilestone}` : ""}
                          {t.thread.nextMilestoneAt !== null && t.thread.nextMilestoneAt > now ? ` (in ${describeDuration(calendar, t.thread.nextMilestoneAt - now)})` : ""}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 pb-4">
                <EmptyState compact title="No world threads yet" action={<Button asChild size="sm" variant="secondary"><Link href={`${base}/threads`}>Create a thread</Link></Button>}>
                  A thread is something happening in the world: an invasion, a plague, a cult's search. Advance World moves them forward.
                </EmptyState>
              </div>
            )}
          </Panel>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel>
              <PanelHeader title="Coming up" icon={<History />} action={<Button asChild variant="ghost" size="sm"><Link href={`${base}/timeline`}>Timeline</Link></Button>} />
              {upcoming.length ? (
                <ul className="px-4 pb-3">
                  {upcoming.map((e) => (
                    <li key={e.id} className="flex gap-3 py-1.5 text-sm">
                      <span className="w-24 shrink-0 tabular text-brass">{formatDate(calendar, e.startAt).split(",")[0]}</span>
                      <Link href={`${base}/e/${e.id}`} className="min-w-0 truncate hover:text-accent">
                        {e.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 pb-4 text-sm text-muted">Nothing scheduled. Add future events to the timeline, or set milestones on world threads.</p>
              )}
            </Panel>
            <Panel>
              <PanelHeader title="Unresolved hooks" icon={<TriangleAlert />} action={campaign && <Button asChild variant="ghost" size="sm"><Link href={`${base}/campaigns/${campaign.id}/consequences`}>All</Link></Button>} />
              {hooks.length ? (
                <ul className="px-4 pb-3">
                  {hooks.slice(0, 5).map(({ c, actorName }) => (
                    <li key={c.id} className="py-1.5 text-sm">
                      <span className="font-medium">{c.title}</span>
                      <span className="block text-xs text-faint">
                        {c.kind}
                        {actorName ? ` · ${actorName}` : ""}
                        {c.dueAt !== null && (c.dueAt < now ? <span className="text-ember"> · overdue</span> : ` · due ${formatDate(calendar, c.dueAt)}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 pb-4 text-sm text-muted">{campaign ? "No pending consequences or promises." : "Start a campaign to track consequences and promises."}</p>
              )}
            </Panel>
          </div>

          <Panel>
            <PanelHeader title="Recent changes" icon={<History />} description="Every edit, approval and simulation step, newest first." />
            {changes.length ? (
              <ul className="divide-y divide-line">
                {changes.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    {r.actorType === "ai" ? <Sparkles className="mt-0.5 size-3.5 shrink-0 text-arcane" aria-label="Approved AI change" /> : <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line-strong" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      {r.targetKind === "entity" && r.action !== "delete" ? (
                        <Link href={`${base}/e/${r.targetId}`} className="hover:text-accent">
                          {r.summary || r.targetLabel}
                        </Link>
                      ) : (
                        r.summary || r.targetLabel
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-faint">{timeAgo(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-sm text-muted">No changes yet.</p>
            )}
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel>
            <PanelHeader title="Campaigns" icon={<Compass />} action={<Button asChild variant="ghost" size="sm"><Link href={`${base}/campaigns/new`}>New</Link></Button>} />
            {campaigns.length ? (
              <ul className="px-2 pb-2">
                {campaigns.map((c) => (
                  <li key={c.id}>
                    <Link href={`${base}/campaigns/${c.id}`} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-surface-2">
                      <Compass className={c.id === campaign?.id ? "size-4 text-brass" : "size-4 text-faint"} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                      <span className="text-xs text-faint">{c.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 pb-4">
                <Button asChild variant="primary" size="sm">
                  <Link href={`${base}/campaigns/new`}>Start your first campaign</Link>
                </Button>
              </div>
            )}
            {session && campaign && (
              <div className="mx-4 mb-4 rounded-md border border-line bg-surface-2 px-3 py-2.5">
                <p className="text-xs text-faint">Latest session</p>
                <Link href={`${base}/campaigns/${campaign.id}/sessions/${session.id}`} className="font-medium hover:text-accent">
                  Session {session.number}
                  {session.title ? `: ${session.title}` : ""}
                </Link>
                <p className="text-xs text-muted">{session.status.replace("_", " ")}</p>
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Important places" icon={<MapIcon />} action={<Button asChild variant="ghost" size="sm"><Link href={`${base}/locations`}>All</Link></Button>} />
            {important.length ? (
              <ul className="px-2 pb-2">
                {important.map((e) => (
                  <li key={e.id}>
                    <Link href={`${base}/e/${e.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                      <TypeIcon type={e.type} />
                      <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
                      {e.status && !["stable", "thriving"].includes(e.status) && <Badge tone={["troubled", "declining", "occupied"].includes(e.status) ? "brass" : "neutral"}>{e.status}</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-sm text-muted">No places yet.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Active factions" icon={<Users />} action={<Button asChild variant="ghost" size="sm"><Link href={`${base}/factions`}>All</Link></Button>} />
            {factions.length ? (
              <ul className="px-4 pb-3">
                {factions.map((f) => {
                  const inf = factionMetrics.find((m) => m.entityId === f.id);
                  return (
                    <li key={f.id} className="py-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`${base}/e/${f.id}`} className="min-w-0 truncate hover:text-accent">
                          {f.name}
                        </Link>
                        <span className="shrink-0 text-xs text-faint">{f.status}</span>
                      </div>
                      {inf && <Meter value={inf.value} min={inf.min} max={inf.max} tone="brass" className="mt-1" label={`${f.name} influence`} />}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-sm text-muted">No factions yet.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Recently edited" icon={<BookOpen />} />
            <ul className="px-2 pb-2">
              {recentLore.map((e) => (
                <li key={e.id}>
                  <Link href={`${base}/e/${e.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                    <TypeIcon type={e.type} />
                    <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
                    <span className="text-xs text-faint">{timeAgo(e.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          {campaign && (
            <Panel className="border-arcane/25">
              <PanelHeader title="AI suggestions" icon={<Sparkles className="!text-arcane" />} />
              <div className="flex flex-col gap-1.5 px-4 pb-4">
                <SuggestionLink href={`${base}/campaigns/${campaign.id}/prepare`} label="Draft a briefing for the next session" />
                <SuggestionLink href={`${base}/ai?q=${encodeURIComponent("What is happening elsewhere in the world right now?")}`} label="What is happening elsewhere?" />
                <SuggestionLink href={`${base}/ai?q=${encodeURIComponent("What plot threads have I forgotten?")}`} label={forgotten.length ? `${forgotten.length} threads may need resurfacing` : "Check for forgotten plot threads"} />
                <SuggestionLink href={`${base}/continuity`} label="Run a continuity check" />
              </div>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}

function SuggestionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-arcane-soft hover:text-fg">
      <FastForward className="size-3.5 text-arcane" /> {label}
    </Link>
  );
}
