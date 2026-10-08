"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CloudSun, EyeOff, Plus, Sparkle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlays";
import { MoonGlyph } from "@/components/shell/world-clock";
import { useWorld } from "@/components/shell/world-context";
import { setCampaignTimeAction } from "@/server/actions/play";
import { setWorldTimeAction } from "@/server/actions/worlds";
import type { MoonPhase } from "@/lib/calendar";
import { cn } from "@/lib/utils";

export interface CalendarDay {
  day: number;
  abs: number;
  weekdayIndex: number | null;
  weekday: string | null;
  label: string;
  season: string | null;
  seasonStart: string | null;
  holidays: { name: string; description: string }[];
  moons: { name: string; color: string | null; phase: MoonPhase; illumination: number; peak: "full" | "new" | null }[];
  weather: string;
  events: { id: string; name: string; kind: string; summary: string; spans: boolean; hidden: boolean }[];
}

const KIND_DOT: Record<string, string> = { historical: "bg-brass", world: "bg-accent", campaign: "bg-play", character: "bg-people", faction: "bg-powers" };

export function CalendarMonth({
  year,
  month,
  yearLabel,
  monthName,
  intercalary,
  months,
  weekdays,
  days,
  now,
  minuteOfDay,
  initialDay,
  campaign,
  climate,
  canEdit,
}: {
  year: number;
  month: number;
  yearLabel: string;
  monthName: string;
  intercalary: boolean;
  months: { name: string; intercalary: boolean; count: number }[];
  weekdays: string[];
  days: CalendarDay[];
  now: { year: number; month: number; day: number; abs: number; label: string };
  minuteOfDay: number;
  initialDay: number;
  campaign: { id: string; name: string } | null;
  climate: string | null;
  canEdit: boolean;
}) {
  const w = useWorld();
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = React.useState(initialDay);
  const [yearText, setYearText] = React.useState(String(year));
  const [confirmSet, setConfirmSet] = React.useState(false);
  React.useEffect(() => setSelected(initialDay), [initialDay, year, month]);
  React.useEffect(() => setYearText(String(year)), [year]);

  const go = (y: number, m: number) => {
    let yy = y;
    let mm = m;
    if (mm < 0) {
      yy -= 1;
      mm = months.length - 1;
    } else if (mm >= months.length) {
      yy += 1;
      mm = 0;
    }
    router.push(`${pathname}?y=${yy}&m=${mm}`, { scroll: false });
  };
  const isNowMonth = year === now.year && month === now.month;
  const sel = days.find((d) => d.day === selected) ?? days[0]!;
  const lead = intercalary ? 0 : (days[0]?.weekdayIndex ?? 0);
  const cols = intercalary ? Math.min(days.length, 7) : weekdays.length;

  const setDate = async () => {
    const target = sel.abs + minuteOfDay;
    const res = campaign ? await setCampaignTimeAction(w.worldId, campaign.id, target) : await setWorldTimeAction(w.worldId, target);
    if (!res.ok) return void toast.error(res.error);
    router.refresh();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        {/* Month heading + navigation */}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-3xl font-semibold leading-none">{monthName}</h2>
            <p className="mt-1 text-sm text-muted">
              {yearLabel}
              {days[0]?.season && <span className="text-faint"> · {days[0].season}</span>}
              {intercalary && <span className="text-faint"> · festival days outside the weeks</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon-sm" onClick={() => go(year, month - 1)} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const y = Number.parseInt(yearText, 10);
                if (Number.isFinite(y)) go(y, month);
              }}
            >
              <Input value={yearText} onChange={(e) => setYearText(e.target.value)} inputMode="numeric" className="h-7 w-20 text-center text-sm tabular" aria-label="Year" />
            </form>
            <Button variant="ghost" size="icon-sm" onClick={() => go(year, month + 1)} aria-label="Next month">
              <ChevronRight />
            </Button>
            {!isNowMonth && (
              <Button variant="secondary" size="sm" onClick={() => router.push(pathname, { scroll: false })}>
                Today
              </Button>
            )}
          </div>
        </div>

        {/* Year strip */}
        <ol className="mb-4 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(months.length, 13)}, minmax(0, 1fr))` }} aria-label={`Months of ${yearLabel}`}>
          {months.map((m, i) => (
            <li key={i}>
              <button
                onClick={() => go(year, i)}
                aria-current={i === month ? "date" : undefined}
                title={`${m.name}${m.count ? ` · ${m.count} event${m.count === 1 ? "" : "s"}` : ""}`}
                className={cn(
                  "relative flex h-9 w-full flex-col items-center justify-center rounded-md border text-2xs leading-tight transition-colors",
                  i === month ? "border-brass/60 bg-brass-soft text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg",
                  m.intercalary && "border-dashed",
                )}
              >
                <span className="max-w-full truncate px-1">{months.length > 8 && m.name.length > 6 ? m.name.slice(0, 3) : m.name}</span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {Array.from({ length: Math.min(m.count, 5) }).map((_, k) => (
                    <span key={k} className="size-1 rounded-full bg-current opacity-70" />
                  ))}
                </span>
                {year === now.year && i === now.month && <span className="absolute -top-1 right-1 size-2 rounded-full bg-brass ring-2 ring-bg" aria-label="Current month" />}
              </button>
            </li>
          ))}
        </ol>

        {/* Grid */}
        <div className="overflow-x-auto">
          <div className="grid min-w-[36rem] overflow-hidden rounded-lg border border-line bg-line" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 1 }}>
            {!intercalary &&
              weekdays.map((wd) => (
                <div key={wd} className="bg-surface-2 px-2 py-1.5 text-xs font-medium text-muted">
                  {wd}
                </div>
              ))}
            {Array.from({ length: lead }).map((_, i) => (
              <div key={`lead-${i}`} className="bg-bg-subtle" />
            ))}
            {days.map((d) => {
              const isNow = isNowMonth && d.day === now.day;
              const past = year < now.year || (year === now.year && (month < now.month || (month === now.month && d.day < now.day)));
              const peak = d.moons.find((m) => m.peak);
              return (
                <button
                  key={d.day}
                  onClick={() => setSelected(d.day)}
                  aria-pressed={selected === d.day}
                  aria-label={d.label}
                  className={cn(
                    "group relative flex min-h-24 flex-col gap-1 bg-surface p-1.5 text-left transition-colors hover:bg-surface-2",
                    selected === d.day && "bg-surface-2 outline outline-2 -outline-offset-2 outline-accent",
                  )}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className={cn("flex size-6 items-center justify-center rounded-full text-sm tabular", isNow ? "bg-brass font-semibold text-bg" : past ? "text-faint" : "text-fg")}>{d.day}</span>
                    {peak && <MoonGlyph phase={peak.phase} illumination={peak.illumination} color={peak.color ?? undefined} className="size-3.5" />}
                  </span>
                  {d.seasonStart && <span className="truncate text-2xs text-accent">{d.seasonStart} begins</span>}
                  {d.holidays.map((h) => (
                    <span key={h.name} className="flex items-center gap-1 truncate text-2xs font-medium text-brass">
                      <Sparkle className="size-2.5 shrink-0" /> {h.name}
                    </span>
                  ))}
                  {d.events.slice(0, 3).map((e) => (
                    <span key={e.id} className="flex items-center gap-1 truncate text-2xs text-muted">
                      <span className={cn("size-1.5 shrink-0 rounded-full", KIND_DOT[e.kind] ?? "bg-faint")} />
                      <span className="truncate">{e.name}</span>
                    </span>
                  ))}
                  {d.events.length > 3 && <span className="text-2xs text-faint">+{d.events.length - 3} more</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Day detail */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <div>
          <p className="text-sm text-muted">{sel.weekday ?? "Festival day"}</p>
          <h3 className="font-serif text-2xl font-semibold leading-tight">{sel.label.replace(/^[^,]+,\s*/, sel.weekday ? "" : "$&")}</h3>
          {isNowMonth && sel.day === now.day && <p className="mt-1 text-sm text-brass">Today in {campaign?.name ?? "the world"} · {now.label}</p>}
          {sel.season && <p className="mt-1 text-sm text-faint">{sel.season}</p>}
        </div>

        {sel.holidays.length > 0 && (
          <section>
            <h4 className="mb-1 text-sm font-semibold text-muted">Holidays</h4>
            <ul className="flex flex-col gap-1.5">
              {sel.holidays.map((h) => (
                <li key={h.name}>
                  <p className="font-medium text-brass">{h.name}</p>
                  {h.description && <p className="text-sm text-muted">{h.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {sel.moons.length > 0 && (
          <section>
            <h4 className="mb-1 text-sm font-semibold text-muted">Moons</h4>
            <ul className="flex flex-col gap-1">
              {sel.moons.map((m) => (
                <li key={m.name} className="flex items-center gap-2 text-sm">
                  <MoonGlyph phase={m.phase} illumination={m.illumination} color={m.color ?? undefined} />
                  <span className="font-medium">{m.name}</span>
                  <span className="text-muted">{m.phase}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {climate && (
          <section>
            <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-muted">
              <CloudSun className="size-4" /> Likely weather
            </h4>
            <p className="text-sm">{sel.weather}</p>
            <p className="text-xs text-faint">{climate} climate, where the party is now</p>
          </section>
        )}

        <section>
          <h4 className="mb-1 text-sm font-semibold text-muted">Events</h4>
          {sel.events.length ? (
            <ul className="flex flex-col gap-2">
              {sel.events.map((e) => (
                <li key={e.id}>
                  <Link href={`/w/${w.worldId}/e/${e.id}`} className="flex items-center gap-1.5 font-medium hover:text-accent">
                    <span className={cn("size-2 shrink-0 rounded-full", KIND_DOT[e.kind] ?? "bg-faint")} /> {e.name}
                    {e.hidden && <EyeOff className="size-3.5 text-faint" aria-label="Hidden from players" />}
                  </Link>
                  {e.summary && <p className="pl-3.5 text-sm text-muted">{e.summary}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-faint">Nothing recorded on this day.</p>
          )}
        </section>

        {canEdit && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <Button variant="secondary" size="sm" onClick={() => w.openQuickCreate({ type: "event", defaults: { event: { startAt: sel.abs + minuteOfDay, kind: "historical" } }, onCreated: () => router.refresh() })}>
              <Plus /> Add an event on this day
            </Button>
            {!(isNowMonth && sel.day === now.day) && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmSet(true)}>
                Set {campaign ? "the campaign" : "the world"} date to this day
              </Button>
            )}
          </div>
        )}
        <ConfirmDialog
          open={confirmSet}
          onOpenChange={setConfirmSet}
          destructive={false}
          title={`Set the date to ${sel.label}?`}
          description={
            campaign
              ? "This corrects the campaign clock without simulating the world. To let time pass with consequences, use Advance World instead."
              : "This corrects the world clock without simulating anything."
          }
          confirmLabel="Set date"
          onConfirm={setDate}
        />
      </aside>
    </div>
  );
}
