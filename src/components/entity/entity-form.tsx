"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Plus, Trash2, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Segmented, Slider, Switch } from "@/components/ui/primitives";
import { Panel, SectionTitle } from "@/components/ui/display";
import { MarkdownEditor } from "@/components/common/markdown-editor";
import { WorldDateInput } from "@/components/common/world-date-input";
import { OptionalWorldDate } from "@/components/common/visibility-select";
import { EntityPicker, type EntityOption } from "./entity-picker";
import { TypeGlyph } from "./type-icon";
import { useWorld } from "@/components/shell/world-context";
import { createEntityAction, updateEntityAction } from "@/server/actions/entities";
import { CUSTOM_FIELDS_KEY, getEntityType, PLACE_TYPES, type CustomField, type FieldDef } from "@/lib/entity-types";
import type { EntityInput } from "@/lib/validation";
import type { RefMap } from "@/components/common/markdown";
import { cn, lowerLabel } from "@/lib/utils";

export interface EntityFormValue {
  id?: string;
  type: string;
  name: string;
  aliases: string[];
  summary: string;
  body: string;
  dmNotes: string;
  fields: Record<string, unknown>;
  status: string | null;
  location: EntityOption | null;
  parent: EntityOption | null;
  visibility: "dm_only" | "secret" | "partially_known" | "discovered" | "public";
  canonStatus: "draft" | "proposed" | "canon" | "archived";
  importance: number;
  tags: string[];
  imageFileId: string | null;
  campaignId: string | null;
  quest?: {
    status: string;
    priority: number;
    giver: EntityOption | null;
    thread: EntityOption | null;
    rewards: string;
    prerequisites: string;
    consequences: string;
    playerKnowledge: string;
    objectives: { text: string; status: "open" | "done" | "failed"; hidden: boolean }[];
  };
  thread?: {
    status: string;
    progress: number;
    urgency: number;
    momentum: number;
    goals: string;
    nextMilestone: string;
    nextMilestoneAt: number | null;
    possibleOutcomes: string;
    triggers: string;
    startAt: number | null;
    stages: { title: string; description: string }[];
  };
  mystery?: { question: string; truth: string; status: string };
  rumour?: { claim: string; truth: string; accuracy: number; distortion: string; originText: string; startedAt: number | null; expiresAt: number | null };
  event?: { startAt: number; endAt: number | null; precision: "year" | "month" | "day" | "minute"; kind: string };
}

