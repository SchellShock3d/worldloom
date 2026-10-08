"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, Switch } from "@/components/ui/primitives";
import { useWorld } from "@/components/shell/world-context";
import { cn } from "@/lib/utils";

export function NewsControls({
  days,
  playersOnly,
  lockPlayers,
  categories,
  active,
}: {
  days: string;
  playersOnly: boolean;
  lockPlayers: boolean;
  categories: { key: string; label: string; count: number }[];
  active: string | null;
}) {
  const w = useWorld();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  const push = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  const span = { "7": "week", "30": "month", "90": "season", "365": "year" }[days] ?? "month";
  return (
    <div className={cn("flex flex-col gap-3 border-y border-line py-3 transition-opacity", isPending && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Segmented
          size="sm"
          value={days}
          onChange={(v) => push({ days: v === "30" ? null : v })}
          options={[
            { value: "7", label: "Past week" },
            { value: "30", label: "Past month" },
            { value: "90", label: "Past season" },
            { value: "365", label: "Past year" },
          ]}
        />
        {!lockPlayers && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <Switch checked={playersOnly} onCheckedChange={(c) => push({ players: c ? "1" : null })} /> Player handout
          </label>
        )}
        {!lockPlayers && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-arcane"
            onClick={() =>
              w.openAssistant({
                prompt: `Brief me on the world news of the past ${span}: the most significant developments, what they mean for the party, and which threads look likely to boil over next. Keep it to what's canon.`,
              })
            }
          >
            <Sparkles /> Brief me
          </Button>
        )}
      </div>
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by kind of news">
          <button onClick={() => push({ cat: null })} aria-pressed={!active} className={cn("rounded-full border px-2.5 py-0.5 text-xs", !active ? "border-line-strong text-fg" : "border-line text-faint hover:text-fg")}>
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.key}
              onClick={() => push({ cat: active === c.key ? null : c.key })}
              aria-pressed={active === c.key}
              className={cn("rounded-full border px-2.5 py-0.5 text-xs", active === c.key ? "border-line-strong bg-surface-2 text-fg" : "border-line text-muted hover:text-fg")}
            >
              {c.label} <span className="text-faint">{c.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
