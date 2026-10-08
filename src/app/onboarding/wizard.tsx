"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/primitives";
import { createWorldAction } from "@/server/actions/worlds";
import { foundationAction } from "@/server/actions/ai";
import { CALENDAR_PRESETS } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { DemoWorldButton } from "../demo-world-button";

const GENRES = ["High fantasy", "Dark fantasy", "Sword & sorcery", "Low fantasy", "Gaslamp fantasy", "Mythic / ancient", "Cosmic horror", "Science fantasy", "Other"];
const MAGIC = ["None", "Low", "Moderate", "High", "Wild"] as const;
const TECH = ["Bronze age", "Medieval", "Renaissance", "Early industrial", "Industrial", "Modern", "Futuristic"];

type Step = "world" | "start" | "ai";

export function OnboardingWizard({ firstWorld, userName, aiLive }: { firstWorld: boolean; userName: string; aiLive: boolean }) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("world");
  const [worldId, setWorldId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", genre: "High fantasy", tone: "", magicLevel: "Moderate", techLevel: "Medieval", description: "", calendarPreset: "wheel", startYear: "" });
  const [answers, setAnswers] = React.useState({ themes: "", conflict: "", inspirations: "", regions: "", notes: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function createWorld(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Give your world a name.");
    setPending(true);
    const res = await createWorldAction({ ...form, startYear: form.startYear ? Number(form.startYear) : undefined });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    setWorldId(res.data.id);
    setStep("start");
  }

  async function buildWithAi(e: React.FormEvent) {
    e.preventDefault();
    if (!worldId) return;
    setPending(true);
    const res = await foundationAction(worldId, answers);
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    router.push(`/w/${worldId}/proposals/${res.data.batchId}?onboarding=1`);
  }

  return (
    <div>
      <ol className="mb-8 flex items-center gap-3 text-sm" aria-label="Progress">
        {[
          ["world", "Your world"],
          ["start", "Starting point"],
          ["campaign", "First campaign"],
        ].map(([k, label], i) => {
          const idx = ["world", "start", "campaign"].indexOf(step === "ai" ? "start" : step);
          return (
            <li key={k} className={cn("flex items-center gap-2", i <= idx ? "text-fg" : "text-faint")}>
              <span className={cn("flex size-6 items-center justify-center rounded-full border text-xs font-semibold tabular", i < idx ? "border-accent bg-accent text-accent-fg" : i === idx ? "border-accent text-accent" : "border-line")}>{i + 1}</span>
              {label}
              {i < 2 && <span className="mx-1 h-px w-8 bg-line" aria-hidden />}
            </li>
          );
        })}
      </ol>

      {step === "world" && (
        <form onSubmit={createWorld} className="flex flex-col gap-5">
          <div>
            <h1 className="font-serif text-4xl font-semibold tracking-[-0.01em]">{firstWorld ? `Welcome, ${userName.split(" ")[0]}. Let's build a world.` : "A new world"}</h1>
            <p className="mt-2 text-md text-muted">Start with the essentials. Everything can be changed later.</p>
          </div>
          <Field label="World name" htmlFor="ob-name">
            <Input id="ob-name" value={form.name} onChange={set("name")} placeholder="The Shattered Crown" className="h-10 text-md" autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Genre" htmlFor="ob-genre">
              <NativeSelect id="ob-genre" value={form.genre} onChange={set("genre")}>
                {GENRES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Tone" htmlFor="ob-tone" hint="E.g. hopeful, grim, political, whimsical">
              <Input id="ob-tone" value={form.tone} onChange={set("tone")} placeholder="Political intrigue with creeping dread" />
            </Field>
          </div>
          <Field label="Magic level">
            <Segmented value={form.magicLevel as (typeof MAGIC)[number]} onChange={(v) => setForm((f) => ({ ...f, magicLevel: v }))} options={MAGIC.map((m) => ({ value: m, label: m }))} />
          </Field>
          <Field label="Technology level" htmlFor="ob-tech">
            <NativeSelect id="ob-tech" value={form.techLevel} onChange={set("techLevel")} className="sm:w-64">
              {TECH.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Short description" htmlFor="ob-desc" hint="A paragraph is plenty. The AI uses this to stay on tone.">
            <Textarea id="ob-desc" value={form.description} onChange={set("description")} className="min-h-24" />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-muted">Calendar</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(CALENDAR_PRESETS).map(([k, p]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setForm((f) => ({ ...f, calendarPreset: k }))}
                  className={cn("rounded-lg border p-3 text-left transition-colors", form.calendarPreset === k ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong")}
                  aria-pressed={form.calendarPreset === k}
                >
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span className="mt-1 block text-xs text-muted">{p.description}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-faint">You can rename months, add holidays, eras and moons later in the calendar editor.</p>
          </fieldset>
          <Field label="Current year" htmlFor="ob-year" hint="Where the story begins. Leave blank for 1000.">
            <Input id="ob-year" inputMode="numeric" value={form.startYear} onChange={set("startYear")} placeholder="1000" className="w-32" />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            {firstWorld ? <DemoWorldButton variant="ghost" label="Or explore a finished demo world" /> : <span />}
            <Button type="submit" variant="primary" size="lg" loading={pending}>
              Create world
            </Button>
          </div>
        </form>
      )}

      {step === "start" && worldId && (
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="font-serif text-4xl font-semibold tracking-[-0.01em]">{form.name} exists. How should it begin?</h1>
            <p className="mt-2 text-md text-muted">Start from an empty page, or let the AI propose a foundation you can edit before anything becomes canon.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => router.push(`/w/${worldId}/campaigns/new?onboarding=1`)} className="flex flex-col gap-2 rounded-xl border border-line p-5 text-left hover:border-line-strong">
              <FilePlus2 className="size-6 text-muted" />
              <span className="font-serif text-xl font-semibold">Start blank</span>
              <span className="text-sm text-muted">Go straight to your first campaign and add places and people as you need them.</span>
            </button>
            <button onClick={() => setStep("ai")} className="flex flex-col gap-2 rounded-xl border border-arcane/30 bg-arcane-soft/40 p-5 text-left hover:border-arcane/60">
              <Sparkles className="size-6 text-arcane" />
              <span className="font-serif text-xl font-semibold">Build with AI</span>
              <span className="text-sm text-muted">Answer a few questions and review a proposed set of regions, nations, religions, factions and history.</span>
            </button>
          </div>
        </div>
      )}

      {step === "ai" && worldId && (
        <form onSubmit={buildWithAi} className="flex flex-col gap-5">
          <div>
            <h1 className="font-serif text-4xl font-semibold tracking-[-0.01em]">Tell me about {form.name}</h1>
            <p className="mt-2 text-md text-muted">Short answers are fine. You'll review every proposal before it becomes canon.</p>
            {!aiLive && (
              <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">
                No AI model is connected, so Worldloom's offline generator will create a starter foundation. Add an Anthropic API key for one built from your answers.
              </p>
            )}
          </div>
          <Field label="What themes matter in this world?" htmlFor="ob-themes">
            <Textarea id="ob-themes" value={answers.themes} onChange={(e) => setAnswers((a) => ({ ...a, themes: e.target.value }))} placeholder="Corruption, faith versus reason, the cost of empire" className="min-h-16" />
          </Field>
          <Field label="What's the central conflict?" htmlFor="ob-conflict">
            <Textarea id="ob-conflict" value={answers.conflict} onChange={(e) => setAnswers((a) => ({ ...a, conflict: e.target.value }))} placeholder="A dying king, a scheming regent, and an empire across the sea" className="min-h-16" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Inspirations" htmlFor="ob-insp">
              <Input id="ob-insp" value={answers.inspirations} onChange={(e) => setAnswers((a) => ({ ...a, inspirations: e.target.value }))} placeholder="Byzantium, plague years, folk horror" />
            </Field>
            <Field label="Regions or geography you want" htmlFor="ob-regions">
              <Input id="ob-regions" value={answers.regions} onChange={(e) => setAnswers((a) => ({ ...a, regions: e.target.value }))} placeholder="Cold north, river heartland, ash desert" />
            </Field>
          </div>
          <Field label="Anything else?" htmlFor="ob-notes">
            <Textarea id="ob-notes" value={answers.notes} onChange={(e) => setAnswers((a) => ({ ...a, notes: e.target.value }))} className="min-h-16" />
          </Field>
          <div className="flex justify-between gap-3 border-t border-line pt-5">
            <Button type="button" variant="ghost" onClick={() => setStep("start")}>
              Back
            </Button>
            <Button type="submit" variant="arcane" size="lg" loading={pending}>
              <Sparkles /> Propose a foundation
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
