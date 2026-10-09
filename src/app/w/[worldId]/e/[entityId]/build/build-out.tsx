"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Plus, RefreshCw, RotateCcw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Checkbox, Segmented } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import { TypeIcon } from "@/components/entity/type-icon";
import { DraftSectionCard, type DraftStatus } from "@/components/ai/draft-section-card";
import { useWorld } from "@/components/shell/world-context";
import { applyBuildOutAction, draftBuildSectionsAction } from "@/server/actions/build-out";
import { buildSectionSummary, planFor, sectionsIn, type BuildSectionData, type BuildSectionDef, type Depth } from "@/lib/build-out";
import { getEntityType } from "@/lib/entity-types";
import { cn } from "@/lib/utils";
import { BuildSectionView } from "./build-views";

interface SectionState {
  data?: BuildSectionData;
  status: DraftStatus;
  notes: string[];
  kept?: boolean;
  error?: string;
}

interface BuildState {
  phase: "setup" | "draft";
  chosen: string[];
  depth: Depth;
  direction: string;
  reveal: boolean;
  sections: Record<string, SectionState>;
  refreshQueue: string[];
  provider: string;
}

export interface BuildFocus {
  id: string;
  name: string;
  type: string;
  summary: string;
  fields: Record<string, unknown>;
  visibility: string;
}

const IDLE: SectionState = { status: "idle", notes: [] };
const storeKey = (id: string) => `wl_build_v1:${id}`;

function load(id: string): BuildState | null {
  try {
    const raw = localStorage.getItem(storeKey(id));
    if (!raw) return null;
    const s = JSON.parse(raw) as BuildState;
    // A reload interrupts anything Claude was writing; pick up from what was saved.
    for (const [k, v] of Object.entries(s.sections)) if (v.status === "drafting") s.sections[k] = { ...v, status: v.data ? "ready" : "idle" };
    return s;
  } catch {
    return null;
  }
}
function save(id: string, s: BuildState) {
  try {
    localStorage.setItem(storeKey(id), JSON.stringify(s));
  } catch {
    /* storage unavailable: the draft won't survive a reload */
  }
}
function clear(id: string) {
  try {
    localStorage.removeItem(storeKey(id));
  } catch {}
}

/** Sections that depend on any of `keys`, directly or through others. */
function dependentsOf(secs: BuildSectionDef[], keys: string[]): Set<string> {
  const hit = new Set(keys);
  for (let changed = true; changed; ) {
    changed = false;
    for (const s of secs) {
      if (!hit.has(s.key) && s.depends.some((d) => hit.has(d))) {
        hit.add(s.key);
        changed = true;
      }
    }
  }
  keys.forEach((k) => hit.delete(k));
  return hit;
}

