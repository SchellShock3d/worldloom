"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GitBranch, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Segmented, Slider } from "@/components/ui/primitives";
import { EntityPicker, type EntityOption } from "@/components/entity/entity-picker";
import { WorldDateInput } from "@/components/common/world-date-input";
import { Markdown } from "@/components/common/markdown";
import { useWorld } from "@/components/shell/world-context";
import { createConsequenceAction, deleteConsequenceAction, updateConsequenceAction } from "@/server/actions/play";
import { consequencesAction } from "@/server/actions/ai";
import { describeDuration, formatDate } from "@/lib/calendar";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  kind: "consequence" | "promise" | "reaction";
  title: string;
  description: string;
  cause: string;
  status: "pending" | "foreshadowed" | "triggered" | "resolved" | "discarded";
  severity: number;
  dueAt: number | null;
  actorId: string | null;
  actorName: string | null;
  actorType: string | null;
}

const KIND_LABEL = { consequence: "Consequence", promise: "Promise", reaction: "Owed reaction" };

export function ConsequencesView({ campaignId, rows, now }: { campaignId: string; rows: Row[]; now: number }) {
  const w = useWorld();
  const router = useRouter();
  const [filter, setFilter] = React.useState<"open" | "all">("open");
  const [adding, setAdding] = React.useState(false);
  const [suggest, setSuggest] = React.useState(false);
  const [action, setAction] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const list = rows.filter((r) => filter === "all" || ["pending", "foreshadowed", "triggered"].includes(r.status));
  const setStatus = async (r: Row, status: Row["status"]) => {
    const res = await updateConsequenceAction(w.worldId, r.id, { status });
    if (!res.ok) toast.error(res.error);
    router.refresh();
  };
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<GitBranch />}
        title="Consequences & promises"
        description="Cause and effect: what the party set in motion, what NPCs promised, and reactions the world owes. Advance World triggers them when they come due."
        actions={
          <>
            <Button variant="arcane" onClick={() => setSuggest(true)}>
              <Sparkles /> Suggest consequences
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus /> Add
            </Button>
          </>
        }
      />
      <Segmented
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "open", label: "Open" },
          { value: "all", label: "All" },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState icon={<GitBranch />} title="Nothing pending">
          When the party does something with consequences, add it here, or ask the AI what should follow from it.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((r) => {
            const overdue = r.dueAt !== null && r.dueAt < now && ["pending", "foreshadowed"].includes(r.status);
            return (
              <li key={r.id} className={cn("group rounded-lg border bg-surface px-4 py-3", overdue ? "border-ember/50" : "border-line")}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.kind === "promise" ? "brass" : r.kind === "reaction" ? "arcane" : "ember"}>{KIND_LABEL[r.kind]}</Badge>
                      <span className="font-medium">{r.title}</span>
                      <span className="text-xs text-faint" title="Severity">
                        {"▮".repeat(r.severity)}
                        <span className="opacity-30">{"▮".repeat(5 - r.severity)}</span>
                      </span>
                    </div>
                    {r.description && (
                      <div className="mt-1">
                        <Markdown variant="sans" className="text-sm text-muted">
                          {r.description}
                        </Markdown>
                      </div>
                    )}
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-faint">
                      {r.actorId && (
                        <Link href={`/w/${w.worldId}/e/${r.actorId}`} className="hover:text-fg">
                          {r.actorName}
                        </Link>
                      )}
                      {r.cause && <span>because: {r.cause}</span>}
                      {r.dueAt !== null && (
                        <span className={overdue ? "font-medium text-ember" : ""}>
                          {overdue ? `overdue by ${describeDuration(w.calendar, now - r.dueAt)}` : `due ${formatDate(w.calendar, r.dueAt)}`}
                        </span>
                      )}
                    </p>
                  </div>
                  <NativeSelect value={r.status} onChange={(e) => setStatus(r, e.target.value as Row["status"])} className="h-7 w-36 text-sm" aria-label="Status">
                    <option value="pending">Pending</option>
                    <option value="foreshadowed">Foreshadowed</option>
                    <option value="triggered">Triggered</option>
                    <option value="resolved">Resolved</option>
                    <option value="discarded">Discarded</option>
                  </NativeSelect>
                  <ConfirmDialog
                    trigger={
                      <button className="rounded p-1 text-faint hover-reveal hover:text-ember" aria-label={`Delete ${r.title}`}>
                        <Trash2 className="size-4" />
                      </button>
                    }
                    title="Delete this consequence?"
                    description={r.title}
                    onConfirm={async () => {
                      const res = await deleteConsequenceAction(w.worldId, r.id);
                      if (!res.ok) return void toast.error(res.error);
                      router.refresh();
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AddConsequenceDialog open={adding} onOpenChange={setAdding} campaignId={campaignId} now={now} onDone={() => router.refresh()} />
      <Dialog open={suggest} onOpenChange={setSuggest}>
        <DialogContent title="What did the party do?" description="Name the people, places and factions involved. Worldloom proposes logical consequences from the current world state.">
          <Textarea value={action} onChange={(e) => setAction(e.target.value)} className="min-h-24" placeholder="The party killed the bandit captain Grell and scattered his gang" aria-label="What the party did" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuggest(false)}>
              Cancel
            </Button>
            <Button
              variant="arcane"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const res = await consequencesAction(w.worldId, { action, campaignId });
                setBusy(false);
                if (!res.ok) return toast.error(res.error);
                router.push(`/w/${w.worldId}/proposals/${res.data.batchId}`);
              }}
            >
              <Sparkles /> Suggest
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddConsequenceDialog({ open, onOpenChange, campaignId, now, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; campaignId: string; now: number; onDone: () => void }) {
  const w = useWorld();
  const [kind, setKind] = React.useState<Row["kind"]>("consequence");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [cause, setCause] = React.useState("");
  const [actor, setActor] = React.useState<EntityOption | null>(null);
  const [severity, setSeverity] = React.useState(2);
  const [dueAt, setDueAt] = React.useState<number | null>(null);
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setCause("");
      setActor(null);
      setDueAt(null);
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a consequence or promise" size="md">
        <div className="flex flex-col gap-4">
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: "consequence", label: "Consequence" },
              { value: "promise", label: "Promise" },
              { value: "reaction", label: "Owed reaction" },
            ]}
          />
          <Field label="What" htmlFor="cq-title">
            <Input id="cq-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "promise" ? "Lady Marr will send word about the prince" : "The bandits want revenge"} autoFocus />
          </Field>
          <Field label="Details" htmlFor="cq-desc">
            <Textarea id="cq-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={kind === "promise" ? "Who promised" : "Who acts"}>
              <EntityPicker value={actor} onChange={setActor} types={["npc", "faction", "organization", "religion", "nation", "settlement"]} placeholder="Optional" />
            </Field>
            <Field label="Because" htmlFor="cq-cause">
              <Input id="cq-cause" value={cause} onChange={(e) => setCause(e.target.value)} placeholder="Session 2" />
            </Field>
          </div>
          <Field label={`Severity: ${severity}/5`}>
            <Slider value={[severity]} min={1} max={5} step={1} onValueChange={([v]) => setSeverity(v ?? 2)} />
          </Field>
          <Field label="Due" hint="Advance World triggers it when the date passes.">
            {dueAt !== null ? (
              <WorldDateInput calendar={w.calendar} value={dueAt} onChange={setDueAt} />
            ) : (
              <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setDueAt(now + w.calendar.hoursPerDay * w.calendar.minutesPerHour * 7)}>
                Set a due date
              </Button>
            )}
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            onClick={async () => {
              if (!title.trim()) return toast.error("Describe it in a few words.");
              setPending(true);
              const res = await createConsequenceAction(w.worldId, campaignId, { kind, title, description, cause, actorId: actor?.id ?? null, severity, dueAt });
              setPending(false);
              if (!res.ok) return toast.error(res.error);
              onOpenChange(false);
              onDone();
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


