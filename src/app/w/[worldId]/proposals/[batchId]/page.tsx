import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Compass } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getBatch } from "@/server/services/proposals";
import { BatchReview } from "@/components/proposals/batch-review";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Review proposals" };

export default async function BatchPage({ params, searchParams }: { params: Promise<{ worldId: string; batchId: string }>; searchParams: Promise<{ onboarding?: string }> }) {
  const { worldId, batchId } = await params;
  const { onboarding } = await searchParams;
  await requireWorld(worldId);
  const db = await getDb();
  const data = await getBatch(db, worldId, batchId);
  if (!data) notFound();
  const { batch, items } = data;
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href={`/w/${worldId}/proposals`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" /> All proposals
      </Link>
      <h1 className="mb-4 font-serif text-3xl font-semibold tracking-[-0.01em]">{batch.title}</h1>
      {onboarding && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-brass/30 bg-brass-soft px-4 py-3">
          <p className="flex-1 text-sm">Approve the parts of this foundation you like (edit anything first), then create your first campaign.</p>
          <Button asChild variant="primary" size="sm">
            <Link href={`/w/${worldId}/campaigns/new?onboarding=1`}>
              <Compass /> Create the campaign
            </Link>
          </Button>
        </div>
      )}
      <BatchReview
        batch={{ id: batch.id, title: batch.title, summary: batch.summary, status: batch.status, source: batch.source, provider: batch.provider, fromAt: batch.fromAt, toAt: batch.toAt, createdAt: batch.createdAt, campaignId: batch.campaignId }}
        items={items.map((i) => ({ id: i.id, kind: i.kind, payload: i.payload, originalPayload: i.originalPayload, rationale: i.rationale, status: i.status, error: i.error, resultRefs: i.resultRefs }))}
      />
    </div>
  );
}
