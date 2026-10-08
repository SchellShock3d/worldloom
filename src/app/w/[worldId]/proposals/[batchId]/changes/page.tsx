import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUp, ChevronLeft, Clock, MessageCircleQuestion, Sparkles, Spline } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { changeLogForBatch } from "@/server/services/insights";
import { getBatch } from "@/server/services/proposals";
import { describeDuration, formatDate, formatShortDate } from "@/lib/calendar";
import { Panel } from "@/components/ui/display";

export const metadata = { title: "What changed" };

/** "What Changed?" — a readable change log for one Advance World (or any batch). */
export default async function ChangesPage({ params }: { params: Promise<{ worldId: string; batchId: string }> }) {
  const { worldId, batchId } = await params;
  const { calendar } = await requireWorld(worldId);
  const db = await getDb();
  const log = await changeLogForBatch(db, worldId, batchId);
  const data = await getBatch(db, worldId, batchId);
  if (!log || !data) notFound();
  const { batch } = log;
  const metrics = log.revisions.filter((r) => r.targetKind === "metric");
  const threads = log.revisions.filter((r) => r.targetKind === "thread");
  const entityUpdates = log.revisions.filter((r) => (r.targetKind === "entity" || r.targetKind === "campaign_state") && r.action === "update");
  const createdEvents = data.items.filter((i) => i.kind === "create_event" && i.status === "applied");
  const createdRumours = data.items.filter((i) => i.kind === "create_rumour" && i.status === "applied");
  const other = log.revisions.filter((r) => !["metric", "thread", "clock"].includes(r.targetKind) && !entityUpdates.includes(r) && !(r.targetKind === "entity" && r.action === "create") && r.targetKind !== "relationship");
  const pending = data.items.filter((i) => i.status === "pending").length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href={`/w/${worldId}/proposals/${batchId}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" /> Back to proposals
      </Link>
      <header className="mb-6">
        <p className="text-sm text-faint">What changed</p>
        {batch.fromAt !== null && batch.toAt !== null ? (
          <h1 className="mt-1 flex flex-wrap items-center gap-3 font-serif text-4xl font-semibold tracking-[-0.015em]">
            <span>{formatShortDate(calendar, batch.fromAt)}</span>
            <ArrowRight className="size-7 text-brass" />
            <span className="text-brass">{formatShortDate(calendar, batch.toAt)}</span>
          </h1>
        ) : (
          <h1 className="mt-1 font-serif text-3xl font-semibold">{batch.title}</h1>
        )}
        {batch.fromAt !== null && batch.toAt !== null && (
          <p className="mt-1 text-muted">
            {describeDuration(calendar, batch.toAt - batch.fromAt)} passed · {formatDate(calendar, batch.toAt, { weekday: true })}
          </p>
        )}
        {pending > 0 && (
          <p className="mt-3 rounded-md bg-arcane-soft px-3 py-2 text-sm text-arcane">
            {pending} proposals in this batch are still waiting for review and aren't shown here.
          </p>
        )}
      </header>

      {log.revisions.length === 0 ? (
        <p className="text-muted">No changes have been approved from this batch yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {metrics.length > 0 && (
            <Panel className="px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-muted">World state</h2>
              <ul className="flex flex-col gap-1.5">
                {metrics.map((m) => {
                  const before = Number((m.before as { value?: number } | null)?.value ?? 0);
                  const after = Number((m.after as { value?: number } | null)?.value ?? 0);
                  const up = after > before;
                  return (
                    <li key={m.id} className="flex items-center gap-2 text-md">
                      {up ? <ArrowUp className="size-4 text-accent" /> : <ArrowDown className="size-4 text-ember" />}
                      <Link href={`/w/${worldId}/e/${m.targetId}`} className="hover:text-accent">
                        {m.targetLabel}
                      </Link>
                      <span className="ml-auto text-sm tabular text-muted">
                        {before} → <span className={up ? "text-accent" : "text-ember"}>{after}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
          {entityUpdates.length > 0 && (
            <Panel className="px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-muted">People & places</h2>
              <ul className="flex flex-col gap-1.5">
                {entityUpdates.map((r) => (
                  <li key={r.id} className="text-md">
                    <Link href={`/w/${worldId}/e/${r.targetId}`} className="font-medium hover:text-accent">
                      {r.targetLabel}
                    </Link>
                    {r.before && r.after && "status" in r.after ? (
                      <span className="text-muted">
                        : {String((r.before as Record<string, unknown>).status ?? "—")} → <span className="text-fg">{String((r.after as Record<string, unknown>).status)}</span>
                      </span>
                    ) : (
                      <span className="text-muted">: {r.summary}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {threads.length > 0 && (
            <Panel className="px-5 py-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
                <Spline className="size-4" /> World threads
              </h2>
              <ul className="flex flex-col gap-1.5">
                {threads.map((r) => (
                  <li key={r.id} className="text-md">
                    <Link href={`/w/${worldId}/e/${r.targetId}`} className="hover:text-accent">
                      {r.summary}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {createdEvents.map((e) => (
            <section key={e.id} className="border-l-2 border-brass pl-4">
              <p className="text-xs font-semibold text-brass">New event · {formatDate(calendar, Number((e.payload as { startAt: number }).startAt))}</p>
              <p className="font-serif text-xl font-semibold">{String((e.payload as { title: string }).title)}</p>
              {(e.payload as { summary?: string }).summary && <p className="text-muted">{String((e.payload as { summary: string }).summary)}</p>}
              {e.resultRefs[0] && (
                <Link href={`/w/${worldId}/e/${e.resultRefs[0].id}`} className="text-sm text-accent hover:underline">
                  Open event
                </Link>
              )}
            </section>
          ))}
          {createdRumours.map((r) => (
            <section key={r.id} className="border-l-2 border-arcane pl-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-arcane">
                <MessageCircleQuestion className="size-3.5" /> New rumour
              </p>
              <p className="font-serif text-xl italic">“{String((r.payload as { claim: string }).claim)}”</p>
            </section>
          ))}
          {other.length > 0 && (
            <Panel className="px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-muted">Other changes</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {other.map((r) => (
                  <li key={r.id} className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-arcane" /> {r.summary}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <p className="flex items-center gap-1.5 text-xs text-faint">
            <Clock className="size-3" /> Every change above is recorded in the history of the affected entity, attributed to the AI and to you as approver.
          </p>
        </div>
      )}
    </div>
  );
}
