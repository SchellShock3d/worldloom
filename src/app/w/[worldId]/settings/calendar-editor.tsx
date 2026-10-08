"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/primitives";
import { MoonGlyph } from "@/components/shell/world-clock";
import { useWorld } from "@/components/shell/world-context";
import { updateCalendarAction } from "@/server/actions/worlds";
import { CALENDAR_PRESETS, calendarProblems, formatDate, isStructuralChange, resolve, type CalendarDefinition } from "@/lib/calendar";

type Cal = CalendarDefinition;

/** Small list editor: rows with move up/down and remove. */
function Rows<T>({ items, onChange, render, blank, addLabel, min = 0 }: { items: T[]; onChange: (v: T[]) => void; render: (item: T, set: (patch: Partial<T>) => void, i: number) => React.ReactNode; blank: () => T; addLabel: string; min?: number }) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{render(it, (p) => onChange(items.map((x, k) => (k === i ? { ...x, ...p } : x))), i)}</div>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down">
            <ArrowDown />
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => onChange(items.filter((_, k) => k !== i))} disabled={items.length <= min} aria-label="Remove">
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onChange([...items, blank()])}>
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-5">
      <div>
        <h2 className="text-md font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const num = (v: string, fallback: number) => (v.trim() === "" || Number.isNaN(Number(v)) ? fallback : Number(v));

