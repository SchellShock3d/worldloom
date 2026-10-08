"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, History, RotateCcw, Settings2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/display";
import { Segmented } from "@/components/ui/primitives";
import { useWorld } from "@/components/shell/world-context";
import { restoreRevisionAction } from "@/server/actions/entities";
import { cn, timeAgo } from "@/lib/utils";

interface Row {
  id: string;
  at: string;
  action: string;
  targetKind: string;
  targetId: string;
  targetLabel: string;
  summary: string;
  actorType: "user" | "ai" | "system";
  userName: string | null;
  fromProposal: boolean;
  restorable: boolean;
}

export function HistoryList({ rows, total, actor, nextCursor }: { rows: Row[]; total: number; actor: string | null; nextCursor: string | null }) {
  const w = useWorld();
  const router = useRouter();
  const [restoring, setRestoring] = React.useState<Row | null>(null);
  const base = `/w/${w.worldId}/settings?tab=history`;
  const days = groupByDay(rows);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Every change to your world, who made it, and what it was before. {total.toLocaleString()} changes recorded.</p>
        <Segmented
          size="sm"
          value={actor ?? "all"}
          onChange={(v) => router.push(v === "all" ? base : `${base}&actor=${v}`)}
          options={[
            { value: "all", label: "Everyone" },
            { value: "user", label: "People" },
            { value: "ai", label: "Approved AI" },
            { value: "system", label: "System" },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<History />} title="Nothing here yet">
          Changes appear as you build.
        </EmptyState>
      ) : (
        days.map(([day, list]) => (
          <section key={day}>
            <h2 className="mb-1.5 text-sm font-semibold text-faint">{day}</h2>
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {list.map((r) => {
                const Icon = r.actorType === "ai" ? Bot : r.actorType === "system" ? Settings2 : User;
                const href = r.targetKind === "entity" && r.action !== "delete" ? `/w/${w.worldId}/e/${r.targetId}` : null;
                return (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", r.actorType === "ai" ? "text-arcane" : "text-faint")} aria-label={r.actorType} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {href ? (
                          <Link href={href} className="font-medium hover:text-accent">
                            {r.targetLabel || r.targetKind}
                          </Link>
                        ) : (
                          <span className="font-medium">{r.targetLabel || r.targetKind}</span>
                        )}
                        <span className="text-muted"> · {r.summary || r.action}</span>
                      </p>
                      <p className="text-xs text-faint">
                        {r.actorType === "ai" ? `AI proposal, approved by ${r.userName ?? "a DM"}` : r.actorType === "system" ? "Automatic" : (r.userName ?? "Someone")} · {timeAgo(new Date(r.at))}
                      </p>
                    </div>
                    {r.restorable && (
                      <Button variant="ghost" size="xs" onClick={() => setRestoring(r)}>
                        <RotateCcw /> {r.action === "delete" ? "Undelete" : "Restore"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {nextCursor && (
        <Button asChild variant="secondary" className="self-center">
          <Link href={`${base}${actor ? `&actor=${actor}` : ""}&before=${encodeURIComponent(nextCursor)}`}>Older changes</Link>
        </Button>
      )}
      <ConfirmDialog
        open={!!restoring}
        onOpenChange={(o) => !o && setRestoring(null)}
        destructive={false}
        title={restoring?.action === "delete" ? `Bring back “${restoring?.targetLabel}”?` : `Restore “${restoring?.targetLabel}” to before this change?`}
        description={restoring?.action === "delete" ? "The entry comes back with its text, fields and place in the hierarchy." : "The fields this change touched go back to their earlier values. The restore itself is recorded, so you can undo it."}
        confirmLabel="Restore"
        onConfirm={async () => {
          if (!restoring) return;
          const res = await restoreRevisionAction(w.worldId, restoring.id);
          if (!res.ok) return void toast.error(res.error);
          toast.success("Restored", { action: { label: "Open", onClick: () => router.push(`/w/${w.worldId}/e/${res.data.id}`) } });
          setRestoring(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function groupByDay(rows: Row[]): [string, Row[]][] {
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const out: [string, Row[]][] = [];
  for (const r of rows) {
    const d = fmt.format(new Date(r.at));
    const last = out.at(-1);
    if (last && last[0] === d) last[1].push(r);
    else out.push([d, [r]]);
  }
  return out;
}
