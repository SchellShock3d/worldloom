"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dices, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EntityPicker, type EntityOption } from "@/components/entity/entity-picker";
import { useWorld } from "@/components/shell/world-context";
import { deleteTableAction, rollTableAction, saveTableAction } from "@/server/actions/tools";
import { PLACE_TYPES } from "@/lib/entity-types";

export interface TableView {
  id: string;
  name: string;
  category: string;
  description: string;
  location: { id: string; name: string; type: string } | null;
  entries: { text: string; weight: number }[];
}

const CATEGORY_LABEL: Record<string, string> = { names: "Names", encounters: "Encounters", weather: "Weather", rumours: "Rumours", loot: "Loot", custom: "Custom", tavern: "Taverns", events: "Events" };
const label = (c: string) => CATEGORY_LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

export function TablesManager({ tables, canEdit }: { tables: TableView[]; canEdit: boolean }) {
  const [editing, setEditing] = React.useState<TableView | "new" | null>(null);
  const categories = Array.from(new Set(tables.map((t) => t.category)));
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold">Random tables</h2>
          <p className="text-sm text-muted">Your own tables. Entries can include dice, like “2d6 bandits” or “1d20+5 silver”. Tables tied to a place come up first when the party is there.</p>
        </div>
        {canEdit && (
          <Button variant="secondary" onClick={() => setEditing("new")}>
            <Plus /> New table
          </Button>
        )}
      </div>
      {tables.length === 0 ? (
        <EmptyState icon={<Dices />} title="No tables yet" action={canEdit ? <Button onClick={() => setEditing("new")}>Create a table</Button> : undefined}>
          Make a table of tavern names, road encounters or strange omens, then roll it at the table.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {categories.map((c) => (
            <div key={c}>
              <h3 className="mb-2 text-sm font-semibold text-muted">{label(c)}</h3>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tables
                  .filter((t) => t.category === c)
                  .map((t) => (
                    <TableCard key={t.id} t={t} canEdit={canEdit} onEdit={() => setEditing(t)} />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {editing && <TableEditor table={editing === "new" ? null : editing} categories={categories} onClose={() => setEditing(null)} />}
    </section>
  );
}

function TableCard({ t, canEdit, onEdit }: { t: TableView; canEdit: boolean; onEdit: () => void }) {
  const w = useWorld();
  const [result, setResult] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const roll = async () => {
    setBusy(true);
    const res = await rollTableAction(w.worldId, t.id);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setResult(res.data.text);
  };
  const total = t.entries.reduce((s, e) => s + e.weight, 0);
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{t.name}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-faint">
            {t.entries.length} entries{total !== t.entries.length && ` · weighted`}
            {t.location && (
              <Link href={`/w/${w.worldId}/e/${t.location.id}`} className="inline-flex items-center gap-0.5 text-brass hover:underline">
                <MapPin className="size-3" /> {t.location.name}
              </Link>
            )}
          </p>
        </div>
        {canEdit && (
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${t.name}`}>
            <Pencil />
          </Button>
        )}
      </div>
      {t.description && <p className="text-sm text-muted">{t.description}</p>}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={roll} loading={busy} disabled={!t.entries.length}>
          <Dices /> Roll
        </Button>
        {result && (
          <p className="min-w-0 flex-1 text-sm" aria-live="polite">
            {result}
          </p>
        )}
      </div>
    </li>
  );
}

function TableEditor({ table, categories, onClose }: { table: TableView | null; categories: string[]; onClose: () => void }) {
  const w = useWorld();
  const router = useRouter();
  const [name, setName] = React.useState(table?.name ?? "");
  const [category, setCategory] = React.useState(table?.category ?? "custom");
  const [description, setDescription] = React.useState(table?.description ?? "");
  const [place, setPlace] = React.useState<EntityOption | null>(table?.location ?? null);
  const [rows, setRows] = React.useState<{ key: number; text: string; weight: number }[]>(() => (table?.entries.length ? table.entries : [{ text: "", weight: 1 }]).map((e, i) => ({ key: i, ...e })));
  const [paste, setPaste] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const nextKey = React.useRef(rows.length);
  const allCats = Array.from(new Set(["custom", "names", "encounters", "rumours", "loot", "weather", ...categories]));

  const save = async () => {
    const entries = rows.map((r) => ({ text: r.text.trim(), weight: Math.max(1, Math.min(100, Math.round(r.weight || 1))) })).filter((r) => r.text);
    if (!name.trim()) return toast.error("Name the table.");
    if (!entries.length) return toast.error("Add at least one entry.");
    setPending(true);
    const res = await saveTableAction(w.worldId, { name, category: category.trim().toLowerCase() || "custom", description, locationId: place?.id ?? null, entries }, table?.id);
    setPending(false);
    if (!res.ok) return void toast.error(res.error);
    onClose();
    router.refresh();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={table ? "Edit table" : "New random table"} size="lg">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="tb-name">
              <Input id="tb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Northroad encounters" autoFocus />
            </Field>
            <Field label="Category" htmlFor="tb-cat">
              <Input id="tb-cat" value={category} onChange={(e) => setCategory(e.target.value)} list="tb-cats" />
              <datalist id="tb-cats">
                {allCats.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Description" htmlFor="tb-desc">
              <Input id="tb-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Only near" hint="Roll this table when the party is here.">
              <EntityPicker value={place} onChange={setPlace} types={PLACE_TYPES} placeholder="Anywhere" allowCreate={false} />
            </Field>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium">Entries</span>
              <button className="text-xs text-accent hover:underline" onClick={() => setPaste(paste === null ? rows.map((r) => r.text).filter(Boolean).join("\n") : null)}>
                {paste === null ? "Paste a list" : "Back to rows"}
              </button>
            </div>
            {paste !== null ? (
              <div className="flex flex-col gap-2">
                <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} className="min-h-48 font-mono text-sm" placeholder={"One entry per line\nA lost merchant with 2d6 crates\nWolves, 1d4+1 of them"} aria-label="Entries, one per line" />
                <Button
                  size="sm"
                  variant="secondary"
                  className="self-start"
                  onClick={() => {
                    const lines = paste.split("\n").map((l) => l.trim()).filter(Boolean);
                    setRows(lines.map((text) => ({ key: nextKey.current++, text, weight: 1 })));
                    setPaste(null);
                  }}
                >
                  Use these {paste.split("\n").filter((l) => l.trim()).length} lines
                </Button>
              </div>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {rows.map((r, i) => (
                  <li key={r.key} className="flex items-center gap-2">
                    <span className="w-6 text-right text-xs text-faint tabular">{i + 1}</span>
                    <Input value={r.text} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, text: e.target.value } : x)))} className="h-8 flex-1 text-sm" aria-label={`Entry ${i + 1}`} />
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={r.weight}
                      onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, weight: Number(e.target.value) } : x)))}
                      className="h-8 w-16 text-sm tabular"
                      aria-label={`Weight of entry ${i + 1}`}
                      title="Weight: higher comes up more often"
                    />
                    <Button variant="ghost" size="icon-sm" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove entry ${i + 1}`} disabled={rows.length === 1}>
                      <X />
                    </Button>
                  </li>
                ))}
                <li>
                  <Button variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, { key: nextKey.current++, text: "", weight: 1 }])}>
                    <Plus /> Add entry
                  </Button>
                </li>
              </ol>
            )}
          </div>
        </div>
        <DialogFooter className="justify-between">
          {table ? (
            <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete table
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={pending} disabled={paste !== null}>
              Save table
            </Button>
          </div>
        </DialogFooter>
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete "${table?.name}"?`}
          confirmLabel="Delete table"
          onConfirm={async () => {
            if (!table) return;
            const res = await deleteTableAction(w.worldId, table.id);
            if (!res.ok) return void toast.error(res.error);
            onClose();
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
