import Link from "next/link";
import { Clapperboard } from "lucide-react";
import { requireCampaign } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { listSessions } from "@/server/services/sessions";
import { formatDate } from "@/lib/calendar";
import { Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { NewSessionButton } from "./new-session-button";

export const metadata = { title: "Sessions" };

const STATUS_TONE = { planned: "outline", in_progress: "ember", completed: "brass", processed: "accent" } as const;
const STATUS_LABEL = { planned: "Planned", in_progress: "In progress", completed: "Completed", processed: "Processed" } as const;

export default async function SessionsPage({ params }: { params: Promise<{ worldId: string; campaignId: string }> }) {
  const { worldId, campaignId } = await params;
  const { campaign, calendar } = await requireCampaign(worldId, campaignId);
  const db = await getDb();
  const sessions = await listSessions(db, campaign.id);
  const cb = `/w/${worldId}/campaigns/${campaign.id}`;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader icon={<Clapperboard />} title="Sessions" description={`Every session of ${campaign.name}: notes, recaps and what changed.`} actions={<NewSessionButton campaignId={campaign.id} />} />
      {sessions.length ? (
        <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={s.status === "in_progress" ? `${cb}/run` : `${cb}/sessions/${s.id}`} className="grid gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2/60 sm:grid-cols-[3rem_1fr_auto]">
                <span className="font-serif text-2xl font-semibold tabular text-faint">{s.number}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.title || "Untitled session"}</span>
                    <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                  </span>
                  {s.recap && <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{s.recap.replace(/@\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[#*_>-]/g, "")}</span>}
                </span>
                <span className="text-right text-xs text-faint sm:pt-1">
                  {s.startedAt ? s.startedAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : s.scheduledFor ? `Scheduled ${s.scheduledFor.toLocaleDateString()}` : ""}
                  {s.inWorldStartAt !== null && <span className="block text-brass">{formatDate(calendar, s.inWorldStartAt)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon={<Clapperboard />} title="No sessions yet" action={<NewSessionButton campaignId={campaign.id} />}>
          Plan your first session, or jump straight into Run Session mode.
        </EmptyState>
      )}
    </div>
  );
}
