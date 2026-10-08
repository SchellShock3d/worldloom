"use client";

import * as React from "react";
import { toast } from "sonner";
import { Sparkles, X } from "lucide-react";
import { Spinner } from "@/components/ui/button";
import { suggestFieldAction } from "@/server/actions/creator";
import type { CreatorDraft } from "@/server/ai/tasks/creator";
import { cn } from "@/lib/utils";

/** Pill buttons for picking one or several options. */
export function ChipGroup({
  options,
  value,
  onChange,
  label,
  multiple = false,
  className,
}: {
  options: readonly string[];
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  label: string;
  multiple?: boolean;
  className?: string;
}) {
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = selected.has(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (multiple) onChange(on ? [...selected].filter((x) => x !== o) : [...selected, o]);
              else onChange(o);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              on ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A label row with a "Suggest" button. Suggestions come from Claude (or the offline banks), built
 * from everything the DM has written in the other steps, and appear as chips to pick from.
 */
export function SuggestField({
  id,
  label,
  hint,
  field,
  draft,
  value,
  onChange,
  mode = "replace",
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  field: string;
  draft: () => CreatorDraft;
  value: string;
  onChange: (v: string) => void;
  /** "append" adds to a list-like field; "replace" swaps the whole value. */
  mode?: "replace" | "append";
  children: React.ReactNode;
}) {
  const [busy, setBusy] = React.useState(false);
  const [ideas, setIdeas] = React.useState<string[]>([]);
  async function suggest() {
    setBusy(true);
    const res = await suggestFieldAction(field, draft());
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setIdeas(res.data.suggestions);
    if (!res.data.suggestions.length) toast.message("No suggestions this time. Try again in a moment.");
  }
  function pick(s: string) {
    if (mode === "append" && value.trim()) onChange(`${value.trim().replace(/[,.;]$/, "")}, ${s}`);
    else onChange(s);
    setIdeas((xs) => xs.filter((x) => x !== s));
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-muted">
          {label}
        </label>
        <button type="button" onClick={suggest} disabled={busy} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-arcane hover:bg-arcane-soft disabled:opacity-60" aria-label={`Suggest ${label.toLowerCase()}`}>
          {busy ? <Spinner className="size-3" /> : <Sparkles className="size-3" />} Suggest
        </button>
      </div>
      {children}
      {ideas.length > 0 && (
        <div className="flex flex-wrap items-start gap-1.5 pt-1" aria-label="Suggestions">
          {ideas.map((s) => (
            <button key={s} type="button" onClick={() => pick(s)} className="max-w-full rounded-md border border-arcane/30 bg-arcane-soft/50 px-2.5 py-1 text-left text-sm text-fg hover:border-arcane/60">
              {s}
            </button>
          ))}
          <button type="button" onClick={() => setIdeas([])} className="rounded-md p-1 text-faint hover:text-fg" aria-label="Dismiss suggestions">
            <X className="size-4" />
          </button>
        </div>
      )}
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  );
}

/** A small number stepper (1–8). */
export function Stepper({ id, value, onChange, min = 1, max = 8 }: { id: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-md border border-line">
      <button type="button" className="h-8 w-8 text-muted hover:text-fg disabled:opacity-40" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Fewer">
        −
      </button>
      <output id={id} className="w-8 text-center text-sm font-semibold tabular">
        {value}
      </output>
      <button type="button" className="h-8 w-8 text-muted hover:text-fg disabled:opacity-40" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="More">
        +
      </button>
    </div>
  );
}
