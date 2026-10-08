"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dices, Save, Sparkles, NotebookPen, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/common/markdown";
import { useWorld } from "@/components/shell/world-context";
import { needSomethingAction } from "@/server/actions/ai";
import { rollTableAction } from "@/server/actions/tools";
import { createEntityAction } from "@/server/actions/entities";
import type { EmergencyResult } from "@/server/ai/tasks/dm-tools";
import { cn } from "@/lib/utils";

const KINDS: { kind: EmergencyResult["kind"]; label: string }[] = [
  { kind: "npc", label: "NPC" },
  { kind: "encounter", label: "Encounter" },
  { kind: "name", label: "Names" },
  { kind: "rumour", label: "Rumour" },
  { kind: "shop", label: "Shop" },
  { kind: "tavern", label: "Tavern" },
  { kind: "clue", label: "Clue" },
  { kind: "complication", label: "Complication" },
  { kind: "treasure", label: "Treasure" },
  { kind: "location", label: "Location" },
];

/** "I need something now": one click, something usable at the table, optionally saved to the world. */
export function NeedSomethingNow({ onLog, columns = 5 }: { onLog?: (text: string) => void; columns?: number }) {
  const w = useWorld();
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<EmergencyResult | null>(null);
  const [hint, setHint] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const go = async (kind: EmergencyResult["kind"]) => {
    setBusy(kind);
    const res = await needSomethingAction(w.worldId, { kind, hint: hint.trim() || undefined, campaignId: w.activeCampaign?.id ?? null });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setResult(res.data);
  };
  const save = async () => {
    if (!result?.entityType) return;
    setSaving(true);
    const res = await createEntityAction(w.worldId, {
      type: result.entityType,
      name: result.title,
      summary: result.summary,
      body: result.text,
      fields: result.fields,
      locationId: result.locationId,
      visibility: "discovered",
      ...(result.entityType === "rumour" ? { rumour: { claim: result.summary || result.title, accuracy: 50 } } : {}),
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Saved ${res.data.name} to your world`, { action: { label: "Open", onClick: () => router.push(`/w/${w.worldId}/e/${res.data.id}`) } });
  };
  return (
    <div className="flex flex-col gap-3">
      <Input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Optional hint: “grumpy”, “undead”, “for a noble’s party”…" className="h-8 text-sm" />
      <div className={cn("grid gap-1.5", columns === 5 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-3")}>
        {KINDS.map((k) => (
          <Button key={k.kind} variant="secondary" size="sm" onClick={() => go(k.kind)} loading={busy === k.kind} disabled={!!busy}>
            {busy !== k.kind && <Zap className="!text-ember" />} {k.label}
          </Button>
        ))}
      </div>
      {result && (
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="font-serif text-lg font-semibold">{result.title}</p>
            {result.provider !== "offline" && <Sparkles className="size-3.5 text-arcane" />}
          </div>
          <Markdown variant="sans" className="text-sm">
            {result.text}
          </Markdown>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.entityType && (
              <Button size="xs" variant="primary" onClick={save} loading={saving}>
                <Save /> Save to world
              </Button>
            )}
            {onLog && (
              <Button size="xs" variant="secondary" onClick={() => onLog(`${result.title}: ${result.text.split("\n")[0]}`)}>
                <NotebookPen /> Add to notes
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={() => go(result.kind)} disabled={!!busy}>
              Another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function rollExpression(expr: string): { total: number; detail: string } | null {
  const clean = expr.replace(/\s+/g, "").toLowerCase();
  if (!/^[\dd+\-]+$/.test(clean)) return null;
  const parts = clean.match(/[+-]?[^+-]+/g);
  if (!parts) return null;
  let total = 0;
  const detail: string[] = [];
  for (const p of parts) {
    const sign = p.startsWith("-") ? -1 : 1;
    const body = p.replace(/^[+-]/, "");
    const m = body.match(/^(\d*)d(\d+)$/);
    if (m) {
      const n = Math.min(100, Number(m[1] || 1));
      const d = Number(m[2]);
      if (!d) return null;
      const rolls = Array.from({ length: n }, () => Math.floor(Math.random() * d) + 1);
      total += sign * rolls.reduce((a, b) => a + b, 0);
      detail.push(`${sign < 0 ? "−" : ""}[${rolls.join(", ")}]`);
    } else if (/^\d+$/.test(body)) {
      total += sign * Number(body);
      detail.push(`${sign < 0 ? "−" : "+"}${body}`);
    } else return null;
  }
  return { total, detail: detail.join(" ") };
}

export function DiceRoller({ onLog }: { onLog?: (text: string) => void }) {
  const [expr, setExpr] = React.useState("1d20");
  const [history, setHistory] = React.useState<{ expr: string; total: number; detail: string }[]>([]);
  const roll = (e = expr) => {
    const r = rollExpression(e);
    if (!r) return toast.error("Try something like 2d6+3");
    setHistory((h) => [{ expr: e, ...r }, ...h].slice(0, 6));
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {["d4", "d6", "d8", "d10", "d12", "d20", "d100"].map((d) => (
          <button key={d} onClick={() => roll(`1${d}`)} className="rounded border border-line px-2 py-1 text-xs font-medium tabular hover:border-line-strong">
            {d}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          roll();
        }}
        className="flex gap-1.5"
      >
        <Input value={expr} onChange={(e) => setExpr(e.target.value)} className="h-8 text-sm tabular" aria-label="Dice expression" />
        <Button type="submit" size="sm" variant="secondary">
          <Dices /> Roll
        </Button>
      </form>
      {history.length > 0 && (
        <ul className="flex flex-col gap-1">
          {history.map((h, i) => (
            <li key={i} className={cn("flex items-center gap-2 text-sm", i > 0 && "text-faint")}>
              <span className="w-14 tabular">{h.expr}</span>
              <span className="text-lg font-semibold tabular">{h.total}</span>
              <span className="truncate text-xs text-faint">{h.detail}</span>
              {i === 0 && onLog && (
                <button onClick={() => onLog(`Rolled ${h.expr}: ${h.total}`)} className="ml-auto text-xs text-faint hover:text-accent">
                  log
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TableRoller({ tables, onLog }: { tables: { id: string; name: string; category: string; local: boolean }[]; onLog?: (text: string) => void }) {
  const w = useWorld();
  const [result, setResult] = React.useState<{ table: string; text: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const roll = async (id: string) => {
    setBusy(id);
    const res = await rollTableAction(w.worldId, id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setResult(res.data);
  };
  if (!tables.length) return <p className="text-sm text-faint">No random tables yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {tables.map((t) => (
          <button
            key={t.id}
            onClick={() => roll(t.id)}
            disabled={!!busy}
            className={cn("rounded-full border px-2.5 py-1 text-xs hover:border-line-strong disabled:opacity-60", t.local ? "border-brass/50 text-brass" : "border-line")}
            title={t.local ? "Table for this location" : t.category}
          >
            {t.name}
          </button>
        ))}
      </div>
      {result && (
        <div className="rounded-md border border-line bg-surface-2 px-3 py-2">
          <p className="text-xs text-faint">{result.table}</p>
          <p className="text-base">{result.text}</p>
          {onLog && (
            <button onClick={() => onLog(`${result.table}: ${result.text}`)} className="mt-1 text-xs text-faint hover:text-accent">
              Add to notes
            </button>
          )}
        </div>
      )}
    </div>
  );
}