export function BuildOut({ entity, around, preselect }: { entity: BuildFocus; around: { id: string; name: string; type: string; how: string }[]; preselect: string[] | null }) {
  const w = useWorld();
  const router = useRouter();
  const plan = planFor(entity.type);
  const typeLabel = getEntityType(entity.type).label.toLowerCase();
  const initial = React.useCallback((): BuildState => ({ phase: "setup", chosen: preselect ?? plan.sections.map((s) => s.key), depth: "deep", direction: "", reveal: false, sections: {}, refreshQueue: [], provider: "offline" }), [plan, preselect]);
  const [s, setS] = React.useState<BuildState>(initial);
  const [loaded, setLoaded] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [restart, setRestart] = React.useState(false);
  const [showAround, setShowAround] = React.useState(false);

  // Restore a saved draft once. Effects can run again without a remount (React keeps state while a
  // page is hidden and re-shown), and restoring again would wipe out sections that are being written.
  const restored = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (restored.current === entity.id) return;
    restored.current = entity.id;
    const saved = load(entity.id);
    if (saved) setS(saved.phase === "setup" && preselect ? { ...saved, chosen: preselect } : saved);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);
  React.useEffect(() => {
    if (loaded) save(entity.id, s);
  }, [s, loaded, entity.id]);

  const patch = (p: Partial<BuildState>) => setS((x) => ({ ...x, ...p }));
  const setSection = (key: string, p: Partial<SectionState>) => setS((x) => ({ ...x, sections: { ...x.sections, [key]: { ...(x.sections[key] ?? IDLE), ...p } } }));
  const secs = React.useMemo(() => sectionsIn(plan, s.chosen), [plan, s.chosen]);
  const st = React.useCallback((k: string) => s.sections[k] ?? IDLE, [s.sections]);
  const drafting = secs.some((x) => st(x.key).status === "drafting");

  // --- Writing -------------------------------------------------------------------
  const stateRef = React.useRef(s);
  stateRef.current = s;
  const inFlight = React.useRef(new Set<string>());

  const write = React.useCallback(
    async (keys: string[], mode: "new" | "redo" | "steer" | "refresh", note?: string) => {
      // Start from a fresh task. Called from an effect right after the page loads, React would treat
      // the "writing…" update as part of a transition and hold it until the server action finishes.
      await new Promise((r) => setTimeout(r, 0));
      const x = stateRef.current;
      keys = keys.filter((k) => !inFlight.current.has(k));
      if (!keys.length) return;
      keys.forEach((k) => inFlight.current.add(k));
      const notesFor = (k: string) => (note ? [...(x.sections[k]?.notes ?? []), note] : (x.sections[k]?.notes ?? []));
      setS((cur) => {
        const sections = { ...cur.sections };
        for (const k of keys) sections[k] = { ...(sections[k] ?? IDLE), status: "drafting", error: undefined, kept: false, notes: notesFor(k) };
        return { ...cur, refreshQueue: cur.refreshQueue.filter((k) => !keys.includes(k)), sections };
      });
      // Each section is written from the ones before it in the plan.
      const writtenFor = (key: string) => {
        const idx = plan.sections.findIndex((p) => p.key === key);
        const out: Record<string, BuildSectionData> = {};
        for (const p of plan.sections.slice(0, idx)) if (x.chosen.includes(p.key) && x.sections[p.key]?.data) out[p.key] = x.sections[p.key]!.data!;
        return out;
      };
      const res = await draftBuildSectionsAction(
        w.worldId,
        entity.id,
        keys.map((key) => ({ key, chosen: x.chosen, depth: x.depth, direction: x.direction.trim() || undefined, written: writtenFor(key), previous: mode === "new" ? undefined : x.sections[key]?.data, notes: notesFor(key), mode })),
      );
      keys.forEach((k) => inFlight.current.delete(k));
      const results = res.ok ? res.data : keys.map((key) => ({ key, ok: false as const, error: res.error }));
      setS((cur) => {
        if (cur.phase !== "draft") return cur; // the DM started over
        const sections = { ...cur.sections };
        let provider = cur.provider;
        for (const r of results) {
          const prev = sections[r.key] ?? IDLE;
          if (r.ok) {
            sections[r.key] = { ...prev, data: r.data, status: "ready", error: undefined };
            provider = r.provider;
          } else sections[r.key] = { ...prev, status: prev.data ? "ready" : "error", error: r.error };
        }
        // Sections written from what just changed are now out of date.
        const changed = results.filter((r) => r.ok).map((r) => r.key);
        if (mode !== "new" && changed.length) {
          for (const d of dependentsOf(sectionsIn(plan, cur.chosen), changed)) {
            const ds = sections[d];
            if (ds?.data && ds.status === "ready") sections[d] = { ...ds, status: "stale", kept: false };
          }
        }
        return { ...cur, sections, provider };
      });
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) toast.error(failed.error);
    },
    [plan, w.worldId, entity.id],
  );

  // Write each section as soon as what it's written from is ready (independent ones together).
  // Anything out of date that a new section would be built on is brought up to date first.
  React.useEffect(() => {
    if (!loaded || s.phase !== "draft") return;
    const settled = (k: string) => !!st(k).data && st(k).status !== "drafting" && st(k).status !== "stale";
    const missing = secs.filter((x) => !st(x.key).data && st(x.key).status !== "drafting" && st(x.key).status !== "error" && !inFlight.current.has(x.key));
    const blockers = new Set<string>();
    const visit = (k: string) => {
      const def = secs.find((x) => x.key === k);
      for (const d of def?.depends ?? []) {
        if (st(d).status === "stale") {
          const deeper = secs.find((x) => x.key === d)?.depends.some((dd) => st(dd).status === "stale");
          if (deeper) visit(d);
          else blockers.add(d);
        } else visit(d);
      }
    };
    missing.forEach((x) => visit(x.key));
    if (blockers.size) void write([...blockers], "refresh");
    const ready = missing.filter((x) => x.depends.every(settled)).map((x) => x.key);
    if (ready.length) void write(ready, "new");
    const queued = secs.filter((x) => s.refreshQueue.includes(x.key) && st(x.key).status === "stale" && x.depends.every((d) => st(d).status !== "stale" && st(d).status !== "drafting")).map((x) => x.key);
    if (queued.length) void write(queued, "refresh");
    else if (s.refreshQueue.length && !secs.some((x) => s.refreshQueue.includes(x.key) && st(x.key).status === "stale")) patch({ refreshQueue: [] });
  }, [loaded, s.phase, s.sections, s.refreshQueue, secs, st, write]);

  const allWritten = secs.length > 0 && secs.every((x) => st(x.key).data);
  const stale = secs.filter((x) => st(x.key).status === "stale");
  const writtenCount = secs.filter((x) => st(x.key).data).length;
  const totals = secs.reduce((t, x) => {
    const d = st(x.key).data;
    return d ? { entries: t.entries + d.entries.length, rumours: t.rumours + d.rumours.length, hooks: t.hooks + d.hooks.length } : t;
  }, { entries: 0, rumours: 0, hooks: 0 });

  async function add() {
    setAdding(true);
    const sections = Object.fromEntries(secs.filter((x) => st(x.key).data).map((x) => [x.key, st(x.key).data!]));
    const res = await applyBuildOutAction(w.worldId, entity.id, { sections, reveal: s.reveal, provider: s.provider });
    setAdding(false);
    if (!res.ok) return toast.error(res.error);
    if (res.data.failed.length) toast.warning(`${res.data.failed.length} changes couldn't be added`, { description: res.data.failed[0]!.error });
    clear(entity.id);
    toast.success(res.data.created ? `Added ${res.data.created} new ${res.data.created === 1 ? "entry" : "entries"} around ${entity.name}` : `${entity.name} is updated`);
    router.push(`/w/${w.worldId}/e/${entity.id}`);
    router.refresh();
  }

  if (!loaded) return <div className="h-96" aria-busy />;

  const back = (
    <Link href={`/w/${w.worldId}/e/${entity.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="size-4" /> {entity.name}
    </Link>
  );

  // --- Setup -----------------------------------------------------------------------
  if (s.phase === "setup") {
    const toggle = (k: string) => patch({ chosen: s.chosen.includes(k) ? s.chosen.filter((x) => x !== k) : plan.sections.map((p) => p.key).filter((p) => p === k || s.chosen.includes(p)) });
    return (
      <div className="flex flex-col gap-7">
        <header>
          {back}
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-[-0.01em]">Build out {entity.name}</h1>
          <p className="mt-2 max-w-[65ch] text-md text-muted">Claude writes the parts you choose, building on everything your world already says about this {typeLabel}. You keep, redo or steer each part, then add it all at once.</p>
        </header>

        {!w.aiProvider.live && (
          <div role="note" className="rounded-lg border border-ember/40 bg-ember-soft/40 px-4 py-3 text-sm">
            <p className="font-medium text-fg">Claude isn&apos;t connected, so this uses the built-in engine.</p>
            <p className="mt-1 text-muted">It fills in stock names and details that ignore your direction. Add your Anthropic key to .env.local and restart Worldloom for the real thing.</p>
          </div>
        )}

        <section aria-labelledby="bo-parts" className="flex flex-col gap-3">
          <h2 id="bo-parts" className="text-sm font-medium text-muted">
            What should Claude build?
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {plan.sections.map((p) => {
              const on = s.chosen.includes(p.key);
              return (
                <li key={p.key}>
                  <label className={cn("flex h-full cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors", on ? "border-arcane/60 bg-arcane-soft/30" : "border-line hover:border-line-strong")}>
                    <Checkbox checked={on} onCheckedChange={() => toggle(p.key)} className="mt-0.5" aria-label={p.key === "about" ? `${p.title}: ${p.blurb}` : p.title} />
                    <span className="min-w-0">
                      <span className="block font-medium">{p.key === "about" ? `More about ${entity.name}` : p.title}</span>
                      <span className="block text-sm text-muted">{p.blurb}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
          <section aria-labelledby="bo-depth" className="flex flex-col gap-2">
            <h2 id="bo-depth" className="text-sm font-medium text-muted">
              How much
            </h2>
            <Segmented
              label="How much"
              value={s.depth}
              onChange={(depth) => patch({ depth })}
              options={[
                { value: "essentials", label: "Essentials" },
                { value: "deep", label: "Go deep" },
              ]}
            />
          </section>
          <section className="flex flex-col gap-2">
            <label htmlFor="bo-direction" className="text-sm font-medium text-muted">
              Any direction? (optional)
            </label>
            <Textarea id="bo-direction" value={s.direction} onChange={(e) => patch({ direction: e.target.value })} className="min-h-16" placeholder={DIRECTION_HINT[plan.key] ?? "Anything you want Claude to lean into"} />
          </section>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={s.reveal} onCheckedChange={(v) => patch({ reveal: !!v })} className="mt-0.5" />
          <span>
            <span className="font-medium">Let players see the new entries</span>
            <span className="block text-muted">Off: they stay hidden from the player view until you reveal them, so nothing gets spoiled.</span>
          </span>
        </label>

        <div className="flex flex-col gap-3 border-t border-line pt-5">
          {around.length > 0 && (
            <p className="text-sm text-muted">
              Claude builds around the {around.length} {around.length === 1 ? "entry" : "entries"} already in or tied to {entity.name} and won&apos;t duplicate them.{" "}
              <button type="button" className="underline-offset-4 hover:text-fg hover:underline" onClick={() => setShowAround((v) => !v)} aria-expanded={showAround}>
                {showAround ? "Hide" : "Show them"}
              </button>
            </p>
          )}
          {showAround && (
            <ul className="flex flex-wrap gap-1.5">
              {around.map((a) => (
                <li key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-sm" title={a.how}>
                  <TypeIcon type={a.type} /> {a.name}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Button variant="arcane" size="lg" disabled={!s.chosen.length} onClick={() => setS((x) => ({ ...x, phase: "draft", sections: {}, refreshQueue: [] }))}>
              <Wand2 /> Start building
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --- Draft -------------------------------------------------------------------------
  const left = plan.sections.filter((p) => !s.chosen.includes(p.key));
  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {back}
            <p className="truncate font-serif text-xl font-semibold">Building out {entity.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted sm:inline">
              {writtenCount} of {secs.length} written{s.provider === "offline" ? " · built-in engine" : ""}
            </span>
            <Button variant="primary" onClick={add} loading={adding} disabled={!allWritten || drafting}>
              <Check /> Add to world
            </Button>
          </div>
        </div>
      </div>

      {stale.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brass/40 bg-brass-soft/40 px-4 py-2.5 text-sm">
          <span>{stale.length === 1 ? `“${stale[0]!.title}” was` : `${stale.length} sections were`} written before your latest change.</span>
          <Button size="sm" variant="secondary" onClick={() => patch({ refreshQueue: stale.map((x) => x.key) })}>
            <RefreshCw /> Bring {stale.length === 1 ? "it" : "them"} up to date
          </Button>
        </div>
      )}

      {secs.map((sec, i) => {
        const ss = st(sec.key);
        const waiting = !ss.data && ss.status !== "drafting" && ss.status !== "error";
        return (
          <DraftSectionCard
            key={sec.key}
            index={i}
            title={sec.key === "about" ? `More about ${entity.name}` : sec.title}
            working={sec.working}
            state={{ status: ss.status, notes: ss.notes, kept: ss.kept, error: ss.error, hasData: !!ss.data }}
            summary={ss.data ? buildSectionSummary(ss.data) : ""}
            waiting={waiting}
            aiLive={w.aiProvider.live}
            nudges={sec.nudges}
            busy={ss.status === "drafting"}
            onKeep={() => setSection(sec.key, { kept: true })}
            onChangeMind={() => setSection(sec.key, { kept: false })}
            onRedo={() => write([sec.key], "redo")}
            onSteer={(note) => write([sec.key], "steer", note)}
            onRefresh={() => write([sec.key], "refresh")}
            onRetry={() => write([sec.key], ss.data ? "redo" : "new")}
          >
            {ss.data && (
              <BuildSectionView
                section={sec}
                data={ss.data}
                focus={entity}
                onChange={ss.status === "drafting" ? undefined : (d) => setSection(sec.key, { data: d })}
                onLeaveOut={secs.length > 1 && !secs.some((x) => x.depends.includes(sec.key)) ? () => patch({ chosen: s.chosen.filter((k) => k !== sec.key) }) : undefined}
              />
            )}
          </DraftSectionCard>
        );
      })}

      {left.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Add another part:</span>
          {left.map((p) => (
            <button key={p.key} type="button" onClick={() => patch({ chosen: plan.sections.map((x) => x.key).filter((k) => k === p.key || s.chosen.includes(k)) })} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-muted ring-1 ring-line hover:text-fg hover:ring-arcane/50">
              <Plus className="size-3.5" /> {p.key === "about" ? `More about ${entity.name}` : p.title}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setRestart(true)}>
            <RotateCcw /> Start over
          </Button>
          <Button variant="primary" size="lg" onClick={add} loading={adding} disabled={!allWritten || drafting}>
            <Check /> Add to world
          </Button>
        </div>
        <p className="text-right text-xs text-faint">
          {allWritten
            ? `Adds ${[totals.entries && `${totals.entries} new ${totals.entries === 1 ? "entry" : "entries"}`, totals.rumours && `${totals.rumours} rumours`, totals.hooks && `${totals.hooks} adventure hooks`].filter(Boolean).join(", ") || "the new details"} to ${entity.name}${totals.entries ? (s.reveal ? ", visible to players" : ", hidden from players for now") : ""}. You can edit any of it afterwards.`
            : "Claude is still writing. You can steer finished sections while you wait."}
        </p>
      </div>

      <ConfirmDialog
        open={restart}
        onOpenChange={setRestart}
        title="Start over?"
        description="This throws away what Claude has written here and takes you back to choosing what to build."
        confirmLabel="Start over"
        onConfirm={() => setS((x) => ({ ...x, phase: "setup", sections: {}, refreshQueue: [] }))}
      />
    </div>
  );
}

const DIRECTION_HINT: Record<string, string> = {
  settlement: "e.g. a canal town run by smugglers; keep it poor and superstitious",
  region: "e.g. haunted marshland with a few stubborn villages",
  nation: "e.g. a dying empire held together by its priests",
  faction: "e.g. idealists who've started cutting corners",
  religion: "e.g. a kindly faith with a brutal inquisition",
  deity: "e.g. a forgotten god trying to be remembered",
  person: "e.g. make them a reluctant hero with a messy family",
  site: "e.g. a flooded dwarven vault with something still awake",
  venue: "e.g. the best ale in town and the worst clientele",
  culture: "e.g. seafaring nomads who never sleep under a roof",
};
