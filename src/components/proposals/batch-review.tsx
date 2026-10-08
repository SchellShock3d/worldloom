"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, CircleAlert, History, Pencil, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Checkbox } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/primitives";
import { WorldDateInput } from "@/components/common/world-date-input";
import { useWorld } from "@/components/shell/world-context";
import { describeProposal, editFieldsFor, getPath, setPath, type EditField } from "@/lib/proposal-describe";
import { PROPOSAL_LABELS, proposalGroup, type ProposalKind } from "@/lib/proposals";
import { applyProposalsAction, editProposalAction, rejectProposalsAction } from "@/server/actions/ai";
import { formatDate, describeDuration } from "@/lib/calendar";
import { cn, timeAgo } from "@/lib/utils";

export interface BatchView {
  id: string;
  title: string;
  summary: string;
  status: string;
  source: string;
  provider: string;
  fromAt: number | null;
  toAt: number | null;
  createdAt: string | Date;
  campaignId: string | null;
}

export interface ProposalView {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  originalPayload: Record<string, unknown> | null;
  rationale: string;
  status: string;
  error: string | null;
  resultRefs: { kind: string; id: string; label?: string }[];
}

const GROUP_LABELS: Record<string, string> = {
  time: "Time",
  world: "World developments",
  people: "People, places & relationships",
  story: "Story & quests",
  knowledge: "Knowledge",
  party: "Party",
};

const TONE_BORDER: Record<string, string> = {
  accent: "before:bg-accent",
  brass: "before:bg-brass",
  arcane: "before:bg-arcane",
  ember: "before:bg-ember",
  neutral: "before:bg-line-strong",
};

