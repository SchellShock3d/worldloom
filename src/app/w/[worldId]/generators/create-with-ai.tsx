"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea, NativeSelect } from "@/components/ui/input";
import { EntityPicker, type EntityOption } from "@/components/entity/entity-picker";
import { useWorld } from "@/components/shell/world-context";
import { AiWorking } from "@/components/ai/ai-working";
import { generateAction } from "@/server/actions/ai";
import { PLACE_TYPES } from "@/lib/entity-types";
import { cn, lowerLabel } from "@/lib/utils";

const PRESETS: { key: string; label: string; type: string | null; prompt: string; count?: number }[] = [
  { key: "town", label: "Town", type: "settlement", prompt: "A small town with a distinct identity: who runs it, what it trades, what it fears, two notable locals and a local problem." },
  { key: "npc", label: "NPC", type: "npc", prompt: "An NPC with a clear want, a secret, a way of speaking, and ties to people and factions that already exist." },
  { key: "religion", label: "Religion", type: "religion", prompt: "A faith: its god or gods, beliefs, clergy, rites and holy days, and where it sits politically." },
  { key: "faction", label: "Faction", type: "faction", prompt: "A faction with goals, methods, a leader, resources, and allies and enemies among existing powers." },
  { key: "tavern", label: "Tavern", type: "tavern", prompt: "A tavern with atmosphere, a menu, an owner and regulars, and a rumour or two circulating." },
  { key: "shop", label: "Shop", type: "shop", prompt: "A shop with a memorable owner, what it sells and at what prices, and something unusual under the counter." },
  { key: "dungeon", label: "Dungeon", type: "dungeon", prompt: "A dungeon or adventure site: its history, who or what dwells there now, key rooms, and why someone wants it explored." },
  { key: "rumours", label: "Rumours", type: "rumour", prompt: "Rumours circulating right now, based on actual recent events and threads. Mix true, half-true and false.", count: 4 },
  { key: "quests", label: "Quest hooks", type: "quest", prompt: "Quest hooks that grow out of current world threads and the NPCs the party knows.", count: 3 },
  { key: "history", label: "Historical events", type: "event", prompt: "Historical events that explain how things got the way they are, consistent with the existing timeline.", count: 3 },
];

export function CreateWithAI() {
  const w = useWorld();
  const [preset, setPreset] = React.useState(PRESETS[0]!);
  const [request, setRequest] = React.useState(PRESETS[0]!.prompt);
  const [count, setCount] = React.useState(1);
  const [place, setPlace] = React.useState<EntityOption | null>(null);
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<{ batchId: string; summary: string; accepted: number; provider: string } | null>(null);

  const pick = (p: (typeof PRESETS)[number]) => {
    setPreset(p);
    setRequest(p.prompt);
    setCount(p.count ?? 1);
  };
  const submit = async () => {
    if (!request.trim()) return toast.error("Describe what you want.");
    setPending(true);
    const res = await generateAction(w.worldId, { request: place ? `${request}\nSet in or near ${place.name}.` : request, type: preset.type, count, locationId: place?.id ?? null, campaignId: w.activeCampaign?.id ?? null });
    setPending(false);
    if (!res.ok) return void toast.error(res.error);
    setResult({ batchId: res.data.batchId, summary: res.data.summary, accepted: res.data.accepted, provider: res.data.provider });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What to create">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            role="radio"
            aria-checked={preset.key === p.key}
            onClick={() => pick(p)}
            className={cn("rounded-full border px-3 py-1 text-sm", preset.key === p.key ? "border-arcane/60 bg-arcane-soft text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg")}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Field label="What you want" htmlFor="gen-req">
        <Textarea id="gen-req" value={request} onChange={(e) => setRequest(e.target.value)} className="min-h-20" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Where (optional)">
          <EntityPicker value={place} onChange={setPlace} types={PLACE_TYPES} placeholder="Anywhere" allowCreate={false} />
        </Field>
        <Field label="How many" htmlFor="gen-count">
          <NativeSelect id="gen-count" value={String(count)} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={submit} loading={pending}>
          <Sparkles /> Draft {lowerLabel(preset.label)}
        </Button>
        {pending && !w.aiProvider.live && <span className="text-sm text-faint">Reading your world for context…</span>}
        <AiWorking active={pending} live={w.aiProvider.live} typical="20–60 seconds" />
      </div>
      {result && (
        <div className="rounded-lg border border-arcane/40 bg-arcane-soft/40 px-4 py-3">
          <p className="text-sm">
            <span className="font-medium">
              {result.accepted} proposal{result.accepted === 1 ? "" : "s"} drafted
            </span>
            {result.summary && <span className="text-muted"> · {result.summary}</span>}
          </p>
          {result.provider === "offline" && <p className="mt-0.5 text-xs text-faint">Drafted by the built-in generator. Connect an AI provider for drafts that read your whole world.</p>}
          <Button asChild size="sm" variant="secondary" className="mt-2">
            <Link href={`/w/${w.worldId}/proposals/${result.batchId}`}>Review and approve</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
