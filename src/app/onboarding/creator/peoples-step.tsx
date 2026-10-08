"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, RotateCcw, Sparkles, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Segmented } from "@/components/ui/primitives";
import { AiWorking } from "@/components/ai/ai-working";
import { suggestPeoplesAction } from "@/server/actions/creator";
import type { CreatorDraft } from "@/server/ai/tasks/creator";
import { CORE_CLASSES, CORE_RACES, PREVALENCE, PREVALENCE_CHOICES, type PeopleSuggestion, type Prevalence, type PrevalenceChoice } from "@/lib/peoples";
import { cn } from "@/lib/utils";
import { chosenPeopleNames, defaultPeoples, type CreatorState } from "./state";

const label = (p: PrevalenceChoice) => (p === "Absent" ? "Not in this world" : p);

function PrevalenceSelect({ id, value, onChange, absent = true, className }: { id: string; value: PrevalenceChoice; onChange: (v: PrevalenceChoice) => void; absent?: boolean; className?: string }) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value as PrevalenceChoice)} className={cn("h-8 w-40 text-sm", value === "Absent" && "text-faint", className)}>
      {(absent ? PREVALENCE_CHOICES : PREVALENCE).map((p) => (
        <option key={p} value={p}>
          {label(p)}
        </option>
      ))}
    </NativeSelect>
  );
}

