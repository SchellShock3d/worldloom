import Link from "next/link";
import { inArray, sql } from "drizzle-orm";
import { Compass, Plus } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { gameSessions } from "@/server/db/schema";
import { formatDate } from "@/lib/calendar";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/display";

export const metadata = { title: "Campaigns" };

const STATUS: Record<string, { label: string; tone: "accent" | "brass" | "neutral" | "outline" }> = {
  active: { label: "Active", tone: "accent" },
  planning: { label: "Planning", tone: "brass" },
  paused: { label: "Paused", tone: "neutral" },
  completed: { label: "Completed", tone: "outline" },
};

export default async function CampaignsPage({ params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { calendar, role } = await requireWorld(worldId);
  const db = await getDb();
  const { campaign: active, all } = await getActiveCampaign(worldId);
  const counts = all.length
    ? await db
        .select({ campaignId: gameSessions.campaignId, played: sql<number>`count(*) filter (where ${gameSessions.status} in ('completed', 'processed'))::int`, total: sql<number>`count(*)::int` })
        .from(gameSessions)
        .where(inArray(gameSessions.campaignId, all.map((c) => c.id)))
        .groupBy(gameSessions.campaignId)
    : [];
  const canEdit = role === "owner" || role === "editor";
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<Compass />}
        title="Campaigns"
        description="Each campaign keeps its own clock, party, quests and version of events. What happens in one stays there until you commit it to world canon."
        actions={
          canEdit ? (
            <Button asChild variant="primary">
              <Link href={`/w/${worldId}/campaigns/new`}>
                <Plus /> New campaign
              </Link>
            </Button>
          ) : undefined
        }
      />
      {all.length === 0 ? (
        <EmptyState icon={<Compass />} title="No campaigns yet">
          Start a campaign to track a party, run sessions and let the world react to what they do.
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {all.map((c) => {
            const n = counts.find((x) => x.campaignId === c.id);
            const st = STATUS[c.status] ?? STATUS.active!;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/w/${worldId}/campaigns/${c.id}`} className="font-serif text-xl font-semibold hover:text-accent">
                      {c.name}
                    </Link>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {active?.id === c.id && <span className="text-xs text-brass">You&apos;re working in this one</span>}
                  </div>
                  {c.premise && <p className="mt-0.5 line-clamp-2 max-w-[70ch] text-sm text-muted">{c.premise}</p>}
                  <p className="mt-1 text-xs text-faint">
                    {c.partyName} · {formatDate(calendar, c.currentAt)} · {n?.played ?? 0} session{(n?.played ?? 0) === 1 ? "" : "s"} played
                    {(n?.total ?? 0) > (n?.played ?? 0) ? `, ${(n?.total ?? 0) - (n?.played ?? 0)} planned` : ""}
                  </p>
                </div>
                {active?.id !== c.id && (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/w/${worldId}/campaigns/${c.id}`}>Switch to it</Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
