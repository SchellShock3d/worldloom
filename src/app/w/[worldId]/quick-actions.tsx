"use client";

import Link from "next/link";
import { Compass, FastForward, Map as MapIcon, Sparkles, Zap } from "lucide-react";
import { useWorld } from "@/components/shell/world-context";
import { TypeIcon } from "@/components/entity/type-icon";
import { cn } from "@/lib/utils";

export function QuickActions({ hasCampaign, campaignId, mapId }: { hasCampaign: boolean; campaignId: string | null; mapId: string | null }) {
  const w = useWorld();
  const base = `/w/${w.worldId}`;
  const item = "flex h-9 shrink-0 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-medium text-fg hover:border-line-strong hover:bg-surface-2 [&_svg]:size-4";
  return (
    <nav aria-label="Quick actions" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <button className={item} onClick={() => w.openAdvance()}>
        <FastForward className="text-brass" /> Advance world
      </button>
      <button className={item} onClick={() => w.openQuickCreate({ type: "npc" })}>
        <TypeIcon type="npc" /> New NPC
      </button>
      <button className={item} onClick={() => w.openQuickCreate({ type: "location" })}>
        <TypeIcon type="location" /> New location
      </button>
      <button className={item} onClick={() => w.openQuickCreate({ type: "quest" })}>
        <TypeIcon type="quest" /> New quest
      </button>
      <button className={cn(item, "border-arcane/30 text-arcane")} onClick={() => w.openAssistant()}>
        <Sparkles /> Ask AI
      </button>
      <Link className={item} href={`${base}/generators`}>
        <Zap className="text-ember" /> I need something now
      </Link>
      {campaignId && (
        <Link className={item} href={`${base}/campaigns/${campaignId}`}>
          <Compass className="text-brass" /> Open campaign
        </Link>
      )}
      <Link className={item} href={mapId ? `${base}/maps/${mapId}` : `${base}/maps`}>
        <MapIcon /> Open map
      </Link>
    </nav>
  );
}
