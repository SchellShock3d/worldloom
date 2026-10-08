"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Shapes, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/display";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/primitives";
import { ICONS } from "@/components/entity/type-icon";
import { useWorld } from "@/components/shell/world-context";
import { deleteCustomTypeAction, saveCustomTypeAction } from "@/server/actions/entities";
import { ENTITY_TYPES, type FieldDef } from "@/lib/entity-types";
import { cn } from "@/lib/utils";

interface TypeRow {
  key: string;
  name: string;
  pluralName: string;
  description: string;
  icon: string;
  isPlace: boolean;
  fields: FieldDef[];
}
type EditableField = { label: string; kind: "text" | "textarea" | "number" | "select" | "boolean" | "tags"; options: string; section: "details" | "dm"; inList: boolean; key: string };

const KINDS: { value: EditableField["kind"]; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Choice" },
  { value: "boolean", label: "Yes / no" },
  { value: "tags", label: "List of words" },
];

export function CustomTypes({ types }: { types: (TypeRow & { id?: string })[] }) {
  const [editing, setEditing] = React.useState<TypeRow | "new" | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-md font-semibold">Your entry types</h2>
          <p className="text-sm text-muted">
            The built-in types cover {ENTITY_TYPES.length} kinds of thing, from NPCs to world threads. Add your own for anything your world needs: guild contracts, spells, ships, noble houses. Each gets its own fields and works everywhere: wiki, search, @mentions, maps and AI.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setEditing("new")}>
          <Plus /> New type
        </Button>
      </div>
      {types.length === 0 ? (
        <EmptyState icon={<Shapes />} title="No custom types yet">
          Create one when a built-in type doesn&apos;t quite fit.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {types.map((t) => {
            const Icon = ICONS[t.icon] ?? Shapes;
            return (
              <li key={t.key}>
                <button onClick={() => setEditing(t)} className="flex w-full items-start gap-3 rounded-lg border border-line bg-surface p-4 text-left hover:border-line-strong">
                  <Icon className={cn("mt-0.5 size-5", t.isPlace ? "text-places" : "text-lore")} />
                  <span className="min-w-0">
                    <span className="block font-medium">{t.name}</span>
                    <span className="block text-sm text-muted">{t.description || `${t.fields.length} field${t.fields.length === 1 ? "" : "s"}`}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <TypeDialog type={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TypeDialog({ type, onClose }: { type: (TypeRow & { id?: string }) | null; onClose: () => void }) {
  const w = useWorld();
  const router = useRouter();
  const [name, setName] = React.useState(type?.name ?? "");
  const [plural, setPlural] = React.useState(type?.pluralName ?? "");
  const [description, setDescription] = React.useState(type?.description ?? "");
  const [icon, setIcon] = React.useState(type?.icon ?? "shapes");
  const [isPlace, setIsPlace] = React.useState(type?.isPlace ?? false);
  const [fields, setFields] = React.useState<EditableField[]>(
    (type?.fields ?? []).map((f) => ({ key: f.key, label: f.label, kind: (KINDS.some((k) => k.value === f.kind) ? f.kind : "text") as EditableField["kind"], options: (f.options ?? []).join(", "), section: f.section === "dm" ? "dm" : "details", inList: !!f.inList })),
  );
  const [pending, setPending] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const id = (type as { id?: string } | null)?.id;

  const save = async () => {
    if (!name.trim()) return toast.error("Name the type.");
    setPending(true);
    const res = await saveCustomTypeAction(
      w.worldId,
      {
        name,
        pluralName: plural || undefined,
        description: description || undefined,
        icon,
        isPlace,
        fields: fields
          .filter((f) => f.label.trim())
          .map((f) => ({ key: f.key, label: f.label, kind: f.kind, options: f.kind === "select" ? f.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined, section: f.section, inList: f.inList })),
      },
      id,
    );
    setPending(false);
    if (!res.ok) return void toast.error(res.error);
    onClose();
    router.refresh();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={type ? `Edit “${type.name}”` : "New entry type"} size="lg">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="ct-name">
              <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Noble house" autoFocus />
            </Field>
            <Field label="Plural" htmlFor="ct-plural">
              <Input id="ct-plural" value={plural} onChange={(e) => setPlural(e.target.value)} placeholder={name ? `${name}s` : "Noble houses"} />
            </Field>
          </div>
          <Field label="Description" htmlFor="ct-desc">
            <Input id="ct-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line about what this is for" />
          </Field>
          <div className="flex flex-wrap items-end gap-6">
            <Field label="Icon">
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Icon">
                {Object.entries(ICONS).map(([k, Icon]) => (
                  <button key={k} type="button" role="radio" aria-checked={icon === k} aria-label={k} onClick={() => setIcon(k)} className={cn("flex size-8 items-center justify-center rounded-md border", icon === k ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg")}>
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </Field>
            <label className="flex items-center gap-2 pb-1 text-sm">
              <Switch checked={isPlace} onCheckedChange={setIsPlace} /> It&apos;s a place (can contain things, appears on maps)
            </label>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Fields</p>
            <div className="flex flex-col gap-2">
              {fields.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-md border border-line p-2">
                  <Input value={f.label} onChange={(e) => setFields((fs) => fs.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} className="h-8 min-w-36 flex-1 text-sm" placeholder="Field name" aria-label={`Field ${i + 1} name`} />
                  <NativeSelect value={f.kind} onChange={(e) => setFields((fs) => fs.map((x, k) => (k === i ? { ...x, kind: e.target.value as EditableField["kind"] } : x)))} className="h-8 w-36 text-sm" aria-label="Kind">
                    {KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <label className="flex items-center gap-1 text-xs text-muted" title="Never shown to players">
                    <Switch checked={f.section === "dm"} onCheckedChange={(v) => setFields((fs) => fs.map((x, k) => (k === i ? { ...x, section: v ? "dm" : "details" } : x)))} /> DM only
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted" title="Show as a column in lists">
                    <Switch checked={f.inList} onCheckedChange={(v) => setFields((fs) => fs.map((x, k) => (k === i ? { ...x, inList: v } : x)))} /> in lists
                  </label>
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => setFields((fs) => fs.filter((_, k) => k !== i))} aria-label="Remove field">
                    <X />
                  </Button>
                  {f.kind === "select" && (
                    <Input value={f.options} onChange={(e) => setFields((fs) => fs.map((x, k) => (k === i ? { ...x, options: e.target.value } : x)))} className="h-8 w-full text-sm" placeholder="Choices, separated by commas" aria-label="Choices" />
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setFields((fs) => [...fs, { key: "", label: "", kind: "text", options: "", section: "details", inList: false }])}>
                <Plus /> Add field
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="justify-between">
          {id ? (
            <Button variant="danger-ghost" onClick={() => setConfirm(true)}>
              <Trash2 /> Delete type
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={pending}>
              Save type
            </Button>
          </div>
        </DialogFooter>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={`Delete “${type?.name}”?`}
          description="Only possible once no entries use this type."
          confirmLabel="Delete type"
          onConfirm={async () => {
            if (!id) return;
            const res = await deleteCustomTypeAction(w.worldId, id);
            if (!res.ok) return void toast.error(res.error);
            onClose();
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
