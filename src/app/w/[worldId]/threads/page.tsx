import Link from "next/link";
import { EyeOff, Spline } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { listThreads, type ThreadListItem } from "@/server/services/quests";
import { describeDuration, formatDate } from "@/lib/calendar";
import type { CalendarDefinition } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { ThreadLine, threadStatusLabel } from "@/components/living/thread-line";
import { TypeIcon } from "@/components/entity/type-icon";
import { ThreadActions, ThreadsHeaderActions } from "./thread-actions";

export const metadata = { title: "World threads" };

const STATUS_TEXT: Record<string, string> = { escalating: "text-ember", active: "text-accent", resolved: "text-brass", failed: "text-faint", dormant: "text-faint", paused: "text-faint" };

export default async function ThreadsPage({ params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { world, calendar, role } = await requireWorld(worldId);
  const db = await getDb();
  const { campaign } = await getActiveCampaign(worldId);
  const threads = await listThreads(db, worldId);
  const now = campaign?.currentAt ?? world.currentAt;
  const canEdit = role === "owner" || role === "editor";
  const moving = threads.filter((t) => t.thread.status === "escalating" || t.thread.status === "active");
  const quiet = threads.filter((t) => t.thread.status === "dormant" || t.thread.status === "paused");
  const done = threads.filter((t) => t.thread.status === "resolved" || t.thread.status === "failed");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<Spline />}
        title="World threads"
        description="The plots that move whether or not the party is watching. When you advance time, each thread pushes forward by its momentum, and the AI proposes what happens."
        actions={canEdit ? <ThreadsHeaderActions hasCampaign={!!campaign} /> : undefined}
      />
      {threads.length === 0 ? (
        <EmptyState icon={<Spline />} title="No world threads yet">
          A thread is something in motion: a cult gathering relics, a war brewing, a plague spreading north. Give it stages and momentum, and it will advance when time passes.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-10">
          <section>
            <h2 className="mb-3 text-md font-semibold">
              In motion <span className="font-normal text-faint">{moving.length}</span>
            </h2>
            {moving.length ? (
              <ul className="grid gap-4 md:grid-cols-2">
                {moving.map((t) => (
                  <ThreadCard key={t.id} t={t} worldId={worldId} calendar={calendar} now={now} canEdit={canEdit} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-faint">Nothing is actively moving. Wake a dormant thread, or let the party stir something up.</p>
            )}
          </section>
          {quiet.length > 0 && (
            <section>
              <h2 className="mb-3 text-md font-semibold">
                Dormant or paused <span className="font-normal text-faint">{quiet.length}</span>
              </h2>
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {quiet.map((t) => (
                  <ThreadCard key={t.id} t={t} worldId={worldId} calendar={calendar} now={now} canEdit={canEdit} compact />
                ))}
              </ul>
            </section>
          )}
          {done.length > 0 && (
            <details className="group">
              <summary className="mb-3 cursor-pointer list-none text-md font-semibold marker:hidden">
                Concluded <span className="font-normal text-faint">{done.length}</span>
                <span className="ml-2 text-sm font-normal text-accent group-open:hidden">Show</span>
              </summary>
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {done.map((t) => (
                  <ThreadCard key={t.id} t={t} worldId={worldId} calendar={calendar} now={now} canEdit={canEdit} compact />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ThreadCard({ t, worldId, calendar, now, canEdit, compact }: { t: ThreadListItem; worldId: string; calendar: CalendarDefinition; now: number; canEdit: boolean; compact?: boolean }) {
  const th = t.thread;
  const stage = t.stages[th.stageIndex];
  const next = t.stages[th.stageIndex + 1];
  const drivers = t.actors.filter((a) => a.role === "drives");
  const involved = t.actors.filter((a) => a.role === "involves");
  const since = th.lastAdvancedAt !== null && th.lastAdvancedAt <= now ? describeDuration(calendar, now - th.lastAdvancedAt) : null;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/w/${worldId}/e/${t.id}`} className="font-serif text-lg font-semibold leading-snug hover:text-accent">
            {t.name}
          </Link>
          <p className="flex flex-wrap items-center gap-x-2 text-xs">
            <span className={cn("font-medium", STATUS_TEXT[th.status])}>{threadStatusLabel(th.status)}</span>
            <span className="text-faint" title={`Urgency ${th.urgency} of 5`}>
              {"●".repeat(th.urgency)}
              <span className="opacity-30">{"●".repeat(5 - th.urgency)}</span>
            </span>
            {(th.status === "active" || th.status === "escalating") && th.momentum > 0 && <span className="text-faint">+{th.momentum}% a week if ignored</span>}
            {(t.visibility === "dm_only" || t.visibility === "secret") && <EyeOff className="size-3 text-faint" aria-label="Hidden from players" />}
          </p>
        </div>
        <span className="font-serif text-2xl font-semibold tabular text-muted">{th.progress}%</span>
      </div>
      <ThreadLine progress={th.progress} status={th.status} stages={t.stages.length} stageIndex={th.stageIndex} />
      {t.stages.length > 0 && (
        <p className="text-sm">
          <span className="text-faint">Now: </span>
          {stage?.title ?? "Not started"}
          {next && !compact && (
            <>
              <span className="text-faint"> · next: </span>
              <span className="text-muted">{next.title}</span>
            </>
          )}
        </p>
      )}
      {!compact && t.summary && <p className="text-sm text-muted">{t.summary}</p>}
      {!compact && th.nextMilestone && (
        <p className="text-sm">
          <span className="text-faint">Coming: </span>
          {th.nextMilestone}
          {th.nextMilestoneAt !== null && <span className="text-brass"> · {formatDate(calendar, th.nextMilestoneAt)}</span>}
        </p>
      )}
      {(drivers.length > 0 || (!compact && involved.length > 0)) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {drivers.map((a) => (
            <Link key={`d-${a.id}`} href={`/w/${worldId}/e/${a.id}`} className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 hover:border-line-strong" title="Drives this thread">
              <TypeIcon type={a.type} className="size-3" /> {a.name}
            </Link>
          ))}
          {!compact &&
            involved.map((a) => (
              <Link key={`i-${a.id}`} href={`/w/${worldId}/e/${a.id}`} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-muted hover:text-fg">
                <TypeIcon type={a.type} className="size-3" /> {a.name}
              </Link>
            ))}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-faint">{since ? (since === "no time" ? "Moved just now" : `Last moved ${since} ago`) : "Not yet advanced"}</span>
        {canEdit && <ThreadActions threadId={t.id} status={th.status} progress={th.progress} />}
      </div>
    </li>
  );
}
