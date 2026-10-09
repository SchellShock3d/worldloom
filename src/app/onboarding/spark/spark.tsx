"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, RefreshCw, SlidersHorizontal, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { AiWorking } from "@/components/ai/ai-working";
import { DraftSectionCard } from "@/components/ai/draft-section-card";
import { createWorldFromDraftAction, draftSectionsAction, pitchWorldsAction } from "@/server/actions/spark";
import { CALENDAR_PRESETS } from "@/lib/calendar";
import { NUDGES, SECTIONS, SECTION_DEPENDS, sectionSummary } from "@/lib/spark";
import type { SectionData, SectionKey, WorldPitch } from "@/lib/spark-schema";
import { cn } from "@/lib/utils";
import { DemoWorldButton } from "../../demo-world-button";
import { VibeDials } from "./dials";
import { SectionView } from "./section-views";
import { clearSpark, emptySections, initialSpark, loadSpark, saveSpark, writtenSections, type SparkState } from "./state";

const SEEDS = ["A city on the back of a sleeping titan", "Pirates and dead gods", "The sun is going out", "Elves won the war, and it went badly", "Gangsters in a city of mages", "A frontier at the edge of the world"];

export function Spark({ firstWorld, userName, aiLive }: { firstWorld: boolean; userName: string; aiLive: boolean }) {
  const router = useRouter();
  const [s, setS] = React.useState<SparkState>(initialSpark);
  const [loaded, setLoaded] = React.useState(false);
  const [pitching, setPitching] = React.useState<null | "fresh" | "blend" | string>(null);
  const [creating, setCreating] = React.useState(false);
  const [showDials, setShowDials] = React.useState(false);

  // Restore a saved draft once (effects can re-run without a remount; restoring again would wipe
  // out sections that are being written).
  const restored = React.useRef(false);
  React.useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = loadSpark();
    if (saved) setS(saved);
    setLoaded(true);
  }, []);
  React.useEffect(() => {
    if (loaded) saveSpark(s);
  }, [s, loaded]);

  const patch = (p: Partial<SparkState>) => setS((x) => ({ ...x, ...p }));
  const setSection = <K extends SectionKey>(key: K, p: Partial<SparkState["sections"][K]>) => setS((x) => ({ ...x, sections: { ...x.sections, [key]: { ...x.sections[key], ...p } } }));

  // --- Pitches ---------------------------------------------------------------
  async function pitch(kind: "fresh" | "blend" | { like: WorldPitch }) {
    const key = typeof kind === "string" ? kind : kind.like.name;
    setPitching(key);
    const blendWith = kind === "blend" ? s.pitches.filter((p) => s.blend.includes(p.name)) : undefined;
    const res = await pitchWorldsAction({ seed: s.seed, dials: s.dials, steer: s.steer || undefined, avoid: s.seen.slice(-20), blend: blendWith, like: typeof kind === "object" ? kind.like : undefined });
    setPitching(null);
    if (!res.ok) return toast.error(res.error);
    const pitches = kind === "blend" ? [...res.data.pitches, ...s.pitches.filter((p) => !s.blend.includes(p.name))] : res.data.pitches;
    setS((x) => ({ ...x, phase: "pitches", pitches, blend: [], provider: res.data.provider, seen: [...x.seen, ...res.data.pitches.map((p) => p.name)] }));
    window.scrollTo({ top: 0 });
  }

  function choose(p: WorldPitch) {
    setS((x) => ({ ...x, phase: "draft", pitch: p, sections: emptySections(), refreshQueue: [] }));
    window.scrollTo({ top: 0 });
  }

  // --- Drafting ------------------------------------------------------------------
  const drafting = SECTIONS.some((sec) => s.sections[sec.key].status === "drafting");

  // The latest state, for async work that outlives a render.
  const stateRef = React.useRef(s);
  stateRef.current = s;
  const inFlight = React.useRef(new Set<SectionKey>());

  const write = React.useCallback(async (keys: SectionKey[], mode: "new" | "redo" | "steer" | "refresh", note?: string) => {
    // Start from a fresh task (see Build out): after a page load React would otherwise hold the
    // "writing…" update until the server action finishes.
    await new Promise((r) => setTimeout(r, 0));
    const x = stateRef.current;
    keys = keys.filter((k) => !inFlight.current.has(k));
    if (!x.pitch || !keys.length) return;
    keys.forEach((k) => inFlight.current.add(k));
    const notesFor = (k: SectionKey) => (note ? [...x.sections[k].notes, note] : x.sections[k].notes);
    setS((cur) => {
      const sections = { ...cur.sections };
      for (const k of keys) sections[k] = { ...sections[k], status: "drafting", error: undefined, kept: false, notes: notesFor(k) } as never;
      return { ...cur, refreshQueue: cur.refreshQueue.filter((k) => !keys.includes(k)), sections };
    });
    const res = await draftSectionsAction(keys.map((key) => ({ key, pitch: x.pitch!, dials: x.dials, sections: writtenSections(x, key), previous: mode === "new" ? undefined : (x.sections[key].data as never), notes: notesFor(key), mode })));
    keys.forEach((k) => inFlight.current.delete(k));
    const results = res.ok ? res.data : keys.map((key) => ({ key, ok: false as const, error: res.error }));
    setS((cur) => {
      if (!cur.pitch || cur.pitch.name !== x.pitch!.name) return cur; // the DM moved on to another world
      let next = { ...cur, sections: { ...cur.sections } };
      for (const r of results) {
        const prev = next.sections[r.key];
        if (r.ok) next = { ...next, provider: r.provider, sections: { ...next.sections, [r.key]: { ...prev, data: r.data, status: "ready", error: undefined } } };
        else next.sections = { ...next.sections, [r.key]: { ...prev, status: prev.data ? "ready" : "error", error: r.error } };
      }
      // Later sections were written against the old version of what changed.
      if (mode !== "new" && results.some((r) => r.ok)) {
        const idx = Math.min(...keys.map((k) => SECTIONS.findIndex((sec) => sec.key === k)));
        for (const later of SECTIONS.slice(idx + 1)) {
          const ls = next.sections[later.key];
          if (ls.data && ls.status === "ready" && !keys.includes(later.key)) next.sections = { ...next.sections, [later.key]: { ...ls, status: "stale" } };
        }
      }
      return next;
    });
    const failed = results.find((r) => !r.ok);
    if (failed && !failed.ok) toast.error(failed.error);
  }, []);

  // Write missing sections as soon as what they depend on exists (independent ones together),
  // then any queued refreshes, one batch at a time.
  React.useEffect(() => {
    if (!loaded || s.phase !== "draft" || !s.pitch || drafting) return;
    const missing = SECTIONS.filter((sec) => !s.sections[sec.key].data);
    if (missing.some((sec) => s.sections[sec.key].status === "error")) return; // wait for the DM to retry
    const ready = missing.filter((sec) => SECTION_DEPENDS[sec.key].every((d) => s.sections[d].data)).map((sec) => sec.key);
    // Something about to be written depends on a section that's out of date: update that first,
    // starting from the earliest one, so new sections are built on the DM's latest choices.
    const staleBelow = (keys: SectionKey[]): SectionKey[] => {
      const out = new Set<SectionKey>();
      const visit = (k: SectionKey) => {
        for (const d of SECTION_DEPENDS[k]) {
          if (s.sections[d].status === "stale") {
            const deeper = SECTION_DEPENDS[d].some((dd) => s.sections[dd].status === "stale");
            if (deeper) visit(d);
            else out.add(d);
          } else visit(d);
        }
      };
      keys.forEach(visit);
      return [...out];
    };
    const blockers = staleBelow(ready);
    if (blockers.length) {
      void write(blockers, "refresh");
      return;
    }
    if (ready.length) {
      void write(ready, "new");
      return;
    }
    const next = SECTIONS.find((sec) => s.refreshQueue.includes(sec.key) && s.sections[sec.key].status === "stale");
    if (next) void write([next.key], "refresh");
    else if (s.refreshQueue.length) patch({ refreshQueue: [] });
  }, [loaded, s.phase, s.pitch, s.sections, s.refreshQueue, drafting, write]);

  const ready = SECTIONS.every((sec) => s.sections[sec.key].data);
  const stale = SECTIONS.filter((sec) => s.sections[sec.key].status === "stale");
  const written = SECTIONS.filter((sec) => s.sections[sec.key].data).length;
  const worldName = s.sections.overview.data?.name ?? s.pitch?.name ?? "";

  const refreshStale = () => patch({ refreshQueue: stale.map((sec) => sec.key) });

  async function create() {
    if (!s.pitch || !ready) return;
    setCreating(true);
    const sections = Object.fromEntries(SECTIONS.map((sec) => [sec.key, s.sections[sec.key].data])) as Required<{ [K in SectionKey]: SectionData[K] }>;
    const res = await createWorldFromDraftAction({ seed: s.seed, dials: s.dials, pitch: s.pitch, sections, calendarPreset: s.calendarPreset, provider: s.provider });
    setCreating(false);
    if (!res.ok) return toast.error(res.error);
    if (res.data.failed.length) toast.warning(`${res.data.failed.length} entries couldn't be added`, { description: res.data.failed[0]!.error });
    clearSpark();
    toast.success(`${worldName} is ready`);
    router.push(`/w/${res.data.worldId}/campaigns/new?onboarding=1`);
  }

  if (!loaded) return <div className="h-96" aria-busy />;

  // --- Seed ------------------------------------------------------------------------
  if (s.phase === "seed") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header>
          <h1 className="font-serif text-4xl font-semibold tracking-[-0.01em]">{firstWorld ? `Welcome, ${userName.split(" ")[0]}. What should we make?` : "What should we make?"}</h1>
          <p className="mt-2 text-md text-muted">Give Claude a spark: a phrase, a mood, a mash-up, or nothing at all. You&apos;ll get three worlds to choose from, then watch the one you pick get written. You steer; Claude does the writing.</p>
        </header>
        {!aiLive && (
          <div role="note" className="rounded-lg border border-ember/40 bg-ember-soft/40 px-4 py-3 text-sm">
            <p className="font-medium text-fg">Claude isn&apos;t connected, so this is the built-in engine.</p>
            <p className="mt-1 text-muted">It only knows a handful of world templates and can&apos;t really use your spark or the dials, so you&apos;ll keep seeing the same few worlds. To connect Claude, put your Anthropic API key in a file called <code className="rounded bg-surface-3 px-1">.env.local</code> in the worldloom folder, as <code className="rounded bg-surface-3 px-1">ANTHROPIC_API_KEY=your-key</code>, then stop Worldloom (Ctrl+C) and run <code className="rounded bg-surface-3 px-1">npm start</code> again. Run <code className="rounded bg-surface-3 px-1">npm run check-ai</code> to test the key.</p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="spark-seed" className="text-sm font-medium text-muted">
            Your spark
          </label>
          <Textarea id="spark-seed" value={s.seed} onChange={(e) => patch({ seed: e.target.value })} className="min-h-20 text-lg" placeholder="Pirates and dead gods… a city on a sleeping titan… or leave it blank to be surprised" autoFocus />
          <div className="flex flex-wrap gap-1.5">
            {SEEDS.map((x) => (
              <button key={x} type="button" onClick={() => patch({ seed: x })} className="rounded-full px-2.5 py-0.5 text-sm text-muted ring-1 ring-line hover:text-fg hover:ring-line-strong">
                {x}
              </button>
            ))}
          </div>
        </div>
        <section aria-label="Vibe" className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">The vibe</h2>
          <VibeDials value={s.dials} onChange={(dials) => patch({ dials })} />
        </section>
        <div className="flex flex-col gap-3 border-t border-line pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {firstWorld && <DemoWorldButton variant="ghost" label="Explore a demo world" />}
              <Link href="/onboarding/custom" className="text-muted underline-offset-4 hover:text-fg hover:underline">
                I&apos;d rather fill it in myself
              </Link>
            </div>
            <Button variant="arcane" size="lg" onClick={() => pitch("fresh")} loading={pitching === "fresh"}>
              <Sparkles /> Pitch me three worlds
            </Button>
          </div>
          <AiWorking active={pitching === "fresh"} live={aiLive} what="Claude is pitching worlds" typical="10–20 seconds" />
        </div>
      </div>
    );
  }

  // --- Pitches -------------------------------------------------------------------------
  if (s.phase === "pitches") {
    const blendCount = s.blend.length;
    return (
      <div className="flex flex-col gap-6 pb-20">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <button type="button" onClick={() => patch({ phase: "seed" })} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
              <ArrowLeft className="size-4" /> {s.seed ? `“${s.seed}”` : "Change the spark"}
            </button>
            <h1 className="font-serif text-4xl font-semibold tracking-[-0.01em]">Pick a world</h1>
            <p className="mt-1 text-md text-muted">Build one, ask for variations, or tick two and blend them.</p>
            {aiLive && s.provider === "offline" && <p className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">Claude couldn&apos;t be reached just now, so these come from the built-in engine. Ask for new pitches to try Claude again.</p>}
            {!aiLive && <p className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">Built-in engine: Claude isn&apos;t connected, so these are stock templates. Connect your API key for worlds written from your spark.</p>}
          </div>
        </header>

        <ul className="grid gap-4 lg:grid-cols-3">
          {s.pitches.map((p) => {
            const ticked = s.blend.includes(p.name);
            return (
              <li key={p.name} className={cn("flex flex-col rounded-xl border bg-surface p-5", ticked ? "border-arcane" : "border-line")}>
                <h2 className="font-serif text-2xl font-semibold leading-tight">{p.name}</h2>
                <p className="mt-1.5 font-medium">{p.logline}</p>
                <div className="mt-3 flex flex-col gap-2 text-sm text-muted">
                  {p.pitch.split(/\n\s*\n/).map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[p.genre, `${p.magicLevel} magic`, p.techLevel].map((t) => (
                    <Badge key={t} tone="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
                <dl className="mt-3 flex flex-col gap-1.5 text-sm">
                  <div>
                    <dt className="inline text-faint">At stake: </dt>
                    <dd className="inline">{p.conflict}</dd>
                  </div>
                  <div>
                    <dt className="inline text-faint">What sets it apart: </dt>
                    <dd className="inline">{p.hook}</dd>
                  </div>
                  <div>
                    <dt className="inline text-faint">Who lives here: </dt>
                    <dd className="inline">{p.peoples}</dd>
                  </div>
                </dl>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                  <Button variant="primary" onClick={() => choose(p)} disabled={!!pitching}>
                    <Wand2 /> Build this world
                  </Button>
                  <Button variant="ghost" onClick={() => pitch({ like: p })} loading={pitching === p.name} disabled={!!pitching && pitching !== p.name}>
                    More like this
                  </Button>
                  <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted">
                    <input type="checkbox" checked={ticked} onChange={() => patch({ blend: ticked ? s.blend.filter((n) => n !== p.name) : [...s.blend, p.name].slice(-3) })} className="size-4 accent-[var(--arcane)]" />
                    Blend
                  </label>
                </div>
              </li>
            );
          })}
        </ul>

        <section aria-label="Steer the next pitches" className="flex flex-col gap-4 rounded-xl border border-line p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="spark-steer" className="text-sm font-medium text-muted">
                None of these? Steer the next three
              </label>
              <Input id="spark-steer" value={s.steer} onChange={(e) => patch({ steer: e.target.value })} placeholder="More nautical, less grim, smaller scale…" className="mt-1.5" onKeyDown={(e) => e.key === "Enter" && pitch("fresh")} />
            </div>
            <Button variant="secondary" onClick={() => pitch("fresh")} loading={pitching === "fresh"} disabled={!!pitching && pitching !== "fresh"}>
              <RefreshCw /> Three new pitches
            </Button>
          </div>
          <button type="button" onClick={() => setShowDials((v) => !v)} className="inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-fg" aria-expanded={showDials}>
            <SlidersHorizontal className="size-4" /> {showDials ? "Hide the vibe dials" : "Adjust the vibe"}
          </button>
          {showDials && <VibeDials value={s.dials} onChange={(dials) => patch({ dials })} compact />}
        </section>
        <AiWorking active={!!pitching} live={aiLive} what={pitching === "blend" ? "Claude is blending your picks" : "Claude is pitching worlds"} typical="10–20 seconds" />

        {blendCount >= 2 && (
          <div className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-arcane/40 bg-surface px-4 py-2 shadow-pop">
            <span className="text-sm">{blendCount} pitches ticked</span>
            <Button variant="arcane" size="sm" onClick={() => pitch("blend")} loading={pitching === "blend"}>
              <Sparkles /> Blend them
            </Button>
          </div>
        )}
      </div>
    );
  }

  // --- Draft ---------------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <button type="button" onClick={() => patch({ phase: "pitches" })} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
              <ArrowLeft className="size-3.5" /> Back to the pitches
            </button>
            <p className="truncate font-serif text-xl font-semibold">{worldName}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted sm:inline">
              {written} of {SECTIONS.length} written{s.provider === "offline" ? " · built-in engine" : ""}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setShowDials((v) => !v)} aria-expanded={showDials}>
              <SlidersHorizontal /> Vibe
            </Button>
            <Button variant="primary" onClick={create} loading={creating} disabled={!ready || drafting}>
              <Check /> Create this world
            </Button>
          </div>
        </div>
        {showDials && (
          <div className="mx-auto mt-3 max-w-4xl">
            <VibeDials value={s.dials} onChange={(dials) => patch({ dials })} compact />
            <p className="mt-2 text-xs text-faint">Applies to whatever Claude writes next. Redo a section to apply it there.</p>
          </div>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        {stale.length > 0 && !drafting && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brass/40 bg-brass-soft/40 px-4 py-2.5 text-sm">
            <span>
              {stale.length === 1 ? `“${stale[0]!.title}” was` : `${stale.length} sections were`} written before your latest change.
            </span>
            <Button size="sm" variant="secondary" onClick={refreshStale}>
              <RefreshCw /> Bring {stale.length === 1 ? "it" : "them"} up to date
            </Button>
          </div>
        )}

        {SECTIONS.map((sec, i) => {
          const st = s.sections[sec.key];
          const waiting = !st.data && st.status !== "drafting" && st.status !== "error";
          return (
            <DraftSectionCard
              key={sec.key}
              index={i}
              title={sec.title}
              working={sec.working}
              state={{ status: st.status, notes: st.notes, kept: st.kept, error: st.error, hasData: !!st.data }}
              summary={st.data ? sectionSummary(sec.key, st.data as never) : ""}
              waiting={waiting}
              aiLive={aiLive}
              nudges={NUDGES[sec.key]}
              busy={st.status === "drafting"}
              onKeep={() => setSection(sec.key, { kept: true })}
              onChangeMind={() => setSection(sec.key, { kept: false })}
              onRedo={() => write([sec.key], "redo")}
              onSteer={(note) => write([sec.key], "steer", note)}
              onRefresh={() => write([sec.key], "refresh")}
              onRetry={() => write([sec.key], st.data ? "redo" : "new")}
            >
              {st.data && <SectionView k={sec.key} data={st.data as never} onChange={st.status === "drafting" ? undefined : (d) => setSection(sec.key, { data: d as never })} />}
            </DraftSectionCard>
          );
        })}

        <div className="flex flex-col gap-3 border-t border-line pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              Calendar
              <NativeSelect value={s.calendarPreset} onChange={(e) => patch({ calendarPreset: e.target.value })} className="h-8 w-48 text-sm">
                {Object.entries(CALENDAR_PRESETS).map(([k, p]) => (
                  <option key={k} value={k}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button variant="primary" size="lg" onClick={create} loading={creating} disabled={!ready || drafting}>
              <Check /> Create this world
            </Button>
          </div>
          <p className="text-xs text-faint">{ready ? "Everything above becomes part of your world: places, peoples, powers, history, and a starting town with NPCs. You can edit any of it afterwards." : "Claude is still writing. You can steer finished sections while you wait."}</p>
        </div>
      </div>
    </div>
  );
}
