import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Clapperboard, Compass, FastForward, MapPin, NotebookPen, ScrollText, SearchCheck, ShieldUser, Sparkles, TriangleAlert, Users } from "lucide-react";
import { requireCampaign } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { entities, gameSessions } from "@/server/db/schema";
import { listPartyMembers, listReputations } from "@/server/services/campaigns";
import { listQuests, listMysteries, listThreads } from "@/server/services/quests";
import { listTimeline } from "@/server/services/timeline";
import { forgottenThreads, unfinishedBusiness } from "@/server/services/insights";
import { getPlayerKnownEntities } from "@/server/services/knowledge";
import { getLocationChain } from "@/server/services/entities";
import { listConsequences } from "@/server/services/play";
import { formatDate, timeOfDay } from "@/lib/calendar";
import { Badge, EmptyState, Meter, Panel, PanelHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { TypeIcon } from "@/components/entity/type-icon";
import { ThreadLine } from "@/components/living/thread-line";
import { CampaignNotes, EditCampaignButton, WeatherControl } from "./campaign-widgets";
import { AdvanceButton } from "./advance-button";

export async function generateMetadata({ params }: { params: Promise<{ worldId: string; campaignId: string }> }) {
  const { worldId, campaignId } = await params;
  const { campaign } = await requireCampaign(worldId, campaignId);
  return { title: campaign.name };
}

export default async function CampaignDashboard({ params }: { params: Promise<{ worldId: string; campaignId: string }> }) {
  const { worldId, campaignId } = await params;
  const { campaign: c, calendar } = await requireCampaign(worldId, campaignId);
  const db = await getDb();
  const base = `/w/${worldId}`;
  const cb = `${base}/campaigns/${c.id}`;
  const [party, quests, mysteries, threads, sessions, reps, upcoming, forgotten, ub, known, chain, pending] = await Promise.all([
    listPartyMembers(db, worldId, c.id),
    listQuests(db, worldId, c.id, ["active", "available"]),
    listMysteries(db, worldId, c.id),
    listThreads(db, worldId, { statuses: ["escalating", "active"] }),
    db.select().from(gameSessions).where(eq(gameSessions.campaignId, c.id)).orderBy(desc(gameSessions.number)).limit(5),
    listReputations(db, c.id),
    listTimeline(db, worldId, { campaignId: c.id, from: c.currentAt, order: "asc", limit: 4 }),
    forgottenThreads(db, worldId, c.id, calendar),
    unfinishedBusiness(db, worldId, c.id),
    getPlayerKnownEntities(db, worldId, c.id),
    getLocationChain(db, worldId, c.currentLocationId),
    listConsequences(db, worldId, c.id, ["pending", "foreshadowed"]),
  ]);
  const importantIds = ub.map((u) => u.id).slice(0, 8);
  const importantNpcs = importantIds.length ? await db.select({ id: entities.id, name: entities.name, type: entities.type, summary: entities.summary }).from(entities).where(and(inArray(entities.id, importantIds))) : [];
  const live = sessions.find((s) => s.status === "in_progress");
  const here = chain[chain.length - 1] ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-brass">
            <Compass className="size-4" /> Campaign
          </p>
          <h1 className="mt-1 font-serif text-4xl font-semibold tracking-[-0.015em]">{c.name}</h1>
          {c.premise && <p className="mt-2 max-w-[70ch] text-md text-muted">{c.premise}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <EditCampaignButton campaign={{ id: c.id, name: c.name, premise: c.premise, partyName: c.partyName, status: c.status, currentAt: c.currentAt, currentLocation: here }} />
          <AdvanceButton />
          <Button asChild variant="secondary">
            <Link href={`${cb}/prepare`}>
              <NotebookPen /> Prepare next session
            </Link>
          </Button>
          <Button asChild variant="primary">
            <Link href={`${cb}/run`}>
              <Clapperboard /> {live ? `Continue session ${live.number}` : "Run session"}
            </Link>
          </Button>
        </div>
      </header>

      <section className="mb-6 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3" aria-label="Current situation">
        <div className="bg-surface px-4 py-3">
          <p className="text-xs text-faint">Now</p>
          <p className="mt-0.5 font-serif text-lg font-semibold">{formatDate(calendar, c.currentAt, { weekday: true })}</p>
          <p className="text-sm text-muted">{timeOfDay(calendar, c.currentAt)}</p>
        </div>
        <div className="bg-surface px-4 py-3">
          <p className="text-xs text-faint">Where</p>
          {here ? (
            <>
              <Link href={`${base}/e/${here.id}`} className="mt-0.5 block font-serif text-lg font-semibold hover:text-accent">
                {here.name}
              </Link>
              <p className="truncate text-sm text-muted">{chain.slice(0, -1).map((l) => l.name).reverse().join(", ") || " "}</p>
            </>
          ) : (
            <p className="mt-0.5 text-sm text-muted">Not set. Use Edit to set the party&rsquo;s location.</p>
          )}
        </div>
        <div className="bg-surface px-4 py-3">
          <p className="mb-1 text-xs text-faint">Weather</p>
          <WeatherControl campaignId={c.id} weather={c.currentWeather} locked={c.weatherLocked} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel>
            <PanelHeader title={c.partyName} icon={<ShieldUser />} action={<Button asChild variant="ghost" size="sm"><Link href={`${cb}/party`}>Party</Link></Button>} />
            {party.length ? (
              <ul className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
                {party.map((p) => {
                  const f = p.fields as Record<string, string | number | undefined>;
                  return (
                    <li key={p.id} className="bg-surface">
                      <Link href={`${base}/e/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                        <TypeIcon type="pc" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {[f.species, f.className, f.level ? `level ${f.level}` : null].filter(Boolean).join(" · ")}
                            {f.playerName ? ` — ${f.playerName}` : ""}
                          </span>
                        </span>
                        {p.status && p.status !== "active" && <Badge tone={p.status === "dead" ? "ember" : "neutral"}>{p.status}</Badge>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 pb-4">
                <EmptyState compact title="No player characters yet" action={<Button asChild size="sm" variant="secondary"><Link href={`${base}/new?type=pc`}>Add a character</Link></Button>} />
              </div>
            )}
            <div className="grid gap-4 border-t border-line px-4 py-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-faint">Party inventory</p>
                <CampaignNotes campaignId={c.id} field="partyInventory" value={c.partyInventory} label="Party inventory" rows={4} placeholder="- 120 gp&#10;- Rope, torches" />
              </div>
              <div>
                <p className="mb-1 text-xs text-faint">Party notes</p>
                <CampaignNotes campaignId={c.id} field="partyNotes" value={c.partyNotes} label="Party notes" rows={4} placeholder="Goals, debts, running jokes…" />
              </div>
            </div>
          </Panel>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel>
              <PanelHeader title="Active quests" icon={<ScrollText />} action={<Button asChild variant="ghost" size="sm"><Link href={`${cb}/quests`}>All</Link></Button>} />
              {quests.length ? (
                <ul className="px-4 pb-3">
                  {quests.slice(0, 6).map((q) => {
                    const total = q.objectives.length;
                    const done = q.objectives.filter((o) => o.status === "done").length;
                    return (
                      <li key={q.id} className="py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Link href={`${base}/e/${q.id}`} className="min-w-0 truncate text-sm font-medium hover:text-accent">
                            {q.name}
                          </Link>
                          <span className="shrink-0 text-xs text-faint">{q.status}</span>
                        </div>
                        {total > 0 && <Meter value={done} max={total} className="mt-1" label={`${q.name} progress`} />}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 pb-4 text-sm text-muted">No active quests.</p>
              )}
            </Panel>
            <Panel>
              <PanelHeader title="Mysteries" icon={<SearchCheck />} action={<Button asChild variant="ghost" size="sm"><Link href={`${cb}/mysteries`}>All</Link></Button>} />
              {mysteries.filter((m) => m.mystery.status !== "solved").length ? (
                <ul className="px-4 pb-3">
                  {mysteries
                    .filter((m) => m.mystery.status !== "solved")
                    .slice(0, 5)
                    .map((m) => {
                      const real = m.clues.filter((x) => !x.isRedHerring);
                      const found = real.filter((x) => x.discovered).length;
                      return (
                        <li key={m.id} className="py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <Link href={`${base}/e/${m.id}`} className="min-w-0 truncate text-sm font-medium hover:text-accent">
                              {m.name}
                            </Link>
                            <span className="shrink-0 text-xs tabular text-faint">
                              {found}/{real.length} clues
                            </span>
                          </div>
                          {real.length > 0 && <Meter value={found} max={real.length} tone="arcane" className="mt-1" label="Clues found" />}
                        </li>
                      );
                    })}
                </ul>
              ) : (
                <p className="px-4 pb-4 text-sm text-muted">No open mysteries.</p>
              )}
            </Panel>
          </div>

          <Panel id="insights" className="border-arcane/25">
            <PanelHeader title="Worth your attention" icon={<Sparkles className="!text-arcane" />} description="Forgotten threads, overdue promises and stalled mysteries, found from your records." />
            {forgotten.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {forgotten.map((f) => (
                  <li key={f.id} className="flex items-start gap-3 px-4 py-2.5">
                    <TriangleAlert className={f.severity === "high" ? "mt-0.5 size-4 shrink-0 text-ember" : f.severity === "warn" ? "mt-0.5 size-4 shrink-0 text-brass" : "mt-0.5 size-4 shrink-0 text-faint"} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{f.title}</p>
                      <p className="text-xs text-muted">{f.detail}</p>
                    </div>
                    {f.entityIds[0] && (
                      <Link href={`${base}/e/${f.entityIds[0].id}`} className="shrink-0 text-xs text-accent hover:underline">
                        Open
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-sm text-muted">Nothing looks forgotten. Nice.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="World threads" description="What's moving in the world right now." action={<Button asChild variant="ghost" size="sm"><Link href={`${base}/threads`}>All</Link></Button>} />
            <ul className="divide-y divide-line">
              {threads.slice(0, 4).map((t) => (
                <li key={t.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <Link href={`${base}/e/${t.id}`} className="min-w-0 truncate font-medium hover:text-accent">
                      {t.name}
                    </Link>
                    <span className="text-xs tabular text-faint">{t.thread.progress}%</span>
                  </div>
                  <ThreadLine className="mt-1.5" progress={t.thread.progress} status={t.thread.status} stages={t.stages.length} stageIndex={t.thread.stageIndex} />
                </li>
              ))}
              {threads.length === 0 && <li className="px-4 pb-4 text-sm text-muted">No active threads.</li>}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader title="DM notes" icon={<NotebookPen />} />
            <div className="px-4 pb-4">
              <CampaignNotes campaignId={c.id} field="dmNotes" value={c.dmNotes} label="DM notes" rows={7} placeholder="Private campaign notes. Saved automatically." />
            </div>
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel>
            <PanelHeader title="Sessions" icon={<Clapperboard />} action={<Button asChild variant="ghost" size="sm"><Link href={`${cb}/sessions`}>All</Link></Button>} />
            {sessions.length ? (
              <ul className="px-2 pb-2">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <Link href={`${cb}/sessions/${s.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                      <span className="w-7 text-xs tabular text-faint">#{s.number}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{s.title || "Untitled session"}</span>
                      <span className="text-xs text-faint">{s.status.replace("_", " ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-sm text-muted">No sessions yet. Run session starts the first one.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Important NPCs" icon={<Users />} />
            {importantNpcs.length ? (
              <ul className="px-4 pb-3">
                {ub.slice(0, 8).map((u) => (
                  <li key={u.id} className="py-1.5">
                    <Link href={`${base}/e/${u.id}`} className="flex items-center gap-2 text-sm font-medium hover:text-accent">
                      <TypeIcon type={u.type} /> {u.name}
                    </Link>
                    <p className="pl-6 text-xs text-muted">{u.reasons[0]}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-sm text-muted">NPCs with promises, quests or strong feelings toward the party appear here.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Standing" description="Attitude toward the party." />
            {reps.length ? (
              <ul className="px-4 pb-3">
                {reps.map((r) => (
                  <li key={r.entityId} className="py-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`${base}/e/${r.entityId}`} className="min-w-0 truncate hover:text-accent">
                        {r.name}
                      </Link>
                      <span className={`text-xs tabular ${r.reputation! > 0 ? "text-accent" : r.reputation! < 0 ? "text-ember" : "text-faint"}`}>
                        {r.reputation! > 0 ? "+" : ""}
                        {r.reputation}
                      </span>
                    </div>
                    <div className="relative mt-1 h-1.5 rounded-full bg-surface-3">
                      <span className="absolute left-1/2 top-0 h-full w-px bg-line-strong" aria-hidden />
                      <span
                        className={`absolute top-0 h-full rounded-full ${r.reputation! >= 0 ? "bg-accent" : "bg-ember"}`}
                        style={r.reputation! >= 0 ? { left: "50%", width: `${r.reputation! / 2}%` } : { right: "50%", width: `${-r.reputation! / 2}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-sm text-muted">Set attitudes from an NPC or faction page.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Pending consequences" icon={<TriangleAlert />} action={<Button asChild variant="ghost" size="sm"><Link href={`${cb}/consequences`}>All</Link></Button>} />
            {pending.length ? (
              <ul className="px-4 pb-3">
                {pending.slice(0, 5).map(({ c: x, actorName }) => (
                  <li key={x.id} className="py-1.5 text-sm">
                    <p className="font-medium">{x.title}</p>
                    <p className="text-xs text-faint">
                      {x.kind}
                      {actorName ? ` · ${actorName}` : ""}
                      {x.dueAt !== null && (x.dueAt < c.currentAt ? <span className="text-ember"> · overdue</span> : ` · due ${formatDate(calendar, x.dueAt)}`)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-sm text-muted">None pending.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Coming up" icon={<FastForward />} />
            {upcoming.length ? (
              <ul className="px-4 pb-3">
                {upcoming.map((e) => (
                  <li key={e.id} className="flex gap-3 py-1 text-sm">
                    <span className="w-20 shrink-0 text-brass tabular">{formatDate(calendar, e.startAt).split(",")[0]}</span>
                    <Link href={`${base}/e/${e.id}`} className="min-w-0 truncate hover:text-accent">
                      {e.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-sm text-muted">Nothing scheduled.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="What the players know" icon={<MapPin />} description={`${known.length} entries are public or discovered.`} />
            <ul className="flex flex-wrap gap-1.5 px-4 pb-4">
              {known.slice(0, 24).map((k) => (
                <li key={k.id}>
                  <Link href={`${base}/e/${k.id}`} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted hover:text-fg">
                    <TypeIcon type={k.type} className="size-3" /> {k.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
