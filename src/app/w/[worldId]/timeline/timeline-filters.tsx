"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, Switch } from "@/components/ui/primitives";
import { EntityPicker } from "@/components/entity/entity-picker";
import { TypeIcon } from "@/components/entity/type-icon";
import { useWorld } from "@/components/shell/world-context";
import { cn } from "@/lib/utils";

const KINDS = [
  { value: "historical", label: "History", dot: "bg-brass" },
  { value: "world", label: "World", dot: "bg-accent" },
  { value: "campaign", label: "Campaign", dot: "bg-play" },
  { value: "character", label: "Character", dot: "bg-people" },
  { value: "faction", label: "Faction", dot: "bg-powers" },
];

export function NewEventButton() {
  const w = useWorld();
  const router = useRouter();
  return (
    <Button variant="primary" onClick={() => w.openQuickCreate({ type: "event", onCreated: () => router.refresh() })}>
      <Plus /> New event
    </Button>
  );
}

export function TimelineFilters({
  scope,
  hasCampaign,
  campaignName,
  kinds,
  focus,
  playersOnly,
  lockPlayers,
}: {
  scope: string;
  hasCampaign: boolean;
  campaignName: string | null;
  kinds: string[];
  focus: { id: string; name: string; type: string } | null;
  playersOnly: boolean;
  lockPlayers: boolean;
}) {
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
  const toggleKind = (k: string) => {
    const set = new Set(kinds);
    if (set.has(k)) set.delete(k);
    else set.add(k);
    push({ kind: Array.from(set).join(",") || null });
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-line py-3 transition-opacity", isPending && "opacity-60")}>
      {hasCampaign && (
        <Segmented
          size="sm"
          value={scope}
          onChange={(v) => push({ scope: v === "all" ? null : v })}
          options={[
            { value: "all", label: "Everything" },
            { value: "world", label: "World only" },
            { value: "campaign", label: campaignName ? `${campaignName} only` : "Campaign only" },
          ]}
        />
      )}
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Event kinds">
        {KINDS.map((k) => {
          const on = kinds.length === 0 || kinds.includes(k.value);
          return (
            <button
              key={k.value}
              onClick={() => toggleKind(k.value)}
              aria-pressed={kinds.includes(k.value)}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs", on ? "border-line-strong text-fg" : "border-line text-faint")}
            >
              <span className={cn("size-2 rounded-full", on ? k.dot : "bg-surface-3")} /> {k.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        {focus ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line-strong py-0.5 pl-2 pr-1 text-sm">
            <TypeIcon type={focus.type} className="size-3.5" /> Involving {focus.name}
            <button onClick={() => push({ entity: null })} className="rounded p-0.5 text-faint hover:text-fg" aria-label="Clear entity filter">
              <X className="size-3.5" />
            </button>
          </span>
        ) : (
          <div className="w-56">
            <EntityPicker value={null} onChange={(e) => e && push({ entity: e.id })} placeholder="Involving a character, faction, place…" size="sm" allowCreate={false} />
          </div>
        )}
      </div>
      {!lockPlayers && (
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          <Switch checked={playersOnly} onCheckedChange={(c) => push({ players: c ? "1" : null })} /> What players can see
        </label>
      )}
    </div>
  );
}
