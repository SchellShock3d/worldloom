"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, FastForward, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip } from "@/components/ui/overlays";
import { useWorld } from "@/components/shell/world-context";
import { moveThreadAction } from "@/server/actions/play";

export function ThreadsHeaderActions({ hasCampaign }: { hasCampaign: boolean }) {
  const w = useWorld();
  const router = useRouter();
  return (
    <>
      <Button variant="secondary" onClick={() => w.openQuickCreate({ type: "world_thread", onCreated: () => router.refresh() })}>
        <Plus /> New thread
      </Button>
      {hasCampaign ? (
        <Button variant="primary" onClick={() => w.openAdvance()}>
          <FastForward /> Advance the world
        </Button>
      ) : (
        <Tooltip content="Choose a campaign first: time passes for a campaign.">
          <span>
            <Button variant="primary" disabled>
              <FastForward /> Advance the world
            </Button>
          </span>
        </Tooltip>
      )}
    </>
  );
}

type Status = "dormant" | "active" | "escalating" | "resolved" | "failed" | "paused";

export function ThreadActions({ threadId, status, progress }: { threadId: string; status: Status | string; progress: number }) {
  const w = useWorld();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const move = async (change: { progressDelta?: number; status?: Status }, done: string) => {
    setPending(true);
    const res = await moveThreadAction(w.worldId, threadId, change);
    setPending(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(done);
    router.refresh();
  };
  const open = status === "active" || status === "escalating";
  return (
    <div className="flex items-center gap-1">
      {open && progress < 100 && (
        <Button size="xs" variant="ghost" loading={pending} onClick={() => move({ progressDelta: 10 }, "Thread moved forward")}>
          Push +10%
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="xs" variant="ghost" aria-label="Change status">
            Status <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status !== "escalating" && <DropdownMenuItem onSelect={() => move({ status: "escalating" }, "Thread escalating")}>Escalate</DropdownMenuItem>}
          {status !== "active" && <DropdownMenuItem onSelect={() => move({ status: "active" }, "Thread active")}>{status === "dormant" || status === "paused" ? "Wake up" : "Mark active"}</DropdownMenuItem>}
          {status !== "paused" && open && <DropdownMenuItem onSelect={() => move({ status: "paused" }, "Thread paused")}>Pause</DropdownMenuItem>}
          {status !== "dormant" && <DropdownMenuItem onSelect={() => move({ status: "dormant" }, "Thread dormant")}>Let it go dormant</DropdownMenuItem>}
          {progress > 0 && open && <DropdownMenuItem onSelect={() => move({ progressDelta: -10 }, "Thread set back")}>Set back 10%</DropdownMenuItem>}
          <DropdownMenuSeparator />
          {status !== "resolved" && <DropdownMenuItem onSelect={() => move({ status: "resolved" }, "Thread resolved")}>Resolved</DropdownMenuItem>}
          {status !== "failed" && (
            <DropdownMenuItem danger onSelect={() => move({ status: "failed" }, "Thread failed")}>
              Failed or thwarted
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