export function CalendarEditor({ initial, now }: { initial: Cal; now: number }) {
  const w = useWorld();
  const router = useRouter();
  const [c, setC] = React.useState<Cal>(initial);
  const [keepDates, setKeepDates] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [preset, setPreset] = React.useState<string | null>(null);
  const set = <K extends keyof Cal>(k: K, v: Cal[K]) => setC((x) => ({ ...x, [k]: v }));
  const problems = calendarProblems(c);
  const structural = isStructuralChange(initial, c);
  const dirty = JSON.stringify(c) !== JSON.stringify(initial);
  let preview = "";
  try {
    if (!problems.length) {
      const r = resolve(c, now);
      preview = `${formatDate(c, now, { weekday: true })}${r.season ? ` · ${r.season}` : ""}`;
    }
  } catch {
    preview = "";
  }
  const monthOptions = c.months.map((m, i) => (
    <option key={i} value={i}>
      {m.name || `Month ${i + 1}`}
    </option>
  ));

  const save = async () => {
    if (problems.length) return toast.error(problems[0]);
    setPending(true);
    const res = await updateCalendarAction(w.worldId, c, { keepDates });
    setPending(false);
    if (!res.ok) return void toast.error(res.error);
    if (res.data.moved) toast.message(`${res.data.moved} dated records were kept on the same days.`);
    router.refresh();
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <div>
          <p className="text-xs text-faint">With these settings, today is</p>
          <p className="font-serif text-xl font-semibold">{preview || "…"}</p>
        </div>
        <div className="flex items-center gap-2">
          <NativeSelect value="" onChange={(e) => e.target.value && setPreset(e.target.value)} aria-label="Start from a preset" className="w-48">
            <option value="">Start from a preset…</option>
            {Object.entries(CALENDAR_PRESETS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <Section title="Months" hint="Festival days sit outside the weeks: they're counted, but have no weekday.">
        <Rows
          items={c.months}
          min={1}
          onChange={(v) => set("months", v)}
          blank={(): Cal["months"][number] => ({ name: "", days: 30 })}
          addLabel="Add month"
          render={(m, upd, i) => (
            <>
              <span className="w-6 text-right text-xs text-faint tabular">{i + 1}</span>
              <Input value={m.name} onChange={(e) => upd({ name: e.target.value })} className="h-8 min-w-36 flex-1 text-sm" placeholder="Name" aria-label={`Month ${i + 1} name`} />
              <Input type="number" min={1} max={400} value={m.days} onChange={(e) => upd({ days: num(e.target.value, 1) })} className="h-8 w-20 text-sm tabular" aria-label={`Days in month ${i + 1}`} />
              <span className="text-xs text-faint">days</span>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <Switch checked={!!m.intercalary} onCheckedChange={(v) => upd({ intercalary: v || undefined })} /> festival
              </label>
            </>
          )}
        />
        <p className="text-xs text-faint">{c.months.reduce((s, m) => s + m.days, 0)} days a year{c.leapYear ? ` (+${c.leapYear.extraDays} every ${c.leapYear.every} years)` : ""}.</p>
      </Section>

      <Section title="Weekdays">
        <Rows
          items={c.weekdays.map((name) => ({ name }))}
          min={1}
          onChange={(v) => set("weekdays", v.map((x) => x.name))}
          blank={() => ({ name: "" })}
          addLabel="Add weekday"
          render={(d, upd, i) => <Input value={d.name} onChange={(e) => upd({ name: e.target.value })} className="h-8 text-sm" aria-label={`Weekday ${i + 1}`} />}
        />
      </Section>

      <Section title="Time of day">
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Field label="Hours per day" htmlFor="c-hpd">
            <Input id="c-hpd" type="number" min={1} max={100} value={c.hoursPerDay} onChange={(e) => set("hoursPerDay", num(e.target.value, 24))} />
          </Field>
          <Field label="Minutes per hour" htmlFor="c-mph">
            <Input id="c-mph" type="number" min={1} max={1000} value={c.minutesPerHour} onChange={(e) => set("minutesPerHour", num(e.target.value, 60))} />
          </Field>
        </div>
      </Section>

      <Section title="Leap years">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={!!c.leapYear} onCheckedChange={(v) => set("leapYear", v ? { every: 4, monthIndex: 0, extraDays: 1 } : null)} /> This calendar has leap years
        </label>
        {c.leapYear && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            Every
            <Input type="number" min={2} max={1000} value={c.leapYear.every} onChange={(e) => set("leapYear", { ...c.leapYear!, every: num(e.target.value, 4) })} className="h-8 w-20 tabular" aria-label="Every how many years" />
            years, add
            <Input type="number" min={1} max={30} value={c.leapYear.extraDays} onChange={(e) => set("leapYear", { ...c.leapYear!, extraDays: num(e.target.value, 1) })} className="h-8 w-16 tabular" aria-label="Extra days" />
            day(s) to
            <NativeSelect value={c.leapYear.monthIndex} onChange={(e) => set("leapYear", { ...c.leapYear!, monthIndex: Number(e.target.value) })} className="h-8 w-44" aria-label="Leap month">
              {monthOptions}
            </NativeSelect>
          </div>
        )}
      </Section>

      <Section title="Eras" hint="Years are shown in the latest era that has started, counted from its first year.">
        <Rows
          items={c.eras}
          onChange={(v) => set("eras", v)}
          blank={() => ({ name: "", abbreviation: "", startYear: c.firstYear })}
          addLabel="Add era"
          render={(e, upd) => (
            <>
              <Input value={e.name} onChange={(x) => upd({ name: x.target.value })} className="h-8 min-w-40 flex-1 text-sm" placeholder="Age of Embers" aria-label="Era name" />
              <Input value={e.abbreviation} onChange={(x) => upd({ abbreviation: x.target.value })} className="h-8 w-20 text-sm" placeholder="AE" aria-label="Abbreviation" />
              <span className="text-xs text-faint">from year</span>
              <Input type="number" value={e.startYear} onChange={(x) => upd({ startYear: num(x.target.value, 1) })} className="h-8 w-24 text-sm tabular" aria-label="Starts in year" />
            </>
          )}
        />
      </Section>

      <Section title="Seasons">
        <Rows
          items={c.seasons}
          onChange={(v) => set("seasons", v)}
          blank={() => ({ name: "", startMonth: 0, startDay: 1 })}
          addLabel="Add season"
          render={(s, upd) => (
            <>
              <Input value={s.name} onChange={(x) => upd({ name: x.target.value })} className="h-8 min-w-32 flex-1 text-sm" placeholder="Spring" aria-label="Season name" />
              <span className="text-xs text-faint">starts</span>
              <Input type="number" min={1} value={s.startDay} onChange={(x) => upd({ startDay: num(x.target.value, 1) })} className="h-8 w-16 text-sm tabular" aria-label="Start day" />
              <NativeSelect value={s.startMonth} onChange={(x) => upd({ startMonth: Number(x.target.value) })} className="h-8 w-40 text-sm" aria-label="Start month">
                {monthOptions}
              </NativeSelect>
            </>
          )}
        />
      </Section>

      <Section title="Holidays">
        <Rows
          items={c.holidays}
          onChange={(v) => set("holidays", v)}
          blank={() => ({ name: "", month: 0, day: 1, description: "" })}
          addLabel="Add holiday"
          render={(h, upd) => (
            <>
              <Input value={h.name} onChange={(x) => upd({ name: x.target.value })} className="h-8 min-w-36 flex-1 text-sm" placeholder="Night of Lanterns" aria-label="Holiday name" />
              <Input type="number" min={1} value={h.day} onChange={(x) => upd({ day: num(x.target.value, 1) })} className="h-8 w-16 text-sm tabular" aria-label="Day" />
              <NativeSelect value={h.month} onChange={(x) => upd({ month: Number(x.target.value) })} className="h-8 w-40 text-sm" aria-label="Month">
                {monthOptions}
              </NativeSelect>
              <Input value={h.description ?? ""} onChange={(x) => upd({ description: x.target.value })} className="h-8 w-full text-sm" placeholder="What happens (optional)" aria-label="Description" />
            </>
          )}
        />
      </Section>

      <Section title="Moons" hint="The cycle is days from full moon to full moon. The offset shifts when the first full moon falls.">
        <Rows
          items={c.moons}
          onChange={(v) => set("moons", v)}
          blank={(): Cal["moons"][number] => ({ name: "", cycleDays: 30, fullMoonOffset: 0 })}
          addLabel="Add moon"
          render={(m, upd) => {
            const today = (() => {
              try {
                return resolve({ ...c, moons: [m] }, now).moons[0];
              } catch {
                return undefined;
              }
            })();
            return (
              <>
                {today && <MoonGlyph phase={today.phase} illumination={today.illumination} color={m.color} />}
                <Input value={m.name} onChange={(x) => upd({ name: x.target.value })} className="h-8 min-w-32 flex-1 text-sm" placeholder="The Pale Lady" aria-label="Moon name" />
                <Input type="number" min={1} step="0.01" value={m.cycleDays} onChange={(x) => upd({ cycleDays: num(x.target.value, 30) })} className="h-8 w-20 text-sm tabular" aria-label="Cycle in days" />
                <span className="text-xs text-faint">day cycle, offset</span>
                <Input type="number" value={m.fullMoonOffset} onChange={(x) => upd({ fullMoonOffset: num(x.target.value, 0) })} className="h-8 w-20 text-sm tabular" aria-label="Full moon offset" />
                <input type="color" value={m.color ?? "#d8dde8"} onChange={(x) => upd({ color: x.target.value })} className="h-8 w-9 cursor-pointer rounded border border-line bg-surface" aria-label="Colour" />
              </>
            );
          }}
        />
      </Section>

      <Section title="Advanced">
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Field label="Year of the first day" htmlFor="c-fy" hint="The year the calendar counts from.">
            <Input id="c-fy" type="number" value={c.firstYear} onChange={(e) => set("firstYear", num(e.target.value, 1))} />
          </Field>
          <Field label="Weekday of the first day" htmlFor="c-ew">
            <NativeSelect id="c-ew" value={c.epochWeekday} onChange={(e) => set("epochWeekday", Number(e.target.value))}>
              {c.weekdays.map((d, i) => (
                <option key={i} value={i}>
                  {d || `Day ${i + 1}`}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          {problems.length ? (
            <p className="flex items-center gap-1.5 text-ember">
              <TriangleAlert className="size-4 shrink-0" /> {problems[0]}
            </p>
          ) : structural ? (
            <label className="flex items-center gap-2">
              <Switch checked={keepDates} onCheckedChange={setKeepDates} />
              <span>
                Keep events on the same dates
                <span className="block text-xs text-faint">{keepDates ? "Recommended. Every dated record is re-encoded for the new calendar." : "Records keep their position in time, so their dates will shift."}</span>
              </span>
            </label>
          ) : (
            <span className="text-faint">{dirty ? "Unsaved changes." : "No changes."}</span>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {dirty && (
            <Button variant="ghost" onClick={() => setC(initial)}>
              Discard
            </Button>
          )}
          <Button variant="primary" onClick={save} loading={pending} disabled={!dirty || problems.length > 0}>
            Save calendar
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={!!preset}
        onOpenChange={(o) => !o && setPreset(null)}
        destructive={false}
        title={`Replace with “${preset ? CALENDAR_PRESETS[preset]?.label : ""}”?`}
        description="This replaces every field below. Nothing is saved until you press Save calendar."
        confirmLabel="Replace"
        onConfirm={() => {
          const p = preset ? CALENDAR_PRESETS[preset] : null;
          if (p) setC({ ...structuredClone(p.definition), firstYear: c.firstYear, eras: p.definition.eras.length ? p.definition.eras : c.eras });
          setPreset(null);
        }}
      />
    </div>
  );
}
