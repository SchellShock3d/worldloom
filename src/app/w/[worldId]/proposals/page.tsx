import Link from "next/link";
import { Inbox, Sparkles } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { listBatches } from "@/server/services/proposals";
import { Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const metadata = { title: "Proposals" };

const SOURCE: Record<string, string> = {
  session: "Session notes",
  advance: "Advance world",
  generate: "Generated",
  assistant: "Copilot",
  onboarding: "World foundation",
  consequences: "Consequences",
  emergency: "Quick generate",
  prep: "Session prep",
};

export default async function ProposalsPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<{ show?: string }> }) {
  const { worldId } = await params;
  const { show } = await searchParams;
  await requireWorld(worldId);
  const db = await getDb();
  const all = show === "all";
  const batches = await listBatches(db, worldId, { status: all ? undefined : ["pending", "partial"], limit: 100 });
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<Inbox />}
        title="Proposals"
        description="Everything the AI and the world simulation suggest waits here. Nothing becomes canon until you approve it."
        actions={
          <div className="flex rounded-md border border-line p-0.5 text-sm">
            <Link href={`/w/${worldId}/proposals`} className={cn("rounded px-3 py-1", !all ? "bg-surface-3 font-medium" : "text-muted")}>
              Waiting
            </Link>
            <Link href={`/w/${worldId}/proposals?show=all`} className={cn("rounded px-3 py-1", all ? "bg-surface-3 font-medium" : "text-muted")}>
              All
            </Link>
          </div>
        }
      />
      {batches.length ? (
        <ul className="flex flex-col gap-2">
          {batches.map(({ batch, total, pending, applied }) => (
            <li key={batch.id}>
              <Link href={`/w/${worldId}/proposals/${batch.id}`} className="flex items-start gap-4 rounded-lg border border-line bg-surface px-4 py-3 hover:border-line-strong">
                <Sparkles className={cn("mt-1 size-4 shrink-0", pending ? "text-arcane" : "text-faint")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{batch.title}</span>
                    <Badge tone="outline">{SOURCE[batch.source] ?? batch.source}</Badge>
                    {batch.provider === "offline" && <Badge>offline engine</Badge>}
                  </div>
                  {batch.summary && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{batch.summary}</p>}
                </div>
                <div className="shrink-0 text-right text-sm">
                  <p className={pending ? "font-medium text-arcane" : "text-muted"}>{pending ? `${pending} to review` : batch.status === "rejected" ? "Rejected" : `${applied}/${total} applied`}</p>
                  <p className="text-xs text-faint">{timeAgo(batch.createdAt)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Inbox />} title={all ? "No proposals yet" : "Nothing waiting for review"}>
          Proposals appear when you process session notes, advance the world, or ask the AI to create something.
        </EmptyState>
      )}
    </div>
  );
}
