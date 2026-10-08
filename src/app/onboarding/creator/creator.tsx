"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Pencil, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/primitives";
import { AiWorking } from "@/components/ai/ai-working";
import { createWorldFromCreatorAction } from "@/server/actions/creator";
import type { CreatorDraft } from "@/server/ai/tasks/creator";
import { CALENDAR_PRESETS } from "@/lib/calendar";
import { suggestHomebrew } from "@/lib/peoples";
import { CLIMATES, GENRES, GOVERNMENTS, HISTORY_HOOKS, MAGIC_ATTITUDES, MAGIC_LEVELS, MAGIC_SOURCES, RELIGION_STYLES, TECH_LEVELS, TONES, WORLD_SHAPES, type WorldProfile } from "@/lib/world-profile";
import { cn } from "@/lib/utils";
import { DemoWorldButton } from "../../demo-world-button";
import { ChipGroup, Stepper, SuggestField } from "./controls";
import { PeoplesStep } from "./peoples-step";
import { STEPS, clearDraft, defaultPeoples, initialState, loadDraft, saveDraft, traitsOf, type CreatorState } from "./state";

export function WorldCreator({ firstWorld, userName, aiLive }: { firstWorld: boolean; userName: string; aiLive: boolean }) {
  const router = useRouter();
  const [s, setS] = React.useState<CreatorState>(initialState);
  const [restored, setRestored] = React.useState(false);
  const [creating, setCreating] = React.useState<null | "blank" | "foundation" | "world">(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  // Restore a draft after mount (localStorage isn't available during server rendering).
  React.useEffect(() => {
    const d = loadDraft();
    if (d && (d.name || d.description || d.step > 0)) {
      setS(d);
      setRestored(true);
    }
  }, []);
  React.useEffect(() => {
    saveDraft(s);
  }, [s]);
  // On phones the step list is a horizontal strip; keep the current step in view.
  const navRef = React.useRef<HTMLOListElement>(null);
  React.useEffect(() => {
    navRef.current?.querySelector<HTMLElement>('[aria-current="step"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [s.step]);

  const update = React.useCallback((patch: Partial<CreatorState>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      // Until the DM picks races and classes by hand, keep them in step with genre, magic and tech.
      const shaping = ["genre", "tone", "magicLevel", "techLevel"].some((k) => k in patch);
      if (shaping && !next.peoplesTouched) Object.assign(next, defaultPeoples(next));
      return next;
    });
  }, []);
  const setProfile = (patch: Partial<WorldProfile>) => setS((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));

  const draft = (): CreatorDraft => ({
    name: s.name,
    genre: s.genre,
    tone: s.tone,
    magicLevel: s.magicLevel,
    techLevel: s.techLevel,
    description: s.description,
    profile: s.profile,
    races: Object.entries(s.races).filter(([, p]) => p !== "Absent").map(([n, p]) => `${n} (${p.toLowerCase()})`).concat(s.homebrew.filter((h) => h.kind === "race").map((h) => `${h.name} (${h.prevalence.toLowerCase()}, homebrew)`)),
    classes: Object.entries(s.classes).filter(([, p]) => p !== "Absent").map(([n, p]) => `${n} (${p.toLowerCase()})`).concat(s.homebrew.filter((h) => h.kind === "class").map((h) => `${h.name} (${h.prevalence.toLowerCase()}, homebrew)`)),
  });

  const go = (step: number) => {
    if (step > 0 && !s.name.trim()) {
      toast.error("Give your world a name first.");
      return;
    }
    setS((prev) => ({ ...prev, step }));
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      headingRef.current?.focus();
    });
  };

  async function create(kind: "blank" | "foundation" | "world") {
    if (!s.name.trim()) return toast.error("Give your world a name first.");
    setCreating(kind);
    const res = await createWorldFromCreatorAction({
      world: { name: s.name.trim(), genre: s.genre, tone: s.tone, magicLevel: s.magicLevel, techLevel: s.techLevel, description: s.description, calendarPreset: s.calendarPreset, startYear: s.startYear ? Number(s.startYear) : undefined, profile: s.profile },
      races: s.races,
      classes: s.classes,
      homebrew: s.homebrew,
      foundation: kind === "foundation",
    });
    setCreating(null);
    if (!res.ok) return toast.error(res.error);
    clearDraft();
    if (res.data.batchId) router.push(`/w/${res.data.worldId}/proposals/${res.data.batchId}?onboarding=1`);
    else router.push(`/w/${res.data.worldId}/campaigns/new?onboarding=1`);
  }

  const step = STEPS[s.step]!;
  const hints = suggestHomebrew(traitsOf(s), [], { race: 2, class: 2 }).filter((h) => !/^(Wildkin|Runesmith)$/.test(h.name));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
      {/* Step list */}
      <nav aria-label="Steps" className="min-w-0 lg:sticky lg:top-8 lg:self-start">
        <ol ref={navRef} className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible">
          {STEPS.map((st, i) => (
            <li key={st.key} className="shrink-0">
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === s.step ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  i === s.step ? "bg-surface-2 font-semibold text-fg" : i < s.step ? "text-fg hover:bg-surface-2" : "text-faint hover:text-muted",
                )}
              >
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular", i < s.step ? "border-accent bg-accent text-accent-fg" : i === s.step ? "border-accent text-accent" : "border-line")}>{i + 1}</span>
                <span className="whitespace-nowrap">{st.title}</span>
              </button>
            </li>
          ))}
        </ol>
        {restored && s.step < STEPS.length && (
          <p className="mt-4 hidden text-xs text-faint lg:block">
            Picked up where you left off.{" "}
            <button
              type="button"
              className="underline hover:text-fg"
              onClick={() => {
                clearDraft();
                setS(initialState());
                setRestored(false);
              }}
            >
              Start over
            </button>
          </p>
        )}
      </nav>

      <div className="flex min-w-0 flex-col gap-6">
        <header>
          <p className="text-sm text-faint">
            Step {s.step + 1} of {STEPS.length}
          </p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-1 font-serif text-4xl font-semibold tracking-[-0.01em] outline-none">
            {s.step === 0 && firstWorld ? `Welcome, ${userName.split(" ")[0]}. Let's build a world.` : s.step === 0 ? "A new world" : step.title}
          </h1>
          <p className="mt-2 text-md text-muted">{STEP_INTRO[step.key]}</p>
        </header>

        {step.key === "idea" && (
          <div className="flex flex-col gap-5">
            <Field label="World name" htmlFor="ob-name">
              <Input id="ob-name" value={s.name} onChange={(e) => update({ name: e.target.value })} placeholder="The Shattered Crown" className="h-10 text-md" autoFocus />
            </Field>
            <Field label="Genre">
              <ChipGroup label="Genre" options={GENRES} value={s.genre} onChange={(v) => update({ genre: v as string })} />
            </Field>
            <SuggestField id="ob-tone" label="Tone" field="tone" draft={draft} value={s.tone} onChange={(v) => update({ tone: v })}>
              <Input id="ob-tone" value={s.tone} onChange={(e) => update({ tone: e.target.value })} placeholder="Political intrigue with creeping dread" />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {TONES.map((t) => (
                  <button key={t} type="button" onClick={() => update({ tone: s.tone.trim() ? `${s.tone.trim()}, ${t.toLowerCase()}` : t })} className="rounded-full px-2 py-0.5 text-xs text-muted ring-1 ring-line hover:text-fg">
                    + {t}
                  </button>
                ))}
              </div>
            </SuggestField>
            <SuggestField id="ob-desc" label="The pitch" hint="A paragraph is plenty. Claude reads this before generating anything." field="description" draft={draft} value={s.description} onChange={(v) => update({ description: v })}>
              <Textarea id="ob-desc" value={s.description} onChange={(e) => update({ description: e.target.value })} className="min-h-24" placeholder="What makes this world itself? What's going wrong in it?" />
            </SuggestField>
            <SuggestField id="ob-insp" label="Inspirations" field="inspirations" mode="append" draft={draft} value={s.profile.inspirations ?? ""} onChange={(v) => setProfile({ inspirations: v })}>
              <Input id="ob-insp" value={s.profile.inspirations ?? ""} onChange={(e) => setProfile({ inspirations: e.target.value })} placeholder="Byzantium, plague years, folk horror" />
            </SuggestField>
          </div>
        )}

        {step.key === "magic" && (
          <div className="flex flex-col gap-6">
            <Field label="How much magic?">
              <ChipGroup label="Magic level" options={MAGIC_LEVELS} value={s.magicLevel} onChange={(v) => update({ magicLevel: v as string })} />
            </Field>
            <Field label="Where magic comes from" hint="Pick any that apply.">
              <ChipGroup label="Magic sources" multiple options={MAGIC_SOURCES} value={s.profile.magicSources ?? []} onChange={(v) => setProfile({ magicSources: v as string[] })} />
            </Field>
            <Field label="How people feel about magic">
              <ChipGroup label="Attitude to magic" options={MAGIC_ATTITUDES} value={s.profile.magicAttitude} onChange={(v) => setProfile({ magicAttitude: v as string })} />
            </Field>
            <Field label="Technology">
              <ChipGroup label="Technology level" options={TECH_LEVELS} value={s.techLevel} onChange={(v) => update({ techLevel: v as string })} />
            </Field>
            {hints.length > 0 && (
              <aside className="rounded-lg border border-arcane/30 bg-arcane-soft/40 px-4 py-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium">
                  <Wand2 className="size-4 text-arcane" /> In a world like this
                </p>
                <ul className="mt-1.5 flex flex-col gap-1 text-muted">
                  {hints.map((h) => (
                    <li key={h.name}>
                      <span className="text-fg">{h.name}</span> ({h.kind}, {h.prevalence.toLowerCase()}): {h.reason}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-faint">You can add these, and more, in the Peoples step.</p>
              </aside>
            )}
          </div>
        )}

        {step.key === "land" && (
          <div className="flex flex-col gap-6">
            <Field label="The shape of the world">
              <ChipGroup label="World shape" options={WORLD_SHAPES} value={s.profile.worldShape} onChange={(v) => setProfile({ worldShape: v as string })} />
            </Field>
            <Field label="Climates and terrain" hint="Pick any that apply.">
              <ChipGroup label="Climates" multiple options={CLIMATES} value={s.profile.climates ?? []} onChange={(v) => setProfile({ climates: v as string[] })} />
            </Field>
            <SuggestField id="ob-regions" label="Regions you want" field="regions" mode="append" draft={draft} value={s.profile.regions ?? ""} onChange={(v) => setProfile({ regions: v })}>
              <Textarea id="ob-regions" value={s.profile.regions ?? ""} onChange={(e) => setProfile({ regions: e.target.value })} className="min-h-16" placeholder="A cold north, a river heartland, an ash desert" />
            </SuggestField>
            <SuggestField id="ob-landmarks" label="Famous landmarks" field="landmarks" mode="append" draft={draft} value={s.profile.landmarks ?? ""} onChange={(v) => setProfile({ landmarks: v })}>
              <Input id="ob-landmarks" value={s.profile.landmarks ?? ""} onChange={(e) => setProfile({ landmarks: e.target.value })} placeholder="A bridge built by giants, a lighthouse that never goes out" />
            </SuggestField>
          </div>
        )}

        {step.key === "peoples" && <PeoplesStep state={s} update={update} draft={draft} aiLive={aiLive} />}

        {step.key === "powers" && (
          <div className="flex flex-col gap-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Starting nations" htmlFor="ob-nations">
                <Stepper id="ob-nations" value={s.profile.nationCount ?? 3} onChange={(v) => setProfile({ nationCount: v })} />
              </Field>
              <Field label="Major factions" htmlFor="ob-factions">
                <Stepper id="ob-factions" value={s.profile.factionCount ?? 4} onChange={(v) => setProfile({ factionCount: v })} />
              </Field>
            </div>
            <Field label="Kinds of government" hint="Pick any that apply.">
              <ChipGroup label="Governments" multiple options={GOVERNMENTS} value={s.profile.governments ?? []} onChange={(v) => setProfile({ governments: v as string[] })} />
            </Field>
            <Field label="Faith">
              <ChipGroup label="Religion style" options={RELIGION_STYLES} value={s.profile.religionStyle} onChange={(v) => setProfile({ religionStyle: v as string })} />
            </Field>
            <Field label="What shaped the past" hint="Pick any that apply.">
              <ChipGroup label="History" multiple options={HISTORY_HOOKS} value={s.profile.historyHooks ?? []} onChange={(v) => setProfile({ historyHooks: v as string[] })} />
            </Field>
            <SuggestField id="ob-themes" label="Themes that matter" field="themes" mode="append" draft={draft} value={s.profile.themes ?? ""} onChange={(v) => setProfile({ themes: v })}>
              <Input id="ob-themes" value={s.profile.themes ?? ""} onChange={(e) => setProfile({ themes: e.target.value })} placeholder="Corruption, faith versus reason, the cost of empire" />
            </SuggestField>
            <SuggestField id="ob-conflict" label="The central conflict" field="conflict" draft={draft} value={s.profile.conflict ?? ""} onChange={(v) => setProfile({ conflict: v })}>
              <Textarea id="ob-conflict" value={s.profile.conflict ?? ""} onChange={(e) => setProfile({ conflict: e.target.value })} className="min-h-16" placeholder="A dying king, a scheming regent, and an empire across the sea" />
            </SuggestField>
          </div>
        )}

        {step.key === "start" && (
          <div className="flex flex-col gap-6">
            <SuggestField id="ob-start" label="Where play begins" field="startingArea" draft={draft} value={s.profile.startingArea ?? ""} onChange={(v) => setProfile({ startingArea: v })}>
              <Textarea id="ob-start" value={s.profile.startingArea ?? ""} onChange={(e) => setProfile({ startingArea: e.target.value })} className="min-h-16" placeholder="A river-crossing town where every faction has an agent" />
            </SuggestField>
            <label className="flex items-start gap-3 text-sm">
              <Switch checked={!!s.profile.detailStart} onCheckedChange={(v) => setProfile({ detailStart: v })} aria-label="Detail the starting area" className="mt-0.5" />
              <span>
                <span className="font-medium">Detail the starting area</span>
                <span className="block text-muted">The foundation includes a starting town with a tavern and three NPCs, ready for session one.</span>
              </span>
            </label>
            <SuggestField id="ob-avoid" label="Keep out of this world" hint="Your table's lines. Claude never includes these in anything it writes for this world." field="avoid" mode="append" draft={draft} value={s.profile.avoid ?? ""} onChange={(v) => setProfile({ avoid: v })}>
              <Input id="ob-avoid" value={s.profile.avoid ?? ""} onChange={(e) => setProfile({ avoid: e.target.value })} placeholder="Spiders, harm to children" />
            </SuggestField>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-muted">Calendar</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {Object.entries(CALENDAR_PRESETS).map(([k, p]) => (
                  <button
                    type="button"
                    key={k}
                    onClick={() => update({ calendarPreset: k })}
                    className={cn("rounded-lg border p-3 text-left transition-colors", s.calendarPreset === k ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong")}
                    aria-pressed={s.calendarPreset === k}
                  >
                    <span className="block text-sm font-semibold">{p.label}</span>
                    <span className="mt-1 block text-xs text-muted">{p.description}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-faint">Rename months, add holidays, eras and moons later in the calendar editor.</p>
            </fieldset>
            <Field label="Current year" htmlFor="ob-year" hint="Where the story begins. Leave blank for 1000.">
              <Input id="ob-year" inputMode="numeric" value={s.startYear} onChange={(e) => update({ startYear: e.target.value.replace(/[^\d-]/g, "") })} placeholder="1000" className="w-32" />
            </Field>
          </div>
        )}

        {step.key === "review" && <Review s={s} go={go} />}

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-line pt-5">
          {step.key === "review" ? (
            <>
              <AiWorking active={creating === "foundation"} live={aiLive} what="Claude is building your world's foundation" typical="1–2 minutes" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="ghost" onClick={() => go(s.step - 1)}>
                  <ArrowLeft /> Back
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="lg" onClick={() => create("world")} loading={creating === "world"} disabled={!!creating}>
                    Create the world only
                  </Button>
                  <Button type="button" variant="arcane" size="lg" onClick={() => create("foundation")} loading={creating === "foundation"} disabled={!!creating}>
                    <Sparkles /> Create and propose a foundation
                  </Button>
                </div>
              </div>
              <p className="text-xs text-faint">
                {aiLive
                  ? "The foundation is a set of proposals (regions, nations, faiths, factions, history) built from every answer here. You approve or edit each one."
                  : "No AI model is connected, so the built-in generator drafts a starter foundation. Add an Anthropic API key for one built from your answers."}
              </p>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {s.step === 0 ? (
                firstWorld ? <DemoWorldButton variant="ghost" label="Or explore a finished demo world" /> : <span />
              ) : (
                <Button type="button" variant="ghost" onClick={() => go(s.step - 1)}>
                  <ArrowLeft /> Back
                </Button>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {s.step === 0 && (
                  <Button type="button" variant="ghost" onClick={() => create("blank")} loading={creating === "blank"} disabled={!!creating}>
                    Create it now, fill in later
                  </Button>
                )}
                <Button type="button" variant="primary" size="lg" onClick={() => go(s.step + 1)}>
                  {STEPS[s.step + 1]!.title} <ArrowRight />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STEP_INTRO: Record<(typeof STEPS)[number]["key"], string> = {
  idea: "Start with what you know. Every step is optional, and each Suggest button reads what you've written so far.",
  magic: "These choices decide which classes thrive, which peoples exist, and how the AI writes your world.",
  land: "The broad strokes of the map. The foundation fills in names and borders.",
  peoples: "Who lives here. Core races and classes are tuned to your answers; homebrew can grow out of your setting.",
  powers: "Who holds power, what people believe, and what happened before the story starts.",
  start: "Where session one happens, what never appears in this world, and how time is counted.",
  review: "Everything you chose. Edit any part, then create the world.",
};

function Review({ s, go }: { s: CreatorState; go: (step: number) => void }) {
  const p = s.profile;
  const races = Object.entries(s.races).filter(([, v]) => v !== "Absent");
  const classes = Object.entries(s.classes).filter(([, v]) => v !== "Absent");
  const rows: { step: number; title: string; items: [string, React.ReactNode][] }[] = [
    { step: 0, title: "The idea", items: [["Name", s.name || "—"], ["Genre", s.genre], ["Tone", s.tone], ["Pitch", s.description], ["Inspirations", p.inspirations]] },
    { step: 1, title: "Magic & technology", items: [["Magic", s.magicLevel], ["Comes from", p.magicSources?.join(", ")], ["Seen as", p.magicAttitude], ["Technology", s.techLevel]] },
    { step: 2, title: "The land", items: [["Shape", p.worldShape], ["Climates", p.climates?.join(", ")], ["Regions", p.regions], ["Landmarks", p.landmarks]] },
    {
      step: 3,
      title: "Peoples",
      items: [
        ["Races", races.map(([n, v]) => `${n} (${v.toLowerCase()})`).join(", ") || "None"],
        ["Classes", classes.map(([n, v]) => `${n} (${v.toLowerCase()})`).join(", ") || "None"],
        [
          "Homebrew",
          s.homebrew.length ? (
            <span className="flex flex-wrap gap-1.5">
              {s.homebrew.map((h) => (
                <Badge key={`${h.kind}:${h.name}`} tone={h.kind === "race" ? "brass" : "arcane"}>
                  {h.name}
                </Badge>
              ))}
            </span>
          ) : undefined,
        ],
      ],
    },
    { step: 4, title: "Powers & history", items: [["Nations", String(p.nationCount ?? 3)], ["Factions", String(p.factionCount ?? 4)], ["Governments", p.governments?.join(", ")], ["Faith", p.religionStyle], ["History", p.historyHooks?.join(", ")], ["Themes", p.themes], ["Conflict", p.conflict]] },
    { step: 5, title: "Where play begins", items: [["Starting area", p.startingArea], ["Detail it", p.detailStart ? "Yes" : undefined], ["Keep out", p.avoid], ["Calendar", CALENDAR_PRESETS[s.calendarPreset]?.label], ["Year", s.startYear || "1000"]] },
  ];
  return (
    <div className="flex flex-col gap-4">
      {rows.map((r) => {
        const filled = r.items.filter(([, v]) => v !== undefined && v !== "");
        return (
          <section key={r.title} className="rounded-lg border border-line px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{r.title}</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => go(r.step)} aria-label={`Edit ${r.title}`}>
                <Pencil /> Edit
              </Button>
            </div>
            {filled.length ? (
              <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[8rem_1fr]">
                {filled.map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="text-faint">{k}</dt>
                    <dd className="min-w-0 break-words">{v}</dd>
                  </React.Fragment>
                ))}
              </dl>
            ) : (
              <p className="mt-1 text-sm text-faint">Left open. The foundation will choose.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
