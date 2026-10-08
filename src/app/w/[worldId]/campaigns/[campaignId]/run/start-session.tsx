"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clapperboard, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown, type RefMap } from "@/components/common/markdown";
import { useWorld } from "@/components/shell/world-context";
import { startSessionAction } from "@/server/actions/sessions";

export function StartSession({ campaignId, campaignName, planned, lastRecap, refs }: { campaignId: string; campaignName: string; planned: { id: string; number: number; title: string; prep: string }[]; lastRecap: { number: number; recap: string } | null; refs: RefMap }) {
  const w = useWorld();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const next = planned[0];
  const start = async (id?: string) => {
    setBusy(true);
    const res = await startSessionAction(w.worldId, campaignId, id);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  };
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm text-brass">{campaignName}</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold tracking-[-0.01em]">{next ? `Ready for session ${next.number}${next.title ? `: ${next.title}` : ""}?` : "Start a new session"}</h1>
      <p className="mt-2 text-md text-muted">Run Session mode keeps your notes, the active scene, the party, encounters, generators and music in one screen.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="primary" size="lg" onClick={() => start(next?.id)} loading={busy}>
          <Clapperboard /> Start {next ? `session ${next.number}` : "session"}
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link href={`/w/${w.worldId}/campaigns/${campaignId}/prepare`}>
            <NotebookPen /> Prepare first
          </Link>
        </Button>
      </div>
      {next?.prep && (
        <section className="mt-10">
          <h2 className="mb-2 text-sm font-semibold text-muted">Your prep</h2>
          <div className="rounded-lg border border-line bg-surface p-5">
            <Markdown refs={refs}>{next.prep}</Markdown>
          </div>
        </section>
      )}
      {lastRecap?.recap && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-muted">Last time (session {lastRecap.number})</h2>
          <div className="rounded-lg border border-line bg-surface p-5">
            <Markdown refs={refs}>{lastRecap.recap}</Markdown>
          </div>
        </section>
      )}
    </div>
  );
}
