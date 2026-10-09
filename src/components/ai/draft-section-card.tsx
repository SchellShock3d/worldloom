"use client";

import * as React from "react";
import { Check, Pencil, RefreshCw, RotateCcw, Send } from "lucide-react";
import { Button, Spinner } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Input } from "@/components/ui/input";
import { AiWorking } from "@/components/ai/ai-working";
import { cn } from "@/lib/utils";

export type DraftStatus = "idle" | "drafting" | "ready" | "stale" | "error";

export interface DraftSectionState {
  status: DraftStatus;
  notes: string[];
  kept?: boolean;
  error?: string;
  hasData: boolean;
}

/**
 * One section of something Claude is writing for the DM to steer: the world creator's sections
 * and a build-out's. Keep, redo, one-click nudges, a note, and "update" when it's out of date.
 */
export function DraftSectionCard({
  title,
  index,
  working,
  state,
  summary,
  waiting,
  aiLive,
  nudges,
  busy,
  waitingText = "Claude writes this once the sections above are done.",
  onKeep,
  onChangeMind,
  onRedo,
  onSteer,
  onRefresh,
  onRetry,
  children,
}: {
  title: string;
  index: number;
  working: string;
  state: DraftSectionState;
  /** One line shown when the section is kept and folded. */
  summary: string;
  waiting: boolean;
  aiLive: boolean;
  nudges: string[];
  busy: boolean;
  waitingText?: string;
  onKeep: () => void;
  onChangeMind: () => void;
  onRedo: () => void;
  onSteer: (note: string) => void;
  onRefresh: () => void;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  const [note, setNote] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const drafting = state.status === "drafting";
  const steer = (n: string) => {
    if (!n.trim()) return;
    onSteer(n.trim());
    setNote("");
  };
  return (
    <section aria-label={title} className={cn("rounded-xl border bg-surface", state.kept ? "border-accent/50" : "border-line", waiting && "opacity-60")}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="flex items-center gap-2.5 font-semibold">
          <span className={cn("flex size-6 items-center justify-center rounded-full border text-xs tabular", state.hasData ? "border-accent bg-accent text-accent-fg" : "border-line text-faint")}>{index + 1}</span>
          {title}
          {state.kept && (
            <Badge tone="accent">
              <Check /> Kept
            </Badge>
          )}
          {state.status === "stale" && <Badge tone="brass">Out of date</Badge>}
        </h2>
        {drafting ? (
          <span className="inline-flex items-center gap-2 text-sm text-arcane">
            <Spinner className="size-3.5" /> {state.hasData ? "Rewriting…" : `${working}…`}
          </span>
        ) : waiting ? (
          <span className="text-sm text-faint">Up next</span>
        ) : state.hasData && !state.kept ? (
          <div className="flex items-center gap-1">
            {state.status === "stale" && (
              <Button size="sm" variant="secondary" onClick={onRefresh} disabled={busy}>
                <RefreshCw /> Update
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onRedo} disabled={busy}>
              <RotateCcw /> Redo
            </Button>
            <Button size="sm" variant="ghost" onClick={onKeep}>
              <Check /> Keep
            </Button>
          </div>
        ) : state.kept ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOpen(true);
              onChangeMind();
            }}
          >
            <Pencil /> Change
          </Button>
        ) : null}
      </header>

      <div className={cn("px-4 py-4", drafting && state.hasData && "pointer-events-none opacity-50")}>
        {state.kept && state.hasData && !open ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <p className="min-w-0 text-muted">{summary}</p>
            <button type="button" onClick={() => setOpen(true)} className="text-muted underline-offset-4 hover:text-fg hover:underline">
              Show
            </button>
          </div>
        ) : state.status === "error" && !state.hasData ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-ember">{state.error ?? "Claude couldn't write this section."}</span>
            <Button size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCw /> Try again
            </Button>
          </div>
        ) : state.hasData ? (
          children
        ) : drafting ? (
          <div className="flex flex-col gap-3" aria-busy>
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface-3" />
            <div className="h-4 w-full animate-pulse rounded bg-surface-3" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-surface-3" />
            <AiWorking active live={aiLive} what={`Claude is ${working.charAt(0).toLowerCase()}${working.slice(1)}`} typical="20–60 seconds" />
          </div>
        ) : (
          <p className="text-sm text-faint">{waitingText}</p>
        )}
      </div>

      {state.hasData && !state.kept && !drafting && (
        <footer className="flex flex-col gap-2 border-t border-line px-4 py-3">
          <div className="flex flex-wrap gap-1.5" aria-label={`Quick changes to ${title}`}>
            {nudges.map((n) => (
              <button key={n} type="button" disabled={busy} onClick={() => steer(n)} className="rounded-full px-2.5 py-0.5 text-sm text-muted ring-1 ring-line hover:text-fg hover:ring-arcane/50 disabled:opacity-50">
                {n}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              steer(note);
            }}
          >
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Tell Claude what to change in ${title.toLowerCase()}…`} aria-label={`Steer ${title}`} disabled={busy} />
            <Button type="submit" variant="arcane" disabled={busy || !note.trim()} aria-label="Send">
              <Send />
            </Button>
          </form>
          {state.notes.length > 0 && <p className="text-xs text-faint">Your notes so far: {state.notes.join(" · ")}</p>}
        </footer>
      )}
    </section>
  );
}
