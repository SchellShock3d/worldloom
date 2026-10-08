import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Bot, EyeOff, History, MapPin, NotebookPen, Sparkles } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { entities, type EventKind } from "@/server/db/schema";
import { listTimeline, type TimelineEvent } from "@/server/services/timeline";
import { formatDate, resolve } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { TypeIcon } from "@/components/entity/type-icon";
import { TimelineFilters, NewEventButton } from "./timeline-filters";

export const metadata = { title: "Timeline" };

const EVENT_KINDS: EventKind[] = ["historical", "world", "campaign", "character", "faction"];
const KIND_STYLE: Record<EventKind, { label: string; dot: string; text: string }> = {
  historical: { label: "History", dot: "bg-brass", text: "text-brass" },
  world: { label: "World", dot: "bg-accent", text: "text-accent" },
  campaign: { label: "Campaign", dot: "bg-play", text: "text-play" },
  character: { label: "Character", dot: "bg-people", text: "text-people" },
  faction: { label: "Faction", dot: "bg-powers", text: "text-powers" },
};
const UUID = /^[0-9a-f-]{36}$/i;

export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ scope?: string; kind?: string; entity?: string; players?: string }>;
}) {
  const { worldId } = await params;
  const sp = await searchParams;
  const { world, calendar, role } = await requireWorld(worldId);
  const db = await getDb();
  const { campaign } = await getActiveCampaign(worldId);
  const scope = campaign && (sp.scope === "world" || sp.scope === "campaign") ? sp.scope : campaign ? "all" : "world";
  const kinds = (sp.kind ?? "").split(",").filter((k): k is EventKind => (EVENT_KINDS as string[]).includes(k));
  const entityId = sp.entity && UUID.test(sp.entity) ? sp.entity : undefined;
  const playersOnly = sp.players === "1" || role === "player";

  let rows = await listTimeline(db, worldId, {
    campaignId: scope === "world" ? null : (campaign?.id ?? null),
    kinds: kinds.length ? kinds : undefined,
    entityId,
    visibleOnly: playersOnly,
    limit: 1000,
  });
  if (scope === "campaign") rows = rows.filter((r) => r.campaignId === campaign?.id);
  const focus = entityId ? (await db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(and(eq(entities.worldId, worldId), eq(entities.id, entityId))))[0] ?? null : null;

  const now = campaign?.currentAt ?? world.currentAt;
  const nowLabel = formatDate(calendar, now, { precision: "day" });

  // Group by era → year, inserting the "now" marker in order.
  type Item = { kind: "event"; e: TimelineEvent } | { kind: "now" };
  const items: Item[] = [];
  let placedNow = false;
  for (const e of rows) {
    if (!placedNow && e.startAt > now) {
      items.push({ kind: "now" });
      placedNow = true;
    }
    items.push({ kind: "event", e });
  }
  if (!placedNow && rows.length) items.push({ kind: "now" });

  const groups: { era: string; years: { year: number; label: string; items: Item[] }[] }[] = [];
  for (const it of items) {
    const at = it.kind === "now" ? now : it.e.startAt;
    const r = resolve(calendar, at);
    const era = r.era?.name ?? "Before the first era";
    let g = groups.at(-1);
    if (!g || g.era !== era) groups.push((g = { era, years: [] }));
    let y = g.years.at(-1);
    if (!y || y.year !== r.year) g.years.push((y = { year: r.year, label: formatDate(calendar, at, { precision: "year" }), items: [] }));
    y.items.push(it);
  }

  const canEdit = role === "owner" || role === "editor";
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<History />}
        title="Timeline"
        description="Ancient history, recent upheavals and everything your campaigns set in motion, in calendar order."
        actions={canEdit ? <NewEventButton /> : undefined}
      />
      <TimelineFilters
        scope={scope}
        hasCampaign={!!campaign}
        campaignName={campaign?.name ?? null}
        kinds={kinds}
        focus={focus}
        playersOnly={playersOnly}
        lockPlayers={role === "player"}
      />

      {rows.length === 0 ? (
        <EmptyState icon={<History />} title={kinds.length || entityId || playersOnly ? "Nothing matches these filters" : "No events yet"}>
          {kinds.length || entityId || playersOnly
            ? "Clear a filter to see more of the timeline."
            : "Add a historical event, or run a session and approve its proposals: events from play land here automatically."}
        </EmptyState>
      ) : (
        <div className="mt-6">
          {groups.length > 1 && (
            <nav aria-label="Eras" className="mb-6 flex flex-wrap gap-2 text-sm">
              {groups.map((g, i) => (
                <a key={i} href={`#era-${i}`} className="rounded-full border border-line px-3 py-1 text-muted hover:border-line-strong hover:text-fg">
                  {g.era}
                </a>
              ))}
            </nav>
          )}
          {groups.map((g, gi) => (
            <section key={gi} id={`era-${gi}`} className="mb-10 scroll-mt-4">
              <h2 className="mb-4 font-serif text-2xl font-semibold text-brass">{g.era}</h2>
              <div className="relative">
                {/* the spine */}
                <div className="absolute bottom-0 left-32 top-0 w-px bg-line-strong sm:left-40" aria-hidden />
                {g.years.map((y) => (
                  <div key={y.year} className="relative">
                    <div className="sticky top-0 z-10 -mx-1 mb-1 bg-bg/95 px-1 py-1.5 backdrop-blur">
                      <span className="inline-block w-28 text-right font-serif text-lg font-semibold tabular sm:w-36">{y.label}</span>
                    </div>
                    <ol className="flex flex-col">
                      {y.items.map((it, i) =>
                        it.kind === "now" ? (
                          <li key={`now-${i}`} className="relative flex items-center gap-4 py-3">
                            <span className="w-28 shrink-0 text-right text-xs font-semibold text-brass sm:w-36">Now</span>
                            <span className="relative z-[1] -ml-[6px] size-3 shrink-0 rounded-full bg-brass ring-4 ring-brass-soft" aria-hidden />
                            <span className="h-px flex-1 bg-brass/60" aria-hidden />
                            <span className="rounded-full bg-brass-soft px-2.5 py-0.5 text-xs font-medium text-brass">{nowLabel}</span>
                          </li>
                        ) : (
                          <EventRow key={it.e.id} e={it.e} worldId={worldId} date={formatDate(calendar, it.e.startAt, { precision: it.e.precision === "minute" ? "day" : it.e.precision, era: false })} end={it.e.endAt ? formatDate(calendar, it.e.endAt, { precision: it.e.precision === "minute" ? "day" : it.e.precision }) : null} future={it.e.startAt > now} />
                        ),
                      )}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ e, worldId, date, end, future }: { e: TimelineEvent; worldId: string; date: string; end: string | null; future: boolean }) {
  const style = KIND_STYLE[e.kind] ?? KIND_STYLE.historical;
  const tentative = e.canonStatus === "draft" || e.canonStatus === "proposed";
  // Dates inside a year group don't need the year repeated.
  const shortDate = e.precision === "year" ? "" : date.replace(/,\s*[^,]+$/, "");
  return (
    <li className="group relative flex gap-4 py-2.5">
      <span className={cn("w-28 shrink-0 pt-0.5 text-right text-sm tabular sm:w-36", future ? "text-faint" : "text-muted")}>{shortDate}</span>
      <span
        className={cn("relative z-[1] mt-1.5 -ml-[5px] size-2.5 shrink-0 rounded-full ring-4 ring-bg", tentative ? "border border-dashed border-current bg-bg" : style.dot, tentative && style.text)}
        aria-hidden
      />
      <div className={cn("min-w-0 flex-1", future && "opacity-75")}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Link href={`/w/${worldId}/e/${e.id}`} className="font-medium text-fg hover:text-accent">
            {e.name}
          </Link>
          <span className={cn("text-xs", style.text)}>{style.label}</span>
          {end && <span className="text-xs text-faint">until {end}</span>}
          {e.visibility === "dm_only" || e.visibility === "secret" ? <EyeOff className="size-3.5 text-faint" aria-label="Hidden from players" /> : null}
          {tentative && <Badge tone="outline">{e.canonStatus === "draft" ? "Draft" : "Proposed"}</Badge>}
          {e.origin === "session" && (
            <Badge tone="neutral">
              <NotebookPen /> From play
            </Badge>
          )}
          {e.origin === "advance" && (
            <Badge tone="brass">
              <Sparkles /> World advanced
            </Badge>
          )}
          {e.origin === "ai" && (
            <Badge tone="arcane">
              <Bot /> AI
            </Badge>
          )}
        </div>
        {e.summary && <p className="mt-0.5 max-w-[68ch] text-sm text-muted">{e.summary}</p>}
        {(e.location || e.participants.length > 0) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            {e.location && (
              <Link href={`/w/${worldId}/e/${e.location.id}`} className="inline-flex items-center gap-1 text-faint hover:text-fg">
                <MapPin className="size-3" /> {e.location.name}
              </Link>
            )}
            {e.participants.map((p) => (
              <Link key={p.id} href={`/w/${worldId}/e/${p.id}`} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-muted hover:text-fg">
                <TypeIcon type={p.type} className="size-3" /> {p.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
