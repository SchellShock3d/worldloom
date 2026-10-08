"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Meter } from "@/components/ui/display";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Slider } from "@/components/ui/primitives";
import { Popover, PopoverContent, PopoverTrigger, ConfirmDialog } from "@/components/ui/overlays";
import { useWorld } from "@/components/shell/world-context";
import { upsertMetricAction, deleteMetricAction, restoreRevisionAction } from "@/server/actions/entities";
import { commitStateToCanonAction, setCampaignEntityStateAction } from "@/server/actions/campaigns";
import { EntityPicker, type EntityOption } from "./entity-picker";
import { timeAgo } from "@/lib/utils";

export function MetricsPanel({ entityId, metrics }: { entityId: string; metrics: { id: string; label: string; value: number; min: number; max: number }[] }) {
  const w = useWorld();
  const router = useRouter();
  const [label, setLabel] = React.useState("");
  const [value, setValue] = React.useState(50);
  const save = async (l: string, v: number, min = 0, max = 100) => {
    const res = await upsertMetricAction(w.worldId, { entityId, label: l, value: v, min, max });
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  };
  return (
    <div className="flex flex-col gap-2.5">
      {metrics.map((m) => (
        <div key={m.id} className="group">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted">{m.label}</span>
            <span className="flex items-center gap-1">
              <button onClick={() => save(m.label, m.value - 5, m.min, m.max)} className="rounded p-0.5 text-faint hover:bg-surface-2 hover:text-fg" aria-label={`Decrease ${m.label}`}>
                <Minus className="size-3" />
              </button>
              <span className="w-7 text-center tabular">{m.value}</span>
              <button onClick={() => save(m.label, m.value + 5, m.min, m.max)} className="rounded p-0.5 text-faint hover:bg-surface-2 hover:text-fg" aria-label={`Increase ${m.label}`}>
                <Plus className="size-3" />
              </button>
              <button
                onClick={async () => {
                  const res = await deleteMetricAction(w.worldId, m.id);
                  if (res.ok) router.refresh();
                }}
                className="rounded p-0.5 text-faint opacity-0 hover:text-ember group-hover:opacity-100"
                aria-label={`Remove ${m.label}`}
              >
                <Trash2 className="size-3" />
              </button>
            </span>
          </div>
          <Meter value={m.value} min={m.min} max={m.max} tone="brass" className="mt-1" label={m.label} />
        </div>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button className="self-start text-xs text-faint hover:text-accent">+ Add tracker</button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="flex flex-col gap-3">
            <Field label="Tracker" htmlFor="m-label" hint="e.g. Influence, Safety, Food prices">
              <Input id="m-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Field label={`Starting value: ${value}`}>
              <Slider value={[value]} min={0} max={100} onValueChange={([v]) => setValue(v ?? 50)} />
            </Field>
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                if (!label.trim()) return;
                await save(label.trim(), value);
                setLabel("");
              }}
            >
              Add
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function CampaignStatePanel({
  entity,
  overlay,
  statuses,
}: {
  entity: { id: string; name: string; status: string | null; type: string };
  overlay: { status: string | null; reputation: number | null; attitude: string | null; knowledge: string; location: { id: string; name: string } | null } | null;
  statuses: string[];
}) {
  const w = useWorld();
  const router = useRouter();
  const c = w.activeCampaign!;
  const [rep, setRep] = React.useState(overlay?.reputation ?? 0);
  const [attitude, setAttitude] = React.useState(overlay?.attitude ?? "");
  React.useEffect(() => setRep(overlay?.reputation ?? 0), [overlay?.reputation]);
  const save = async (patch: Omit<Parameters<typeof setCampaignEntityStateAction>[2], "entityId">) => {
    const res = await setCampaignEntityStateAction(w.worldId, c.id, { ...patch, entityId: entity.id });
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  };
  const hasOverride = !!(overlay?.status || overlay?.location);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-faint">How things stand in {c.name}. World canon is unchanged unless you commit.</p>
      <Field label="Players know">
        <NativeSelect value={overlay?.knowledge ?? "unknown"} onChange={(e) => save({ knowledge: e.target.value as "unknown" })} aria-label="Player knowledge">
          <option value="unknown">Nothing</option>
          <option value="rumoured">Rumours</option>
          <option value="partial">Some of it</option>
          <option value="discovered">Discovered</option>
        </NativeSelect>
      </Field>
      {statuses.length > 0 && (
        <Field label={`Status here${entity.status ? ` (canon: ${entity.status})` : ""}`}>
          <NativeSelect value={overlay?.status ?? ""} onChange={(e) => save({ status: e.target.value || null })} aria-label="Campaign status">
            <option value="">Same as canon</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {["npc", "creature", "item", "magic_item"].includes(entity.type) && (
        <Field label="Location here">
          <EntityPicker value={overlay?.location ? { ...overlay.location, type: "location" } : null} onChange={(v: EntityOption | null) => save({ locationId: v?.id ?? null })} placeholder="Same as canon" allowCreate={false} size="sm" />
        </Field>
      )}
      {["npc", "faction", "organization", "settlement", "nation", "religion", "deity"].includes(entity.type) && (
        <>
          <Field label={`Attitude toward the party: ${rep > 0 ? "+" : ""}${rep}`}>
            <Slider value={[rep]} min={-100} max={100} step={5} onValueChange={([v]) => setRep(v ?? 0)} onValueCommit={([v]) => save({ reputation: v ?? 0 })} />
            <div className="flex justify-between text-2xs text-faint">
              <span>Hostile</span>
              <span>Neutral</span>
              <span>Devoted</span>
            </div>
          </Field>
          <Field label="In a word" htmlFor="ces-att">
            <Input id="ces-att" value={attitude} onChange={(e) => setAttitude(e.target.value)} onBlur={() => attitude !== (overlay?.attitude ?? "") && save({ attitude: attitude || null })} placeholder="grateful, wary, vengeful…" className="h-7 text-sm" />
          </Field>
        </>
      )}
      {hasOverride && (
        <ConfirmDialog
          trigger={
            <Button variant="secondary" size="sm" className="self-start">
              Commit to world canon
            </Button>
          }
          title="Commit to world canon?"
          description={`${entity.name}'s status/location from ${c.name} becomes the world's canon, affecting every campaign.`}
          confirmLabel="Commit"
          destructive={false}
          onConfirm={async () => {
            const res = await commitStateToCanonAction(w.worldId, c.id, entity.id);
            if (!res.ok) toast.error(res.error);
            else {
              toast.success("Committed to world canon");
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}

export function HistoryPanel({ revisions }: { revisions: { id: string; summary: string; action: string; actorType: string; createdAt: string | Date; before: Record<string, unknown> | null; after: Record<string, unknown> | null; proposalId: string | null }[] }) {
  const w = useWorld();
  const router = useRouter();
  if (!revisions.length) return <p className="text-sm text-faint">No history yet.</p>;
  return (
    <ol className="relative flex flex-col gap-4 border-l border-line pl-5">
      {revisions.map((r) => (
        <li key={r.id} className="relative">
          <span className={`absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-surface ${r.actorType === "ai" ? "bg-arcane" : "bg-line-strong"}`} aria-hidden />
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{r.summary || r.action}</p>
            {r.actorType === "ai" && (
              <Badge tone="arcane">
                <Sparkles /> AI, approved by you
              </Badge>
            )}
            <span className="text-xs text-faint">{timeAgo(r.createdAt)}</span>
          </div>
          {r.before && r.after && Object.keys(r.after).length > 0 && (
            <dl className="mt-1.5 grid gap-1 text-sm">
              {Object.keys(r.after)
                .filter((k) => !["body", "dmNotes", "fields"].includes(k))
                .slice(0, 6)
                .map((k) => (
                  <div key={k} className="flex flex-wrap gap-2">
                    <dt className="text-faint">{k}</dt>
                    <dd className="text-muted line-through decoration-faint">{fmt(r.before?.[k])}</dd>
                    <dd>→ {fmt(r.after?.[k])}</dd>
                  </div>
                ))}
              {["body", "dmNotes", "fields"].some((k) => r.after && k in r.after) && <p className="text-xs text-faint">Text or details changed.</p>}
            </dl>
          )}
          {r.before && r.action !== "create" && (
            <Button
              variant="ghost"
              size="xs"
              className="mt-1"
              onClick={async () => {
                const res = await restoreRevisionAction(w.worldId, r.id);
                if (!res.ok) toast.error(res.error);
                else {
                  toast.success("Restored the earlier version");
                  router.refresh();
                }
              }}
            >
              <RotateCcw /> Restore this version
            </Button>
          )}
        </li>
      ))}
    </ol>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v.length > 60 ? v.slice(0, 57) + "…" : v;
  if (Array.isArray(v)) return v.join(", ") || "—";
  if (typeof v === "object") return "…";
  return String(v);
}