export function EntityForm({ initial, refs, mode }: { initial: EntityFormValue; refs?: RefMap; mode: "create" | "edit" }) {
  const w = useWorld();
  const router = useRouter();
  const [v, setV] = React.useState<EntityFormValue>(initial);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const def = getEntityType(v.type, w.customTypes);
  const set = <K extends keyof EntityFormValue>(k: K, val: EntityFormValue[K]) => setV((s) => ({ ...s, [k]: val }));
  const setField = (k: string, val: unknown) => setV((s) => ({ ...s, fields: { ...s.fields, [k]: val } }));
  const dirty = React.useRef(false);
  React.useEffect(() => {
    dirty.current = JSON.stringify(v) !== JSON.stringify(initial);
  }, [v, initial]);
  React.useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (dirty.current && !pending) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [pending]);

  async function save() {
    if (!v.name.trim()) {
      setErrors({ name: "Name is required" });
      return;
    }
    const customRows = (v.fields[CUSTOM_FIELDS_KEY] as CustomField[] | undefined) ?? [];
    if (customRows.some((r) => r.value.trim() && !r.label.trim())) {
      toast.error("Give each of your own fields a label.");
      return;
    }
    if (customRows.some((r) => r.label.trim() && !r.value.trim())) {
      toast.error("One of your own fields has a label but no value. Fill it in or remove it.");
      return;
    }
    setPending(true);
    const payload = {
      name: v.name.trim(),
      aliases: v.aliases,
      summary: v.summary,
      body: v.body,
      dmNotes: v.dmNotes,
      fields: v.fields,
      status: v.status || null,
      locationId: v.location?.id ?? null,
      parentId: v.parent?.id ?? null,
      visibility: v.visibility,
      canonStatus: v.canonStatus,
      importance: v.importance,
      tags: v.tags,
      imageFileId: v.imageFileId,
      ...(v.quest && {
        quest: {
          status: v.quest.status as never,
          priority: v.quest.priority,
          giverId: v.quest.giver?.id ?? null,
          threadId: v.quest.thread?.id ?? null,
          rewards: v.quest.rewards,
          prerequisites: v.quest.prerequisites,
          consequences: v.quest.consequences,
          playerKnowledge: v.quest.playerKnowledge,
          objectives: v.quest.objectives.filter((o) => o.text.trim()),
        },
      }),
      ...(v.thread && { thread: { ...v.thread, status: v.thread.status as never, stages: v.thread.stages.filter((s) => s.title.trim()) } }),
      ...(v.mystery && { mystery: { ...v.mystery, status: v.mystery.status as never } }),
      ...(v.rumour && { rumour: { ...v.rumour, claim: v.rumour.claim || v.summary || v.name } }),
      ...(v.event && { event: { ...v.event, kind: v.event.kind as never } }),
    };
    const res = mode === "edit" && v.id ? await updateEntityAction(w.worldId, v.id, payload) : await createEntityAction(w.worldId, { ...payload, type: v.type, campaignId: v.campaignId } as EntityInput);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    dirty.current = false;
    toast.success(mode === "edit" ? "Saved" : `Created ${res.data.name}`);
    router.push(`/w/${w.worldId}/e/${res.data.id}`);
    router.refresh();
  }

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const detailFields = def.fields.filter((f) => f.section !== "dm" && f.section !== "stats");
  const statFields = def.fields.filter((f) => f.section === "stats");
  const dmFields = def.fields.filter((f) => f.section === "dm");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex items-start gap-4">
          <ImageField value={v.imageFileId} onChange={(id) => set("imageFileId", id)} type={v.type} />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Input
              aria-label="Name"
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={`Name this ${lowerLabel(def.label)}`}
              className="h-12 border-transparent bg-transparent px-0 font-serif text-3xl font-semibold hover:border-transparent focus:border-transparent focus:ring-0"
              aria-invalid={!!errors.name}
              autoFocus={mode === "create"}
            />
            {errors.name && <p className="-mt-2 text-xs text-ember">{errors.name}</p>}
            <Field label="Summary" htmlFor="ef-summary" hint="One or two sentences. Shown in lists and given to the AI first.">
              <Textarea id="ef-summary" value={v.summary} onChange={(e) => set("summary", e.target.value)} className="min-h-16" />
            </Field>
          </div>
        </div>

        {v.event && (
          <Panel className="p-4">
            <SectionTitle>When</SectionTitle>
            <div className="flex flex-col gap-3">
              <WorldDateInput calendar={w.calendar} value={v.event.startAt} onChange={(n) => set("event", { ...v.event!, startAt: n })} withTime={v.event.precision === "minute"} />
              <div className="flex flex-wrap items-center gap-4">
                <Segmented
                  size="sm"
                  value={v.event.precision}
                  onChange={(p) => set("event", { ...v.event!, precision: p })}
                  options={[
                    { value: "year", label: "Year" },
                    { value: "month", label: "Month" },
                    { value: "day", label: "Day" },
                    { value: "minute", label: "Exact time" },
                  ]}
                />
                <NativeSelect value={v.event.kind} onChange={(e) => set("event", { ...v.event!, kind: e.target.value })} className="w-44" aria-label="Event kind">
                  {["historical", "world", "campaign", "character", "faction"].map((k) => (
                    <option key={k} value={k}>
                      {k[0]!.toUpperCase() + k.slice(1)} event
                    </option>
                  ))}
                </NativeSelect>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={v.event.endAt !== null} onCheckedChange={(c) => set("event", { ...v.event!, endAt: c ? v.event!.startAt : null })} /> Lasts a while
                </label>
              </div>
              {v.event.endAt !== null && (
                <Field label="Until">
                  <WorldDateInput calendar={w.calendar} value={v.event.endAt} onChange={(n) => set("event", { ...v.event!, endAt: n })} />
                </Field>
              )}
            </div>
          </Panel>
        )}

        {v.quest && <QuestFields value={v.quest} onChange={(q) => set("quest", q)} />}
        {v.thread && <ThreadFields value={v.thread} onChange={(t) => set("thread", t)} />}
        {v.mystery && (
          <Panel className="flex flex-col gap-4 p-4">
            <Field label="The question" htmlFor="ef-mq">
              <Input id="ef-mq" value={v.mystery.question} onChange={(e) => set("mystery", { ...v.mystery!, question: e.target.value })} placeholder="Who killed the prince?" />
            </Field>
            <Field label="The truth (DM only)" htmlFor="ef-mt">
              <Textarea id="ef-mt" value={v.mystery.truth} onChange={(e) => set("mystery", { ...v.mystery!, truth: e.target.value })} className="min-h-20" />
            </Field>
            <Field label="Status" htmlFor="ef-ms">
              <NativeSelect id="ef-ms" value={v.mystery.status} onChange={(e) => set("mystery", { ...v.mystery!, status: e.target.value })} className="w-52">
                <option value="open">Open</option>
                <option value="partially_solved">Partially solved</option>
                <option value="solved">Solved</option>
                <option value="abandoned">Abandoned</option>
              </NativeSelect>
            </Field>
            <p className="text-xs text-faint">Add clues from the mystery's page after saving.</p>
          </Panel>
        )}
        {v.rumour && (
          <Panel className="flex flex-col gap-4 p-4">
            <Field label="What people say" htmlFor="ef-rc">
              <Textarea id="ef-rc" value={v.rumour.claim} onChange={(e) => set("rumour", { ...v.rumour!, claim: e.target.value })} className="min-h-16" />
            </Field>
            <Field label="What's actually true (DM only)" htmlFor="ef-rt">
              <Textarea id="ef-rt" value={v.rumour.truth} onChange={(e) => set("rumour", { ...v.rumour!, truth: e.target.value })} className="min-h-16" />
            </Field>
            <Field label={`Accuracy: ${v.rumour.accuracy}%`}>
              <Slider value={[v.rumour.accuracy]} min={0} max={100} step={5} onValueChange={([n]) => set("rumour", { ...v.rumour!, accuracy: n ?? 50 })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="How it's distorted" htmlFor="ef-rd">
                <Input id="ef-rd" value={v.rumour.distortion} onChange={(e) => set("rumour", { ...v.rumour!, distortion: e.target.value })} />
              </Field>
              <Field label="Where it started" htmlFor="ef-ro">
                <Input id="ef-ro" value={v.rumour.originText} onChange={(e) => set("rumour", { ...v.rumour!, originText: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <OptionalWorldDate label="Started circulating" value={v.rumour.startedAt} onChange={(n) => set("rumour", { ...v.rumour!, startedAt: n })} />
              <OptionalWorldDate label="Fades out" value={v.rumour.expiresAt} onChange={(n) => set("rumour", { ...v.rumour!, expiresAt: n })} />
            </div>
          </Panel>
        )}

        {detailFields.length > 0 && (
          <section>
            <SectionTitle>{def.label} details</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              {detailFields.map((f) => (
                <FieldInput key={f.key} def={f} value={v.fields[f.key]} onChange={(val) => setField(f.key, val)} />
              ))}
            </div>
          </section>
        )}
        {statFields.length > 0 && (
          <section>
            <SectionTitle>Stats</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              {statFields.map((f) => (
                <FieldInput key={f.key} def={f} value={v.fields[f.key]} onChange={(val) => setField(f.key, val)} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionTitle>Article</SectionTitle>
          <MarkdownEditor value={v.body} onChange={(b) => set("body", b)} refs={refs} minRows={14} ariaLabel="Article" />
        </section>

        <CustomFieldsEditor value={(v.fields[CUSTOM_FIELDS_KEY] as CustomField[] | undefined) ?? []} onChange={(rows) => setField(CUSTOM_FIELDS_KEY, rows)} />

        <section className="rounded-lg border border-dashed border-ember/40 p-4">
          <SectionTitle>
            <span className="text-ember">DM only</span>
          </SectionTitle>
          <div className="flex flex-col gap-4">
            {dmFields.map((f) => (
              <FieldInput key={f.key} def={f} value={v.fields[f.key]} onChange={(val) => setField(f.key, val)} />
            ))}
            <Field label="DM notes" htmlFor="ef-dmnotes">
              <MarkdownEditor id="ef-dmnotes" value={v.dmNotes} onChange={(b) => set("dmNotes", b)} refs={refs} minRows={4} allowDmBlocks={false} placeholder="Private notes. Never shown to players." />
            </Field>
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-5 lg:sticky lg:top-4 lg:self-start">
        <Panel className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2">
            <TypeGlyph type={v.type} size="sm" />
            <span className="font-medium">{def.label}</span>
          </div>
          {def.statuses?.length ? (
            <Field label="Status" htmlFor="ef-status">
              <NativeSelect id="ef-status" value={v.status ?? ""} onChange={(e) => set("status", e.target.value || null)}>
                <option value="">—</option>
                {def.statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          {v.type !== "continent" && (
            <Field label={def.isPlace ? "Located in" : "Where"}>
              <EntityPicker value={v.location} onChange={(o) => set("location", o)} types={PLACE_TYPES} excludeIds={v.id ? [v.id] : []} placeholder="Choose a place" allowCreate={false} />
            </Field>
          )}
          <Field label="Visibility" htmlFor="ef-vis" hint={v.visibility === "secret" ? "Hidden until players discover it." : v.visibility === "dm_only" ? "Never shown to players." : undefined}>
            <NativeSelect id="ef-vis" value={v.visibility} onChange={(e) => set("visibility", e.target.value as EntityFormValue["visibility"])}>
              <option value="public">Public: common knowledge</option>
              <option value="discovered">Discovered by the players</option>
              <option value="partially_known">Partially known</option>
              <option value="secret">Secret until discovered</option>
              <option value="dm_only">DM only, always</option>
            </NativeSelect>
          </Field>
          <Field label="Canon">
            <Segmented
              size="sm"
              value={v.canonStatus}
              onChange={(c) => set("canonStatus", c)}
              options={[
                { value: "draft", label: "Draft" },
                { value: "proposed", label: "Proposed" },
                { value: "canon", label: "Canon" },
                { value: "archived", label: "Archived" },
              ]}
            />
          </Field>
          <Field label="Importance">
            <Segmented
              size="sm"
              value={String(v.importance) as "0" | "1" | "2"}
              onChange={(c) => set("importance", Number(c))}
              options={[
                { value: "0", label: "Normal" },
                { value: "1", label: "Important" },
                { value: "2", label: "Major" },
              ]}
            />
          </Field>
        </Panel>
        <Panel className="flex flex-col gap-4 p-4">
          <Field label="Also known as" htmlFor="ef-aliases" hint="Comma-separated. Aliases also resolve @mentions.">
            <Input id="ef-aliases" value={v.aliases.join(", ")} onChange={(e) => set("aliases", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
          </Field>
          <Field label="Tags" htmlFor="ef-tags" hint="Comma-separated.">
            <Input id="ef-tags" value={v.tags.join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
          </Field>
          <Field label="Parent page" hint="For sub-articles in the wiki tree.">
            <EntityPicker value={v.parent} onChange={(o) => set("parent", o)} excludeIds={v.id ? [v.id] : []} placeholder="None" allowCreate={false} />
          </Field>
        </Panel>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending} className="flex-1">
            {mode === "edit" ? "Save" : "Create"}
          </Button>
        </div>
        <p className="text-center text-xs text-faint">⌘S to save</p>
      </aside>
    </form>
  );
}

function FieldInput({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const id = `f-${def.key}`;
  const wide = def.kind === "textarea" || def.kind === "inventory" || def.kind === "abilities";
  const wrap = (child: React.ReactNode) => (
    <Field label={def.label} htmlFor={id} hint={def.help ?? def.placeholder} className={cn(wide && "sm:col-span-2")}>
      {child}
    </Field>
  );
  switch (def.kind) {
    case "text":
      return wrap(<Input id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />);
    case "number":
      return wrap(<Input id={id} type="number" value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} className="w-32" />);
    case "textarea":
      return wrap(<Textarea id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className="min-h-20 font-serif text-[1rem]" />);
    case "select":
      return wrap(
        <NativeSelect id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">—</option>
          {def.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </NativeSelect>,
      );
    case "boolean":
      return wrap(<Switch checked={!!value} onCheckedChange={onChange} />);
    case "tags":
      return wrap(<Input id={id} value={Array.isArray(value) ? value.join(", ") : ((value as string) ?? "")} onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />);
    case "inventory":
      return wrap(<InventoryEditor value={(value as { name: string; price?: string; qty?: string; notes?: string }[]) ?? []} onChange={onChange} />);
    case "abilities":
      return wrap(<AbilitiesEditor value={(value as Record<string, number>) ?? {}} onChange={onChange} />);
  }
}

function InventoryEditor({ value, onChange }: { value: { name: string; price?: string; qty?: string; notes?: string }[]; onChange: (v: unknown) => void }) {
  const update = (i: number, k: string, val: string) => onChange(value.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  return (
    <div className="flex flex-col gap-1.5">
      {value.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_6rem_4rem_1fr_auto] gap-1.5">
          <Input aria-label="Item" value={r.name} onChange={(e) => update(i, "name", e.target.value)} placeholder="Item" className="h-7 text-sm" />
          <Input aria-label="Price" value={r.price ?? ""} onChange={(e) => update(i, "price", e.target.value)} placeholder="Price" className="h-7 text-sm" />
          <Input aria-label="Quantity" value={r.qty ?? ""} onChange={(e) => update(i, "qty", e.target.value)} placeholder="Qty" className="h-7 text-sm" />
          <Input aria-label="Notes" value={r.notes ?? ""} onChange={(e) => update(i, "notes", e.target.value)} placeholder="Notes" className="h-7 text-sm" />
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove row">
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onChange([...value, { name: "", price: "", qty: "", notes: "" }])}>
        <Plus /> Add row
      </Button>
    </div>
  );
}

function AbilitiesEditor({ value, onChange }: { value: Record<string, number>; onChange: (v: unknown) => void }) {
  const keys = ["str", "dex", "con", "int", "wis", "cha"] as const;
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {keys.map((k) => (
        <label key={k} className="flex flex-col items-center gap-1">
          <span className="text-2xs font-semibold uppercase text-faint">{k}</span>
          <Input
            type="number"
            min={1}
            max={30}
            value={value[k] ?? 10}
            onChange={(e) => onChange({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...value, [k]: Number(e.target.value) || 10 })}
            className="h-8 px-1 text-center tabular"
          />
        </label>
      ))}
    </div>
  );
}

function QuestFields({ value, onChange }: { value: NonNullable<EntityFormValue["quest"]>; onChange: (v: NonNullable<EntityFormValue["quest"]>) => void }) {
  const set = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) => onChange({ ...value, [k]: v });
  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" htmlFor="q-status">
          <NativeSelect id="q-status" value={value.status} onChange={(e) => set("status", e.target.value)}>
            {["unknown", "available", "active", "completed", "failed", "abandoned", "hidden"].map((s) => (
              <option key={s} value={s}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Priority">
          <Segmented size="sm" value={String(value.priority) as "0" | "1" | "2" | "3"} onChange={(p) => set("priority", Number(p))} options={["Low", "Normal", "High", "Urgent"].map((l, i) => ({ value: String(i) as "0", label: l }))} />
        </Field>
        <Field label="Quest giver">
          <EntityPicker value={value.giver} onChange={(o) => set("giver", o)} types={["npc", "faction", "organization", "religion", "pc"]} placeholder="Who offers it?" />
        </Field>
        <Field label="Related world thread">
          <EntityPicker value={value.thread} onChange={(o) => set("thread", o)} types={["world_thread"]} placeholder="Optional" />
        </Field>
      </div>
      <Field label="Objectives">
        <div className="flex flex-col gap-1.5">
          {value.objectives.map((o, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <GripVertical className="size-4 shrink-0 text-faint" aria-hidden />
              <NativeSelect value={o.status} onChange={(e) => set("objectives", value.objectives.map((x, j) => (j === i ? { ...x, status: e.target.value as "open" } : x)))} className="h-7 w-24 text-sm" aria-label="Objective status">
                <option value="open">Open</option>
                <option value="done">Done</option>
                <option value="failed">Failed</option>
              </NativeSelect>
              <Input value={o.text} onChange={(e) => set("objectives", value.objectives.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className="h-7 text-sm" aria-label="Objective" />
              <label className="flex shrink-0 items-center gap-1 text-xs text-faint" title="Hidden from players">
                <Switch checked={o.hidden} onCheckedChange={(h) => set("objectives", value.objectives.map((x, j) => (j === i ? { ...x, hidden: h } : x)))} /> hidden
              </label>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => set("objectives", value.objectives.filter((_, j) => j !== i))} aria-label="Remove objective">
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => set("objectives", [...value.objectives, { text: "", status: "open", hidden: false }])}>
            <Plus /> Add objective
          </Button>
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rewards" htmlFor="q-rewards">
          <Textarea id="q-rewards" value={value.rewards} onChange={(e) => set("rewards", e.target.value)} className="min-h-14" />
        </Field>
        <Field label="Prerequisites" htmlFor="q-pre">
          <Textarea id="q-pre" value={value.prerequisites} onChange={(e) => set("prerequisites", e.target.value)} className="min-h-14" />
        </Field>
        <Field label="Consequences" htmlFor="q-cons">
          <Textarea id="q-cons" value={value.consequences} onChange={(e) => set("consequences", e.target.value)} className="min-h-14" />
        </Field>
        <Field label="What the players know" htmlFor="q-pk">
          <Textarea id="q-pk" value={value.playerKnowledge} onChange={(e) => set("playerKnowledge", e.target.value)} className="min-h-14" />
        </Field>
      </div>
    </Panel>
  );
}

function CustomFieldsEditor({ value, onChange }: { value: CustomField[]; onChange: (rows: CustomField[]) => void }) {
  const set = (i: number, patch: Partial<CustomField>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <section>
      <SectionTitle>Your own fields</SectionTitle>
      <p className="-mt-1 mb-2 text-xs text-faint">Anything this entry needs that its type doesn&apos;t have: a bounty, a favourite drink, a debt owed.</p>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1.5">
          {value.map((r, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto_auto] items-center gap-1.5">
              <Input value={r.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Label" className="h-8 text-sm" aria-label={`Field ${i + 1} label`} maxLength={60} />
              <Input value={r.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="Value" className="h-8 text-sm" aria-label={`Field ${i + 1} value`} maxLength={2000} />
              <label className="flex items-center gap-1.5 whitespace-nowrap px-1 text-xs text-muted" title="Never shown to players">
                <Switch checked={r.dmOnly} onCheckedChange={(c) => set(i, { dmOnly: c })} aria-label={`Field ${i + 1} DM only`} /> DM only
              </label>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove field ${i + 1}`}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {value.length < 30 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...value, { label: "", value: "", dmOnly: false }])}>
          <Plus /> Add a field
        </Button>
      )}
    </section>
  );
}

function ThreadFields({ value, onChange }: { value: NonNullable<EntityFormValue["thread"]>; onChange: (v: NonNullable<EntityFormValue["thread"]>) => void }) {
  const w = useWorld();
  const set = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) => onChange({ ...value, [k]: v });
  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status" htmlFor="t-status">
          <NativeSelect id="t-status" value={value.status} onChange={(e) => set("status", e.target.value)}>
            {["dormant", "active", "escalating", "paused", "resolved", "failed"].map((s) => (
              <option key={s} value={s}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={`Urgency: ${value.urgency}/5`}>
          <Slider value={[value.urgency]} min={1} max={5} step={1} onValueChange={([n]) => set("urgency", n ?? 3)} className="mt-2" />
        </Field>
        <Field label={`Momentum: ${value.momentum}%/week`} hint="How fast it moves if nobody intervenes.">
          <Slider value={[value.momentum]} min={0} max={50} step={1} onValueChange={([n]) => set("momentum", n ?? 10)} className="mt-2" />
        </Field>
      </div>
      <Field label={`Progress: ${value.progress}%`}>
        <Slider value={[value.progress]} min={0} max={100} step={1} onValueChange={([n]) => set("progress", n ?? 0)} />
      </Field>
      <Field label="Stages" hint="Stages divide the track evenly; reaching one creates an event when the world advances.">
        <div className="flex flex-col gap-1.5">
          {value.stages.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-6 shrink-0 text-center text-xs text-faint tabular">{i + 1}</span>
              <Input value={s.title} onChange={(e) => set("stages", value.stages.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="h-7 text-sm" aria-label={`Stage ${i + 1}`} />
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => set("stages", value.stages.filter((_, j) => j !== i))} aria-label="Remove stage">
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => set("stages", [...value.stages, { title: "", description: "" }])}>
            <Plus /> Add stage
          </Button>
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Goals" htmlFor="t-goals">
          <Textarea id="t-goals" value={value.goals} onChange={(e) => set("goals", e.target.value)} className="min-h-14" />
        </Field>
        <Field label="Possible outcomes" htmlFor="t-out">
          <Textarea id="t-out" value={value.possibleOutcomes} onChange={(e) => set("possibleOutcomes", e.target.value)} className="min-h-14" />
        </Field>
        <Field label="Triggers" htmlFor="t-trig" hint="What would speed it up, slow it, or end it.">
          <Textarea id="t-trig" value={value.triggers} onChange={(e) => set("triggers", e.target.value)} className="min-h-14" />
        </Field>
        <div className="flex flex-col gap-4">
          <OptionalWorldDate label="Started on a date" value={value.startAt} onChange={(n) => set("startAt", n)} />
          <Field label="Next milestone" htmlFor="t-next">
            <Input id="t-next" value={value.nextMilestone} onChange={(e) => set("nextMilestone", e.target.value)} />
          </Field>
          <Field label="Milestone date">
            {value.nextMilestoneAt !== null ? (
              <div className="flex items-center gap-2">
                <WorldDateInput calendar={w.calendar} value={value.nextMilestoneAt} onChange={(n) => set("nextMilestoneAt", n)} />
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => set("nextMilestoneAt", null)} aria-label="Clear date">
                  <X />
                </Button>
              </div>
            ) : (
              <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => set("nextMilestoneAt", w.activeCampaign?.currentAt ?? w.worldNow)}>
                Set a date
              </Button>
            )}
          </Field>
        </div>
      </div>
    </Panel>
  );
}

function ImageField({ value, onChange, type }: { value: string | null; onChange: (id: string | null) => void; type: string }) {
  const w = useWorld();
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/w/${w.worldId}/upload`, { method: "POST", body: fd });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) return toast.error(data.error ?? "Upload failed");
    onChange(data.id);
  };
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative flex size-24 items-center justify-center overflow-hidden rounded-lg border border-dashed border-line-strong bg-surface-2 hover:border-accent"
        aria-label={value ? "Change image" : "Add image"}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${value}`} alt="" className="size-full object-cover" />
        ) : busy ? (
          <span className="text-xs text-faint">Uploading…</span>
        ) : (
          <span className="flex flex-col items-center gap-1 text-faint group-hover:text-accent">
            <TypeGlyph type={type} size="sm" />
            <ImagePlus className="size-4" />
          </span>
        )}
      </button>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-faint hover:text-ember" aria-label="Remove image">
          <X className="size-3.5" />
        </button>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </div>
  );
}
