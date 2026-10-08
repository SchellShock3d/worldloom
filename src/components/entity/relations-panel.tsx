"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight, Plus, Trash2, Brain, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { Dialog, DialogContent, DialogFooter, ConfirmDialog } from "@/components/ui/overlays";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Segmented, Slider, Switch } from "@/components/ui/primitives";
import { RELATIONSHIP_TYPES, normalizeRelationshipType } from "@/lib/relationship-types";
import { createRelationshipAction, deleteRelationshipAction } from "@/server/actions/entities";
import { createFactAction, deleteFactAction } from "@/server/actions/play";
import { useWorld } from "@/components/shell/world-context";
import { EntityPicker, type EntityOption } from "./entity-picker";
import { TypeIcon } from "./type-icon";
import type { RelationshipView } from "@/server/services/relationships";
import { cn } from "@/lib/utils";

export function RelationshipsPanel({ entity, relationships, derived }: { entity: { id: string; name: string; type: string }; relationships: RelationshipView[]; derived: { label: string; other: { id: string; name: string; type: string } }[] }) {
  const w = useWorld();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<RelationshipView | null>(null);
  const grouped = React.useMemo(() => {
    const m = new Map<string, RelationshipView[]>();
    for (const r of relationships) m.set(r.label, [...(m.get(r.label) ?? []), r]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [relationships]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {relationships.length} relationship{relationships.length === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/w/${w.worldId}/graph?focus=${entity.id}`}>Open in graph</Link>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <Plus /> Add relationship
          </Button>
        </div>
      </div>
      {derived.length > 0 && (
        <ul className="mb-4 flex flex-col gap-1">
          {derived.map((d, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 text-faint">{d.label}</span>
              <Link href={`/w/${w.worldId}/e/${d.other.id}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                <TypeIcon type={d.other.type} /> {d.other.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {grouped.length === 0 ? (
        <EmptyState compact icon={<ArrowLeftRight />} title="No relationships yet" action={<Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus /> Add one</Button>}>
          Connect {entity.name} to people, places and factions. Relationships power the graph, the AI's context, and NPC knowledge.
        </EmptyState>
      ) : (
        <dl className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {grouped.map(([label, rels]) => (
            <div key={label} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[9rem_1fr]">
              <dt className="pt-0.5 text-sm capitalize text-faint">{label}</dt>
              <dd className="flex flex-col gap-1.5">
                {rels.map((r) => (
                  <div key={r.id} className="group flex items-start gap-2">
                    <Link href={`/w/${w.worldId}/e/${r.other.id}`} className="inline-flex shrink-0 items-center gap-1.5 font-medium hover:text-accent">
                      <TypeIcon type={r.other.type} /> {r.other.name}
                    </Link>
                    {r.other.status === "dead" && <Badge tone="ember">dead</Badge>}
                    {r.campaignId && <Badge tone="brass">this campaign</Badge>}
                    {r.strength && <span className="text-xs text-faint" title="Strength">{"●".repeat(r.strength)}</span>}
                    {r.description && <span className="min-w-0 text-sm text-muted">— {r.description}</span>}
                    <button onClick={() => setRemoving(r)} className="ml-auto shrink-0 rounded p-1 text-faint opacity-0 hover:bg-ember-soft hover:text-ember group-hover:opacity-100 focus:opacity-100" aria-label={`Remove relationship with ${r.other.name}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <AddRelationshipDialog open={open} onOpenChange={setOpen} entity={entity} onDone={() => router.refresh()} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this relationship?"
        description={removing ? `${entity.name} ${removing.label} ${removing.other.name}` : undefined}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removing) return;
          const res = await deleteRelationshipAction(w.worldId, removing.id);
          if (!res.ok) toast.error(res.error);
          else router.refresh();
        }}
      />
    </div>
  );
}

export function AddRelationshipDialog({ open, onOpenChange, entity, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; entity: { id: string; name: string; type: string }; onDone: () => void }) {
  const w = useWorld();
  const [direction, setDirection] = React.useState<"out" | "in">("out");
  const [type, setType] = React.useState("member_of");
  const [custom, setCustom] = React.useState("");
  const [other, setOther] = React.useState<EntityOption | null>(null);
  const [description, setDescription] = React.useState("");
  const [strength, setStrength] = React.useState(3);
  const [campaignOnly, setCampaignOnly] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const def = RELATIONSHIP_TYPES.find((t) => t.key === type);
  const label = type === "__custom" ? custom || "…" : direction === "out" ? def?.label : def?.inverse;

  React.useEffect(() => {
    if (open) {
      setOther(null);
      setDescription("");
    }
  }, [open]);

  async function submit() {
    if (!other) return toast.error("Choose who or what it connects to.");
    const t = type === "__custom" ? normalizeRelationshipType(custom) : type;
    if (!t) return toast.error("Name the relationship.");
    setPending(true);
    const res = await createRelationshipAction(w.worldId, {
      sourceId: direction === "out" ? entity.id : other.id,
      targetId: direction === "out" ? other.id : entity.id,
      type: t,
      description,
      strength,
      campaignId: campaignOnly ? (w.activeCampaign?.id ?? null) : null,
    });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Relationship added");
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add relationship" description="Relationships are directional; symmetric ones (allies, enemies, siblings) read the same both ways." size="md">
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-md">
            <span className="font-medium">{direction === "out" ? entity.name : other?.name ?? "…"}</span> <span className="text-accent">{label}</span>{" "}
            <span className="font-medium">{direction === "out" ? other?.name ?? "…" : entity.name}</span>
          </div>
          <Field label="Relationship">
            <div className="flex gap-2">
              <NativeSelect value={type} onChange={(e) => setType(e.target.value)} className="flex-1" aria-label="Relationship type">
                {RELATIONSHIP_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                    {t.hint ? ` (${t.hint})` : ""}
                  </option>
                ))}
                <option value="__custom">Custom…</option>
              </NativeSelect>
              {!def?.symmetric && (
                <Button type="button" variant="secondary" size="icon" onClick={() => setDirection((d) => (d === "out" ? "in" : "out"))} aria-label="Swap direction" title="Swap direction">
                  <ArrowLeftRight />
                </Button>
              )}
            </div>
          </Field>
          {type === "__custom" && (
            <Field label="Custom relationship" htmlFor="rel-custom" hint="e.g. “sworn to”, “in debt to”">
              <Input id="rel-custom" value={custom} onChange={(e) => setCustom(e.target.value)} />
            </Field>
          )}
          <Field label="Connects to">
            <EntityPicker value={other} onChange={setOther} excludeIds={[entity.id]} placeholder="Search your world…" />
          </Field>
          <Field label="Description" htmlFor="rel-desc">
            <Textarea id="rel-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-14" placeholder="Why, how, since when…" />
          </Field>
          <Field label={`Strength: ${strength}/5`}>
            <Slider value={[strength]} min={1} max={5} step={1} onValueChange={([v]) => setStrength(v ?? 3)} />
          </Field>
          {w.activeCampaign && (
            <label className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
              <span className="text-sm">Only in {w.activeCampaign.name}</span>
              <Switch checked={campaignOnly} onCheckedChange={setCampaignOnly} />
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={pending}>
            Add relationship
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

interface FactRow {
  id: string;
  statement: string;
  truthStatus: string;
  confidence: number;
  source: string;
  holderId: string | null;
  subjectId: string | null;
  campaignId: string | null;
  otherName?: string | null;
  otherType?: string | null;
}

const TRUTH: Record<string, { label: string; tone: "accent" | "ember" | "brass" | "neutral" }> = {
  true: { label: "true", tone: "accent" },
  false: { label: "false belief", tone: "ember" },
  partial: { label: "partial", tone: "brass" },
  unknown: { label: "unverified", tone: "neutral" },
};

export function KnowledgePanel({ entity, held, about, canHold }: { entity: { id: string; name: string; type: string }; held: FactRow[]; about: FactRow[]; canHold: boolean }) {
  const w = useWorld();
  const router = useRouter();
  const [open, setOpen] = React.useState<"held" | "about" | null>(null);
  const remove = async (id: string) => {
    const res = await deleteFactAction(w.worldId, id);
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  };
  return (
    <div className="flex flex-col gap-6">
      {canHold && (
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 font-semibold">
                <Brain className="size-4 text-arcane" /> What {entity.name} knows
              </h3>
              <p className="text-xs text-faint">When the AI roleplays {entity.name}, it only receives this, plus common knowledge.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setOpen("held")}>
              <Plus /> Add
            </Button>
          </div>
          <FactList facts={held} onRemove={remove} showOther="subject" />
        </section>
      )}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Eye className="size-4 text-brass" /> What's known about {entity.name}
            </h3>
            <p className="text-xs text-faint">World truths (the DM's ledger) and who believes what.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setOpen("about")}>
            <Plus /> Add
          </Button>
        </div>
        <FactList facts={about} onRemove={remove} showOther="holder" />
      </section>
      <AddFactDialog mode={open} entity={entity} onClose={() => setOpen(null)} onDone={() => router.refresh()} />
    </div>
  );
}

function FactList({ facts, onRemove, showOther }: { facts: FactRow[]; onRemove: (id: string) => void; showOther: "holder" | "subject" }) {
  const w = useWorld();
  if (!facts.length) return <p className="rounded-md border border-dashed border-line px-3 py-3 text-sm text-faint">Nothing recorded.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
      {facts.map((f) => (
        <li key={f.id} className="group flex items-start gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-base">{f.statement}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
              <Badge tone={TRUTH[f.truthStatus]?.tone ?? "neutral"}>{TRUTH[f.truthStatus]?.label ?? f.truthStatus}</Badge>
              {showOther === "holder" ? (
                f.holderId ? (
                  <Link href={`/w/${w.worldId}/e/${f.holderId}`} className="hover:text-fg">
                    held by {f.otherName}
                  </Link>
                ) : (
                  <span className="font-medium text-brass">world truth</span>
                )
              ) : f.subjectId && f.otherName ? (
                <Link href={`/w/${w.worldId}/e/${f.subjectId}`} className="hover:text-fg">
                  about {f.otherName}
                </Link>
              ) : null}
              <span>confidence {f.confidence}%</span>
              {f.source && <span>source: {f.source}</span>}
              {f.campaignId && <Badge tone="brass">this campaign</Badge>}
            </p>
          </div>
          <button onClick={() => onRemove(f.id)} className="shrink-0 rounded p-1 text-faint opacity-0 hover:bg-ember-soft hover:text-ember group-hover:opacity-100 focus:opacity-100" aria-label="Remove">
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function AddFactDialog({ mode, entity, onClose, onDone }: { mode: "held" | "about" | null; entity: { id: string; name: string; type: string }; onClose: () => void; onDone: () => void }) {
  const w = useWorld();
  const [statement, setStatement] = React.useState("");
  const [truth, setTruth] = React.useState<"true" | "false" | "partial" | "unknown">("true");
  const [confidence, setConfidence] = React.useState(80);
  const [other, setOther] = React.useState<EntityOption | null>(null);
  const [isTruth, setIsTruth] = React.useState(true);
  const [source, setSource] = React.useState("");
  const [campaignOnly, setCampaignOnly] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => {
    if (mode) {
      setStatement("");
      setOther(null);
      setTruth("true");
      setIsTruth(mode === "about");
      setSource("");
    }
  }, [mode]);
  if (!mode) return null;
  const submit = async () => {
    if (!statement.trim()) return toast.error("Write the statement.");
    setPending(true);
    const res = await createFactAction(w.worldId, {
      holderId: mode === "held" ? entity.id : isTruth ? null : (other?.id ?? null),
      subjectId: mode === "about" ? entity.id : (other?.id ?? null),
      statement,
      truthStatus: truth,
      confidence,
      source,
      campaignId: campaignOnly ? (w.activeCampaign?.id ?? null) : null,
      learnedAt: mode === "held" ? (w.activeCampaign?.currentAt ?? w.worldNow) : null,
    });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    onClose();
    onDone();
  };
  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={mode === "held" ? `Something ${entity.name} knows` : `Something known about ${entity.name}`} size="md">
        <div className="flex flex-col gap-4">
          {mode === "about" && (
            <Segmented
              value={isTruth ? "truth" : "belief"}
              onChange={(v) => setIsTruth(v === "truth")}
              options={[
                { value: "truth", label: "World truth" },
                { value: "belief", label: "Someone's belief" },
              ]}
            />
          )}
          {mode === "about" && !isTruth && (
            <Field label="Who believes it?">
              <EntityPicker value={other} onChange={setOther} types={["npc", "pc", "faction", "organization", "religion"]} placeholder="Choose a character or group" />
            </Field>
          )}
          <Field label="Statement" htmlFor="fact-statement" hint={mode === "held" ? "Write it as they would know it: “The prince is dead.”" : undefined}>
            <Textarea id="fact-statement" value={statement} onChange={(e) => setStatement(e.target.value)} className="min-h-16" autoFocus />
          </Field>
          {mode === "held" && (
            <Field label="About (optional)">
              <EntityPicker value={other} onChange={setOther} excludeIds={[entity.id]} placeholder="Who or what it's about" />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Is it true?" htmlFor="fact-truth">
              <NativeSelect id="fact-truth" value={truth} onChange={(e) => setTruth(e.target.value as typeof truth)}>
                <option value="true">True</option>
                <option value="partial">Partly true</option>
                <option value="false">False (a mistaken belief)</option>
                <option value="unknown">Unverified</option>
              </NativeSelect>
            </Field>
            <Field label={`Confidence: ${confidence}%`}>
              <Slider value={[confidence]} min={0} max={100} step={5} onValueChange={([v]) => setConfidence(v ?? 80)} className="mt-2" />
            </Field>
          </div>
          <Field label="Source (optional)" htmlFor="fact-source">
            <Input id="fact-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Overheard at the docks" />
          </Field>
          {w.activeCampaign && (
            <label className={cn("flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2")}>
              <span className="text-sm">Only in {w.activeCampaign.name}</span>
              <Switch checked={campaignOnly} onCheckedChange={setCampaignOnly} />
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={pending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
