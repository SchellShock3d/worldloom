"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Compass, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TypeIcon } from "@/components/entity/type-icon";
import { useWorld } from "@/components/shell/world-context";
import { dismissThinSpotAction } from "@/server/actions/thin-spots";
import type { ThinSpot } from "@/server/services/thin-spots";

export function ThinSpotList({ spots, dismissed, canEdit, partyPlace, limit }: { spots: ThinSpot[]; dismissed: number; canEdit: boolean; partyPlace: string | null; limit?: number }) {
  const w = useWorld();
  const router = useRouter();
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const shown = spots.filter((s) => !hidden.has(s.id)).slice(0, limit ?? Infinity);

  const dismiss = async (s: ThinSpot) => {
    setHidden((h) => new Set(h).add(s.id));
    const res = await dismissThinSpotAction(w.worldId, s.id, true);
    if (!res.ok) {
      setHidden((h) => {
        const n = new Set(h);
        n.delete(s.id);
        return n;
      });
      return toast.error(res.error);
    }
    toast.success(`Dismissed “${s.title}”`, {
      action: {
        label: "Undo",
        onClick: async () => {
          await dismissThinSpotAction(w.worldId, s.id, false);
          setHidden((h) => {
            const n = new Set(h);
            n.delete(s.id);
            return n;
          });
          router.refresh();
        },
      },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {shown.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
          {shown.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <TypeIcon type={s.entity.type} className="mt-1 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">
                    <Link href={`/w/${w.worldId}/e/${s.entity.id}`} className="hover:text-accent">
                      {s.title}
                    </Link>
                  </p>
                  <p className="text-sm text-muted">
                    {s.detail}
                    {s.nearParty && partyPlace && (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-brass">
                        <Compass className="size-3.5" /> The party is here
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                  <Button variant="ghost" size="sm" onClick={() => dismiss(s)}>
                    Not needed
                  </Button>
                  <Button asChild variant="arcane" size="sm">
                    <Link href={`/w/${w.worldId}/e/${s.entity.id}/build?parts=${s.parts.join(",")}`}>
                      <Hammer /> Fill this in
                    </Link>
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!limit && dismissed > 0 && canEdit && (
        <button
          type="button"
          className="self-start text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
          onClick={async () => {
            const res = await dismissThinSpotAction(w.worldId, null, false);
            if (!res.ok) return toast.error(res.error);
            router.refresh();
          }}
        >
          Bring back {dismissed} dismissed
        </button>
      )}
    </div>
  );
}
