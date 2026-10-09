"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiWorking } from "@/components/ai/ai-working";
import { useWorld } from "@/components/shell/world-context";
import { dismissFollowOnAction, followOnAction } from "@/server/actions/follow-on";

export interface FollowOnView {
  revisionId: string;
  description: string;
  campaign: string | null;
  touches: { id: string; name: string; type: string }[];
}

/** "Lady Marr is now dead. That touches 7 entries." with a button to have Claude propose what follows. */
export function FollowOnCallout({ entityId, change }: { entityId: string; change: FollowOnView }) {
  const w = useWorld();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [gone, setGone] = React.useState(false);
  if (gone) return null;
  const names = change.touches.slice(0, 3).map((t) => t.name);
  const more = change.touches.length - names.length;

  const propose = async () => {
    setBusy(true);
    const res = await followOnAction(w.worldId, { entityId, revisionId: change.revisionId });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    if (!res.data.accepted) {
      toast.info("Claude didn't find anything that needs to change.");
      setGone(true);
      return;
    }
    router.push(`/w/${w.worldId}/proposals/${res.data.batchId}`);
  };

  return (
    <section aria-label="Follow-on changes" className="mb-6 rounded-lg border border-arcane/35 bg-arcane-soft/25 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <GitBranch className="mt-0.5 size-4 shrink-0 text-arcane" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-fg">{change.description}.</p>
            <p className="text-muted">
              That touches {change.touches.length} {change.touches.length === 1 ? "entry" : "entries"}: {names.join(", ")}
              {more > 0 ? ` and ${more} more` : ""}. Claude can propose what follows, for you to review.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setGone(true);
              const res = await dismissFollowOnAction(w.worldId, change.revisionId);
              if (!res.ok) {
                setGone(false);
                toast.error(res.error);
              }
            }}
          >
            Not now
          </Button>
          <Button variant="arcane" size="sm" onClick={propose} loading={busy}>
            <GitBranch /> Propose what follows
          </Button>
        </div>
      </div>
      <AiWorking active={busy} live={w.aiProvider.live} what="Claude is following the threads" typical="20–40 seconds" className="mt-2" />
    </section>
  );
}