export function BatchReview({ batch, items, compact = false }: { batch: BatchView; items: ProposalView[]; compact?: boolean }) {
  const w = useWorld();
  const router = useRouter();
  const pending = items.filter((i) => i.status === "pending");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(pending.map((p) => p.id)));
  const [busy, setBusy] = React.useState<null | "apply" | "reject">(null);
  const [editing, setEditing] = React.useState<ProposalView | null>(null);

  React.useEffect(() => {
    setSelected((s) => new Set([...s].filter((id) => pending.some((p) => p.id === id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const groups = React.useMemo(() => {
    const m = new Map<string, ProposalView[]>();
    for (const it of items) {
      const g = proposalGroup(it.kind as ProposalKind);
      m.set(g, [...(m.get(g) ?? []), it]);
    }
    return ["time", "world", "people", "story", "knowledge", "party"].filter((g) => m.has(g)).map((g) => [g, m.get(g)!] as const);
  }, [items]);

  async function apply(ids: string[]) {
    if (!ids.length) return;
    setBusy("apply");
    const res = await applyProposalsAction(w.worldId, batch.id, ids);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    if (res.data.failed.length) toast.error(`${res.data.applied} applied, ${res.data.failed.length} couldn't be applied`, { description: res.data.failed[0]?.error });
    else toast.success(`${res.data.applied} change${res.data.applied === 1 ? "" : "s"} applied to your world`);
    router.refresh();
  }
  async function reject(ids: string[]) {
    if (!ids.length) return;
    setBusy("reject");
    const res = await rejectProposalsAction(w.worldId, batch.id, ids);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast(`${ids.length} proposal${ids.length === 1 ? "" : "s"} rejected`);
    router.refresh();
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const allSelected = pending.length > 0 && pending.every((p) => selected.has(p.id));
  const advance = batch.source === "advance" && batch.fromAt !== null && batch.toAt !== null;

  return (
    <div className="flex flex-col gap-4">
      {!compact && (
        <div className="rounded-lg border border-arcane/25 bg-arcane-soft/50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Sparkles className="size-3.5 text-arcane" />
            <span>{batch.provider === "offline" ? "Offline engine" : "AI proposal"}</span>
            <span aria-hidden>·</span>
            <span>{timeAgo(batch.createdAt)}</span>
            {advance && (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-brass">
                  {formatDate(w.calendar, batch.fromAt!)} → {formatDate(w.calendar, batch.toAt!)} ({describeDuration(w.calendar, batch.toAt! - batch.fromAt!)})
                </span>
              </>
            )}
          </div>
          {batch.summary && <p className="mt-1.5 text-md text-fg">{batch.summary}</p>}
          <p className="mt-1.5 text-xs text-faint">Nothing here is canon until you approve it. Approved changes are recorded in history and can be traced back to this batch.</p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/95 px-3 py-2 backdrop-blur">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={allSelected} onCheckedChange={(v) => setSelected(v ? new Set(pending.map((p) => p.id)) : new Set())} aria-label="Select all pending" />
            {selected.size} of {pending.length} selected
          </label>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => reject([...selected])} loading={busy === "reject"} disabled={!selected.size || !!busy}>
            <X /> Reject selected
          </Button>
          <Button variant="primary" size="sm" onClick={() => apply([...selected])} loading={busy === "apply"} disabled={!selected.size || !!busy}>
            <Check /> Approve selected
          </Button>
        </div>
      )}

      {pending.length === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm">
          <Check className="size-4 text-accent" />
          <span className="flex-1">All proposals in this batch have been reviewed.</span>
          {advance && (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/w/${w.worldId}/proposals/${batch.id}/changes`}>
                <History /> What changed
              </Link>
            </Button>
          )}
        </div>
      )}

      {groups.map(([g, list]) => (
        <section key={g} aria-label={GROUP_LABELS[g]}>
          <h3 className="mb-2 text-sm font-semibold text-muted">{GROUP_LABELS[g]}</h3>
          <ul className="flex flex-col gap-2">
            {list.map((it) => (
              <ProposalCard
                key={it.id}
                item={it}
                selected={selected.has(it.id)}
                onToggle={() => toggle(it.id)}
                onApprove={() => apply([it.id])}
                onReject={() => reject([it.id])}
                onEdit={() => setEditing(it)}
                busy={!!busy}
              />
            ))}
          </ul>
        </section>
      ))}

      <EditProposalDialog item={editing} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />
    </div>
  );
}

function ProposalCard({
  item,
  selected,
  onToggle,
  onApprove,
  onReject,
  onEdit,
  busy,
}: {
  item: ProposalView;
  selected: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  busy: boolean;
}) {
  const w = useWorld();
  const kind = item.kind as ProposalKind;
  const d = describeProposal(kind, item.payload as Record<string, any>, w.calendar);
  const [open, setOpen] = React.useState(false);
  const pending = item.status === "pending";
  const created = item.resultRefs.find((r) => r.kind === "entity");
  return (
    <li
      className={cn(
        "relative overflow-hidden rounded-lg border border-line bg-surface pl-4 before:absolute before:inset-y-0 before:left-0 before:w-1",
        TONE_BORDER[d.tone],
        !pending && "opacity-80",
        item.status === "rejected" && "opacity-55",
      )}
    >
      <div className="flex items-start gap-3 py-3 pr-3">
        {pending ? <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-0.5" aria-label={`Select ${d.title}`} /> : <StatusIcon status={item.status} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="outline">{PROPOSAL_LABELS[kind]}</Badge>
            {item.originalPayload && <Badge tone="brass">Edited</Badge>}
            {item.status === "applied" && <Badge tone="accent">Applied</Badge>}
            {item.status === "rejected" && <Badge>Rejected</Badge>}
          </div>
          <p className="mt-1 font-medium text-fg">{d.title}</p>
          {d.detail && <p className={cn("mt-0.5 text-sm text-muted", !open && "line-clamp-2")}>{d.detail}</p>}
          {d.bullets && d.bullets.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-sm text-muted">
              {(open ? d.bullets : d.bullets.slice(0, 3)).map((b, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-faint">–</span>
                  <span className="min-w-0">{b}</span>
                </li>
              ))}
            </ul>
          )}
          {(item.rationale || (d.bullets?.length ?? 0) > 3 || (d.detail?.length ?? 0) > 140) && (
            <button onClick={() => setOpen((o) => !o)} className="mt-1 inline-flex items-center gap-1 text-xs text-faint hover:text-fg">
              {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              {open ? "Less" : "Why, and more detail"}
            </button>
          )}
          {open && item.rationale && <p className="mt-1 text-sm italic text-muted">{item.rationale}</p>}
          {item.error && (
            <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ember">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {item.error}
            </p>
          )}
          {created && item.status === "applied" && (
            <Link href={`/w/${w.worldId}/e/${created.id}`} className="mt-1 inline-block text-sm text-accent hover:underline">
              Open
            </Link>
          )}
        </div>
        {pending && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={onEdit} disabled={busy} aria-label="Edit proposal">
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onReject} disabled={busy} aria-label="Reject proposal">
              <X />
            </Button>
            <Button variant="secondary" size="sm" onClick={onApprove} disabled={busy}>
              <Check /> Approve
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "applied") return <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-label="Applied" />;
  if (status === "rejected") return <X className="mt-0.5 size-4 shrink-0 text-faint" aria-label="Rejected" />;
  return <CircleAlert className="mt-0.5 size-4 shrink-0 text-ember" aria-label="Failed" />;
}

function EditProposalDialog({ item, onClose, onSaved }: { item: ProposalView | null; onClose: () => void; onSaved: () => void }) {
  const w = useWorld();
  const [payload, setPayload] = React.useState<Record<string, unknown>>({});
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (item) {
      setPayload(item.payload);
      setError(null);
    }
  }, [item]);
  if (!item) return null;
  const fields = editFieldsFor(item.kind as ProposalKind);
  const set = (path: string, v: unknown) => setPayload((p) => setPath(p, path, v));
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Edit: ${PROPOSAL_LABELS[item.kind as ProposalKind]}`} description="Change the proposal before approving it. The original is kept for reference." size="lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const res = await editProposalAction(w.worldId, item.id, payload);
            setPending(false);
            if (!res.ok) return setError(res.error);
            toast.success("Proposal updated");
            onSaved();
            onClose();
          }}
        >
          {fields.map((f) => (
            <EditInput key={f.path} field={f} value={getPath(payload, f.path)} onChange={(v) => set(f.path, v)} />
          ))}
          {error && <p className="text-sm text-ember">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditInput({ field, value, onChange }: { field: EditField; value: unknown; onChange: (v: unknown) => void }) {
  const w = useWorld();
  const id = `pf-${field.path}`;
  switch (field.kind) {
    case "text":
      return (
        <Field label={field.label} htmlFor={id}>
          <Input id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "textarea":
      return (
        <Field label={field.label} htmlFor={id}>
          <Textarea id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className="min-h-28" />
        </Field>
      );
    case "number":
      return (
        <Field label={field.label} htmlFor={id}>
          <Input id={id} type="number" value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} className="w-40" />
        </Field>
      );
    case "select":
      return (
        <Field label={field.label} htmlFor={id}>
          <NativeSelect id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || undefined)} className="w-64">
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      );
    case "bool":
      return (
        <label className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
          <span className="text-sm">{field.label}</span>
          <Switch checked={!!value} onCheckedChange={onChange} />
        </label>
      );
    case "date":
      return (
        <Field label={field.label}>
          {typeof value === "number" ? (
            <WorldDateInput calendar={w.calendar} value={value} onChange={onChange} />
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={() => onChange(w.activeCampaign?.currentAt ?? w.worldNow)}>
              Set a date
            </Button>
          )}
        </Field>
      );
    case "lines":
      return <LinesInput id={id} label={field.label} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
  }
}

function LinesInput({ id, label, value, onChange }: { id: string; label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = React.useState(value.join("\n"));
  return (
    <Field label={label} htmlFor={id}>
      <Textarea
        id={id}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          );
        }}
      />
    </Field>
  );
}
