"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FastForward } from "lucide-react";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useWorld } from "@/components/shell/world-context";
import { advanceWorldAction } from "@/server/actions/ai";
import { durationToMinutes, formatDate, type AdvanceUnit } from "@/lib/calendar";
import { cn } from "@/lib/utils";

const PRESETS: { label: string; amount: number; unit: AdvanceUnit }[] = [
  { label: "1 hour", amount: 1, unit: "hours" },
  { label: "8 hours", amount: 8, unit: "hours" },
  { label: "1 day", amount: 1, unit: "days" },
  { label: "3 days", amount: 3, unit: "days" },
  { label: "1 week", amount: 1, unit: "weeks" },
  { label: "1 month", amount: 1, unit: "months" },
];

export function AdvanceDialog({ open, onOpenChange, campaignId, defaultNote }: { open: boolean; onOpenChange: (o: boolean) => void; campaignId: string | null; defaultNote?: string }) {
  const w = useWorld();
  const router = useRouter();
  const [amount, setAmount] = React.useState(1);
  const [unit, setUnit] = React.useState<AdvanceUnit>("weeks");
  const [note, setNote] = React.useState(defaultNote ?? "");
  const [pending, setPending] = React.useState(false);
  const now = w.activeCampaign?.currentAt ?? w.worldNow;
  let target = now;
  try {
    target = now + durationToMinutes(w.calendar, amount, unit, now);
  } catch {
    /* invalid while typing */
  }

  async function go() {
    setPending(true);
    const res = await advanceWorldAction(w.worldId, campaignId, { amount, unit, note: note.trim() || undefined });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`${res.data.accepted} developments proposed`, { description: "Nothing changes until you approve them." });
    onOpenChange(false);
    router.push(`/w/${w.worldId}/proposals/${res.data.batchId}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Advance the world"
        description={
          campaignId
            ? "Choose how much in-world time passes. Worldloom examines world threads, faction goals, pending consequences and travel, then proposes what happens. You review every change."
            : "No campaign is selected, so this moves the world clock itself: threads and factions advance, and you review every change. Campaigns keep their own clocks."
        }
        size="md"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setAmount(p.amount);
                  setUnit(p.unit);
                }}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  amount === p.amount && unit === p.unit ? "border-accent bg-accent-soft text-accent" : "border-line hover:border-line-strong",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <Field label="Custom" htmlFor="adv-amount" className="w-28">
              <Input id="adv-amount" type="number" min={1} max={1000} value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))} />
            </Field>
            <NativeSelect value={unit} onChange={(e) => setUnit(e.target.value as AdvanceUnit)} className="w-36" aria-label="Unit">
              <option value="hours">hours</option>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
              <option value="years">years</option>
            </NativeSelect>
          </div>
          <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5 text-sm">
            <span className="text-faint">From</span> <span className="font-medium">{formatDate(w.calendar, now)}</span> <span className="text-faint">to</span>{" "}
            <span className="font-medium text-brass">{formatDate(w.calendar, target)}</span>
          </div>
          <Field label="What is the party doing? (optional)" htmlFor="adv-note" hint="E.g. “travelling the Northroad to Riverfall” or “resting and recovering in Stonehaven”.">
            <Textarea id="adv-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={go} loading={pending}>
            <FastForward /> Propose developments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
