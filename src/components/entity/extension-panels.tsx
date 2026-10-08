"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleDashed, EyeOff, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Meter } from "@/components/ui/display";
import { Checkbox, Select, Slider, Switch } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { Field, Textarea } from "@/components/ui/input";
import { useWorld } from "@/components/shell/world-context";
import { ThreadLine } from "@/components/living/thread-line";
import { EntityPicker, type EntityOption } from "./entity-picker";
import { createClueAction, deleteClueAction, moveThreadAction, setClueDiscoveredAction, setQuestStatusAction, toggleObjectiveAction } from "@/server/actions/play";
import { formatDate, describeDuration } from "@/lib/calendar";
import type { Clue, QuestStatus, WorldThread } from "@/server/db/schema";
import { cn } from "@/lib/utils";

const QUEST_STATUSES: QuestStatus[] = ["unknown", "available", "active", "completed", "failed", "abandoned", "hidden"];

export function QuestPanel({
  questId,
  status,
  priority,
  objectives,
  giver,
  thread,
  rewards,
  consequences,
  playerKnowledge,
}: {
  questId: string;
  status: QuestStatus;
  priority: number;
  objectives: { id: string; text: string; status: "open" | "done" | "failed"; hidden: boolean }[];
  giver: { id: string; name: string } | null;
  thread: { id: string; name: string } | null;
  rewards: string;
  consequences: string;
  playerKnowledge: string;
}) {
  const w = useWorld();
  const router = useRouter();
  const setStatus = async (s: string) => {
    const res = await setQuestStatusAction(w.worldId, questId, s as QuestStatus, w.activeCampaign?.id ?? null);
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  };
  const cycle = async (o: (typeof objectives)[number]) => {
    const next = o.status === "open" ? "done" : o.status === "done" ? "failed" : "open";
    const res = await toggleObjectiveAction(w.worldId, o.id, next);
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  };
  const done = objectives.filter((o) => o.status === "done").length;
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select size="sm" value={status} onValueChange={setStatus} options={QUEST_STATUSES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))} ariaLabel="Quest status" className="w-36" />
          <Badge tone={priority >= 3 ? "ember" : priority === 2 ? "brass" : "neutral"}>{["Low", "Normal", "High", "Urgent"][priority]} priority</Badge>
        </div>
        {objectives.length > 0 && (
          <span className="text-sm text-muted tabular">
            {done}/{objectives.length} objectives
          </span>
        )}
      </div>
      {objectives.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {objectives.map((o) => (
            <li key={o.id}>
              <button onClick={() => cycle(o)} className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left hover:bg-surface-2" title="Click to cycle open → done → failed">
                {o.status === "done" ? <Check className="size-4 text-accent" /> : o.status === "failed" ? <X className="size-4 text-ember" /> : <CircleDashed className="size-4 text-faint" />}
                <span className={cn("text-base", o.status !== "open" && "text-muted line-through decoration-faint")}>{o.text}</span>
                {o.hidden && (
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-faint">
                    <EyeOff className="size-3" /> hidden
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {giver && (
          <div className="flex gap-2">
            <dt className="text-faint">Quest giver</dt>
            <dd>
              <Link href={`/w/${w.worldId}/e/${giver.id}`} className="hover:text-accent">
                {giver.name}
              </Link>
            </dd>
          </div>
        )}
        {thread && (
          <div className="flex gap-2">
            <dt className="text-faint">World thread</dt>
            <dd>
              <Link href={`/w/${w.worldId}/e/${thread.id}`} className="hover:text-accent">
                {thread.name}
              </Link>
            </dd>
          </div>
        )}
        {rewards && (
          <div className="flex gap-2 sm:col-span-2">
            <dt className="text-faint">Rewards</dt>
            <dd>{rewards}</dd>
          </div>
        )}
        {consequences && (
          <div className="flex gap-2 sm:col-span-2">
            <dt className="text-faint">Consequences</dt>
            <dd>{consequences}</dd>
          </div>
        )}
        {playerKnowledge && (
          <div className="flex gap-2 sm:col-span-2">
            <dt className="text-faint">Players know</dt>
            <dd>{playerKnowledge}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export function ThreadPanel({ threadId, thread, stages }: { threadId: string; thread: WorldThread; stages: { id: string; title: string; description: string; reachedAt: number | null; position: number }[] }) {
  const w = useWorld();
  const router = useRouter();
  const [progress, setProgress] = React.useState(thread.progress);
  React.useEffect(() => setProgress(thread.progress), [thread.progress]);
  const save = async (change: Parameters<typeof moveThreadAction>[2]) => {
    const res = await moveThreadAction(w.worldId, threadId, change);
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  };
  const now = w.activeCampaign?.currentAt ?? w.worldNow;
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          size="sm"
          value={thread.status}
          onValueChange={(s) => save({ status: s as WorldThread["status"] })}
          options={["dormant", "active", "escalating", "paused", "resolved", "failed"].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))}
          ariaLabel="Thread status"
          className="w-36"
        />
        <div className="flex items-center gap-4 text-sm text-muted">
          <span>Urgency {thread.urgency}/5</span>
          <span>Momentum {thread.momentum}%/week</span>
        </div>
      </div>
      <ThreadLine className="mt-4" progress={progress} status={thread.status} stages={stages.length} stageIndex={thread.stageIndex} />
      <div className="mt-3 flex items-center gap-3">
        <Slider value={[progress]} min={0} max={100} step={1} onValueChange={([v]) => setProgress(v ?? 0)} onValueCommit={([v]) => save({ progress: v })} aria-label="Progress" />
        <span className="w-12 text-right text-sm font-medium tabular">{progress}%</span>
      </div>
      {stages.length > 0 && (
        <ol className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(stages.length, 4)}, minmax(0, 1fr))` }}>
          {stages.map((s, i) => (
            <li key={s.id} className={cn("rounded-md border px-2.5 py-2 text-sm", i === thread.stageIndex ? "border-accent bg-accent-soft" : i < thread.stageIndex ? "border-line bg-surface-2" : "border-dashed border-line")}>
              <p className="text-2xs text-faint tabular">Stage {i + 1}</p>
              <p className="font-medium leading-snug">{s.title}</p>
              {s.reachedAt !== null && <p className="mt-0.5 text-2xs text-brass">{formatDate(w.calendar, s.reachedAt)}</p>}
            </li>
          ))}
        </ol>
      )}
      <dl className="mt-4 grid gap-y-1.5 text-sm">
        {thread.nextMilestone && (
          <div className="flex gap-2">
            <dt className="w-32 shrink-0 text-faint">Next milestone</dt>
            <dd>
              {thread.nextMilestone}
              {thread.nextMilestoneAt !== null && <span className="text-brass"> · {thread.nextMilestoneAt > now ? `in ${describeDuration(w.calendar, thread.nextMilestoneAt - now)}` : "due now"}</span>}
            </dd>
          </div>
        )}
        {thread.goals && (
          <div className="flex gap-2">
            <dt className="w-32 shrink-0 text-faint">Goals</dt>
            <dd>{thread.goals}</dd>
          </div>
        )}
        {thread.possibleOutcomes && (
          <div className="flex gap-2">
            <dt className="w-32 shrink-0 text-faint">Possible outcomes</dt>
            <dd className="whitespace-pre-line">{thread.possibleOutcomes}</dd>
          </div>
        )}
        {thread.triggers && (
          <div className="flex gap-2">
            <dt className="w-32 shrink-0 text-faint">Triggers</dt>
            <dd className="whitespace-pre-line">{thread.triggers}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export function CluesPanel({ mysteryId, questId, clues, question, truth, knowers }: { mysteryId?: string; questId?: string; clues: Clue[]; question?: string; truth?: string; knowers: { clueId: string; id: string; name: string }[] }) {
  const w = useWorld();
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const real = clues.filter((c) => !c.isRedHerring);
  const found = real.filter((c) => c.discovered).length;
  const toggle = async (c: Clue) => {
    const res = await setClueDiscoveredAction(w.worldId, c.id, !c.discovered);
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  };
  const remove = async (c: Clue) => {
    const res = await deleteClueAction(w.worldId, c.id);
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  };
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      {question && (
        <div className="mb-3">
          <p className="text-xs text-faint">The question</p>
          <p className="font-serif text-xl font-semibold">{question}</p>
        </div>
      )}
      {truth && (
        <div className="dm-block mb-4 text-base">
          <p>{truth}</p>
        </div>
      )}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h3 className="font-semibold">Clues</h3>
          {real.length > 0 && (
            <>
              <Meter value={found} max={real.length} className="max-w-40" label="Clues found" />
              <span className="text-sm text-muted tabular">
                {found} of {real.length} found
              </span>
            </>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <Plus /> Add clue
        </Button>
      </div>
      {clues.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-3 py-3 text-sm text-faint">No clues yet. Add the breadcrumbs that lead to the truth, and a red herring or two.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {clues.map((c) => (
            <li key={c.id} className="group flex items-start gap-3 rounded-md px-1.5 py-1.5 hover:bg-surface-2">
              <Checkbox checked={c.discovered} onCheckedChange={() => toggle(c)} className="mt-0.5" aria-label={c.discovered ? "Mark undiscovered" : "Mark discovered"} />
              <div className="min-w-0 flex-1">
                <p className={cn("text-base", c.discovered && "text-muted")}>{c.description}</p>
                <p className="mt-0.5 flex flex-wrap gap-2 text-xs text-faint">
                  {c.isRedHerring && <Badge tone="ember">red herring</Badge>}
                  {c.discovered && <span className="text-accent">found{c.discoveredAt !== null ? ` ${formatDate(w.calendar, c.discoveredAt)}` : ""}</span>}
                  {c.sourceText && <span>source: {c.sourceText}</span>}
                  {knowers.filter((k) => k.clueId === c.id).length > 0 && <span>known to {knowers.filter((k) => k.clueId === c.id).map((k) => k.name).join(", ")}</span>}
                </p>
              </div>
              <button onClick={() => remove(c)} className="rounded p-1 text-faint opacity-0 hover:bg-ember-soft hover:text-ember group-hover:opacity-100 focus:opacity-100" aria-label="Delete clue">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <AddClueDialog open={adding} onOpenChange={setAdding} mysteryId={mysteryId} questId={questId} onDone={() => router.refresh()} />
    </section>
  );
}

function AddClueDialog({ open, onOpenChange, mysteryId, questId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; mysteryId?: string; questId?: string; onDone: () => void }) {
  const w = useWorld();
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState<EntityOption | null>(null);
  const [source, setSource] = React.useState<EntityOption | null>(null);
  const [herring, setHerring] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setDescription("");
      setLocation(null);
      setSource(null);
      setHerring(false);
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a clue" size="md">
        <div className="flex flex-col gap-4">
          <Field label="The clue" htmlFor="clue-desc">
            <Textarea id="clue-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Where it's found">
              <EntityPicker value={location} onChange={setLocation} placeholder="Optional" />
            </Field>
            <Field label="Who has it">
              <EntityPicker value={source} onChange={setSource} placeholder="Optional" />
            </Field>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
            <span className="text-sm">This is a red herring</span>
            <Switch checked={herring} onCheckedChange={setHerring} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            onClick={async () => {
              if (!description.trim()) return toast.error("Describe the clue.");
              setPending(true);
              const res = await createClueAction(w.worldId, w.activeCampaign?.id ?? null, {
                mysteryId: mysteryId ?? null,
                questId: questId ?? null,
                description,
                locationId: location?.id ?? null,
                sourceEntityId: source?.id ?? null,
                sourceText: source?.name ?? "",
                isRedHerring: herring,
              });
              setPending(false);
              if (!res.ok) return toast.error(res.error);
              onOpenChange(false);
              onDone();
            }}
          >
            Add clue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RumourPanel({ claim, truth, accuracy, distortion, origin }: { claim: string; truth: string; accuracy: number; distortion: string; origin: { id: string; name: string } | null }) {
  const w = useWorld();
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <p className="font-serif text-xl italic leading-snug">“{claim}”</p>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-sm text-faint">Accuracy</span>
        <Meter value={accuracy} tone={accuracy > 66 ? "accent" : accuracy > 33 ? "brass" : "ember"} className="max-w-48" label="Accuracy" />
        <span className="text-sm tabular">{accuracy}%</span>
      </div>
      {truth && (
        <div className="dm-block mt-3 text-base">
          <p>{truth}</p>
        </div>
      )}
      {distortion && <p className="mt-2 text-sm text-muted">Distortion: {distortion}</p>}
      {origin && (
        <p className="mt-2 text-sm text-muted">
          Started from{" "}
          <Link href={`/w/${w.worldId}/e/${origin.id}`} className="text-accent hover:underline">
            {origin.name}
          </Link>
        </p>
      )}
    </section>
  );
}

export function EventPanel({ startAt, endAt, precision, kind, origin }: { startAt: number; endAt: number | null; precision: "year" | "month" | "day" | "minute"; kind: string; origin: string }) {
  const w = useWorld();
  const now = w.activeCampaign?.currentAt ?? w.worldNow;
  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3">
      <div>
        <p className="text-xs text-faint">When</p>
        <p className="font-serif text-lg font-semibold text-brass">
          {formatDate(w.calendar, startAt, { precision })}
          {endAt !== null && ` – ${formatDate(w.calendar, endAt, { precision })}`}
        </p>
        <p className="text-xs text-muted">{startAt > now ? `in ${describeDuration(w.calendar, startAt - now)}` : `${describeDuration(w.calendar, now - startAt)} ago`}</p>
      </div>
      <div>
        <p className="text-xs text-faint">Kind</p>
        <p className="capitalize">{kind} event</p>
      </div>
      {origin !== "manual" && (
        <div>
          <p className="text-xs text-faint">Origin</p>
          <p>{origin === "advance" ? "Advance World" : origin === "session" ? "Session notes" : "AI proposal"}</p>
        </div>
      )}
    </section>
  );
}