function CoreTable({ title, rows, values, onChange }: { title: string; rows: { name: string; summary: string; meta: string }[]; values: Record<string, PrevalenceChoice>; onChange: (name: string, v: PrevalenceChoice) => void }) {
  const kept = rows.filter((r) => (values[r.name] ?? "Absent") !== "Absent").length;
  return (
    <section aria-label={title}>
      <h3 className="mb-2 flex items-baseline gap-2 text-md font-semibold">
        {title} <span className="text-sm font-normal text-faint">{kept} of {rows.length} in this world</span>
      </h3>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {rows.map((r) => {
          const v = values[r.name] ?? "Absent";
          return (
            <li key={r.name} className={cn("flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4", v === "Absent" && "bg-surface-2/50")}>
              <div className="min-w-0 flex-1">
                <label htmlFor={`prev-${r.name}`} className={cn("font-medium", v === "Absent" && "text-muted")}>
                  {r.name}
                </label>
                <span className="ml-2 text-xs text-faint">{r.meta}</span>
                <p className="truncate text-sm text-muted" title={r.summary}>
                  {r.summary}
                </p>
              </div>
              <PrevalenceSelect id={`prev-${r.name}`} value={v} onChange={(nv) => onChange(r.name, nv)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function PeoplesStep({ state, update, draft, aiLive }: { state: CreatorState; update: (patch: Partial<CreatorState>) => void; draft: () => CreatorDraft; aiLive: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [ideas, setIdeas] = React.useState<PeopleSuggestion[]>([]);
  const [own, setOwn] = React.useState<{ kind: "race" | "class"; name: string; prevalence: Prevalence; summary: string }>({ kind: "race", name: "", prevalence: "Uncommon", summary: "" });

  const setRace = (name: string, v: PrevalenceChoice) => update({ races: { ...state.races, [name]: v }, peoplesTouched: true });
  const setClass = (name: string, v: PrevalenceChoice) => update({ classes: { ...state.classes, [name]: v }, peoplesTouched: true });
  const added = new Set(state.homebrew.map((h) => `${h.kind}:${h.name.toLowerCase()}`));

  async function suggest() {
    setBusy(true);
    const res = await suggestPeoplesAction(draft(), chosenPeopleNames(state));
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setIdeas(res.data.items);
  }
  function toggle(s: PeopleSuggestion) {
    const k = `${s.kind}:${s.name.toLowerCase()}`;
    update({ homebrew: added.has(k) ? state.homebrew.filter((h) => `${h.kind}:${h.name.toLowerCase()}` !== k) : [...state.homebrew, s] });
  }
  function addOwn(e: React.FormEvent) {
    e.preventDefault();
    if (!own.name.trim()) return;
    if (added.has(`${own.kind}:${own.name.trim().toLowerCase()}`)) return toast.error(`${own.name} is already in the list.`);
    update({ homebrew: [...state.homebrew, { kind: own.kind, name: own.name.trim(), prevalence: own.prevalence, summary: own.summary.trim(), reason: "", fields: {} }] });
    setOwn({ ...own, name: "", summary: "" });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-2 px-4 py-3 text-sm">
        <p className="max-w-prose text-muted">
          The D&amp;D 5e races and classes are set to how common they'd be in a {state.genre.toLowerCase()} world with {state.magicLevel.toLowerCase()} magic. Change any of them, or leave some out.
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={() => update({ ...defaultPeoples(state), peoplesTouched: false })}>
          <RotateCcw /> Reset to suggested
        </Button>
      </div>

      <CoreTable title="Races" rows={CORE_RACES.map((r) => ({ name: r.name, summary: r.summary, meta: `${r.size} · ${r.speed}${r.rules === "2014" ? " · 2014 rules" : ""}` }))} values={state.races} onChange={setRace} />
      <CoreTable title="Classes" rows={CORE_CLASSES.map((c) => ({ name: c.name, summary: c.summary, meta: `${c.hitDie} · ${c.primaryAbility}` }))} values={state.classes} onChange={setClass} />

      <section aria-label="Homebrew" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-md font-semibold">Homebrew for this world</h3>
            <p className="text-sm text-muted">Races and classes your setting would produce on its own. A steampunk world breeds artificers; high magic lets planeswalkers exist.</p>
          </div>
          <Button type="button" variant="arcane" onClick={suggest} loading={busy}>
            <Sparkles /> {ideas.length ? "Suggest more" : "Suggest homebrew"}
          </Button>
        </div>
        <AiWorking active={busy} live={aiLive} what="Claude is designing peoples for your world" typical="10–20 seconds" />

        {ideas.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {ideas.map((s) => {
              const on = added.has(`${s.kind}:${s.name.toLowerCase()}`);
              return (
                <li key={`${s.kind}:${s.name}`} className={cn("flex flex-col gap-2 rounded-lg border p-3", on ? "border-accent bg-accent-soft/40" : "border-line")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-serif text-lg font-semibold">{s.name}</span>{" "}
                      <Badge tone={s.kind === "race" ? "brass" : "arcane"}>{s.kind === "race" ? "Race" : "Class"}</Badge>
                    </div>
                    <Button type="button" size="sm" variant={on ? "secondary" : "primary"} onClick={() => toggle(s)} aria-pressed={on}>
                      {on ? <Check /> : <Plus />} {on ? "Added" : "Add"}
                    </Button>
                  </div>
                  <p className="text-sm">{s.summary}</p>
                  {s.reason && <p className="text-sm italic text-muted">{s.reason}</p>}
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <label htmlFor={`hb-${s.name}`}>How common</label>
                    <PrevalenceSelect
                      id={`hb-${s.name}`}
                      absent={false}
                      value={(state.homebrew.find((h) => h.kind === s.kind && h.name === s.name)?.prevalence ?? s.prevalence) as PrevalenceChoice}
                      onChange={(v) => {
                        const p = v as Prevalence;
                        setIdeas((xs) => xs.map((x) => (x === s ? { ...x, prevalence: p } : x)));
                        if (on) update({ homebrew: state.homebrew.map((h) => (h.kind === s.kind && h.name === s.name ? { ...h, prevalence: p } : h)) });
                      }}
                      className="w-32"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {state.homebrew.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-sm font-medium text-muted">Added to your world</h4>
            <ul className="flex flex-wrap gap-2">
              {state.homebrew.map((h) => (
                <li key={`${h.kind}:${h.name}`} className="inline-flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-3 pr-1 text-sm">
                  {h.name} <span className="text-faint">· {h.kind} · {h.prevalence.toLowerCase()}</span>
                  <button type="button" onClick={() => toggle(h)} className="rounded-full p-1 text-faint hover:text-ember" aria-label={`Remove ${h.name}`}>
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={addOwn} className="grid gap-3 rounded-lg border border-dashed border-line p-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
          <Field label="Your own">
            <Segmented value={own.kind} onChange={(v) => setOwn({ ...own, kind: v })} options={[{ value: "race", label: "Race" }, { value: "class", label: "Class" }]} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="own-name">
              <Input id="own-name" value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} placeholder={own.kind === "race" ? "Mossborn" : "Storm Herald"} />
            </Field>
            <Field label="One line about them" htmlFor="own-summary">
              <Input id="own-summary" value={own.summary} onChange={(e) => setOwn({ ...own, summary: e.target.value })} />
            </Field>
          </div>
          <div className="flex items-end gap-2">
            <PrevalenceSelect id="own-prev" absent={false} value={own.prevalence} onChange={(v) => setOwn({ ...own, prevalence: v as Prevalence })} className="w-32" />
            <Button type="submit" variant="secondary" disabled={!own.name.trim()}>
              <Plus /> Add
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
