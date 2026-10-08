import Link from "next/link";
import { Plus, ScrollText, Check, X, CircleDashed } from "lucide-react";
import { requireCampaign } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { listQuests } from "@/server/services/quests";
import { EmptyState, Meter, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Quests" };

const GROUPS = [
  { label: "Active", statuses: ["active"] },
  { label: "Available", statuses: ["available"] },
  { label: "Hidden or unknown to the players", statuses: ["hidden", "unknown"] },
  { label: "Completed", statuses: ["completed"] },
  { label: "Failed or abandoned", statuses: ["failed", "abandoned"] },
];

export default async function QuestsPage({ params }: { params: Promise<{ worldId: string; campaignId: string }> }) {
  const { worldId, campaignId } = await params;
  const { campaign } = await requireCampaign(worldId, campaignId);
  const db = await getDb();
  const quests = await listQuests(db, worldId, campaign.id);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<ScrollText />}
        title="Quests"
        description="Goals with objectives, givers, rewards and consequences."
        actions={
          <Button asChild variant="primary">
            <Link href={`/w/${worldId}/new?type=quest`}>
              <Plus /> New quest
            </Link>
          </Button>
        }
      />
      {quests.length === 0 ? (
        <EmptyState icon={<ScrollText />} title="No quests yet" />
      ) : (
        <div className="flex flex-col gap-8">
          {GROUPS.map((g) => {
            const list = quests.filter((q) => g.statuses.includes(q.status));
            if (!list.length) return null;
            return (
              <section key={g.label}>
                <h2 className="mb-2 text-sm font-semibold text-muted">
                  {g.label} <span className="text-faint tabular">{list.length}</span>
                </h2>
                <ul className="grid gap-3 md:grid-cols-2">
                  {list.map((q) => {
                    const done = q.objectives.filter((o) => o.status === "done").length;
                    return (
                      <li key={q.id}>
                        <Link href={`/w/${worldId}/e/${q.id}`} className="block h-full rounded-lg border border-line bg-surface p-4 hover:border-line-strong">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-serif text-lg font-semibold leading-snug">{q.name}</p>
                            {q.priority >= 2 && <span className={q.priority === 3 ? "text-xs font-medium text-ember" : "text-xs font-medium text-brass"}>{q.priority === 3 ? "Urgent" : "High"}</span>}
                          </div>
                          {q.giverName && <p className="text-xs text-faint">From {q.giverName}</p>}
                          {q.summary && <p className="mt-1 line-clamp-2 text-sm text-muted">{q.summary}</p>}
                          {q.objectives.length > 0 && (
                            <>
                              <ul className="mt-2 flex flex-col gap-0.5">
                                {q.objectives.slice(0, 4).map((o) => (
                                  <li key={o.id} className="flex items-center gap-1.5 text-sm">
                                    {o.status === "done" ? <Check className="size-3.5 text-accent" /> : o.status === "failed" ? <X className="size-3.5 text-ember" /> : <CircleDashed className="size-3.5 text-faint" />}
                                    <span className={o.status !== "open" ? "text-muted line-through" : ""}>{o.text}</span>
                                  </li>
                                ))}
                              </ul>
                              <Meter value={done} max={q.objectives.length} className="mt-2" label="Objectives done" />
                            </>
                          )}
                          {q.rewards && <p className="mt-2 text-xs text-brass">Reward: {q.rewards}</p>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
