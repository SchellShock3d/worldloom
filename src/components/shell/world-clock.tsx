"use client";

import Link from "next/link";
import { resolve, formatDate, formatTime, timeOfDay, type CalendarDefinition, type MoonPhase } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { useNow, useWorld } from "./world-context";
import { Button } from "@/components/ui/button";
import { FastForward } from "lucide-react";

/** Moon glyph drawn from illumination + phase direction. */
export function MoonGlyph({ phase, illumination, color = "var(--text)", className }: { phase: MoonPhase; illumination: number; color?: string; className?: string }) {
  const waxing = phase.startsWith("waxing") || phase === "first quarter";
  // Terminator ellipse: rx from +r (new) to -r (full)
  const r = 7;
  const k = 1 - 2 * illumination; // 1 = new, -1 = full
  const rx = Math.abs(k) * r;
  const sweepLit = waxing ? 1 : 0;
  const d =
    illumination <= 0.02
      ? ""
      : illumination >= 0.98
        ? `M8 1 a7 7 0 1 1 0 14 a7 7 0 1 1 0 -14`
        : `M8 1 A7 7 0 0 ${sweepLit} 8 15 A${rx} 7 0 0 ${k > 0 ? 1 - sweepLit : sweepLit} 8 1`;
  return (
    <svg viewBox="0 0 16 16" className={cn("size-3.5", className)} aria-label={`${phase} moon`}>
      <circle cx="8" cy="8" r="7" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1" />
      {d && <path d={d} fill={color} fillOpacity="0.9" />}
    </svg>
  );
}

export function WorldClock({ onAdvance }: { onAdvance?: () => void }) {
  const w = useWorld();
  const now = useNow();
  const cal: CalendarDefinition = w.calendar;
  const r = resolve(cal, now);
  const moon = r.moons[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-line bg-surface px-2 text-sm hover:border-line-strong sm:px-2.5"
          aria-label={`In-world date: ${formatDate(cal, now)}`}
        >
          {moon && <MoonGlyph phase={moon.phase} illumination={moon.illumination} color={moon.color} />}
          <span className="hidden font-medium tabular min-[440px]:inline">{r.monthName && formatShort(cal, now)}</span>
          <span className="hidden text-faint md:inline">{timeOfDay(cal, now)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-line px-4 py-3">
          <p className="text-xs text-faint">{w.activeCampaign ? `${w.activeCampaign.name} · now` : "World clock"}</p>
          <p className="mt-0.5 font-serif text-xl font-semibold">{formatDate(cal, now, { weekday: true })}</p>
          <p className="text-sm text-muted">
            {formatTime(cal, now)}, {timeOfDay(cal, now)}
            {r.season ? `, ${r.season.toLowerCase()}` : ""}
          </p>
        </div>
        <dl className="space-y-1.5 px-4 py-3 text-sm">
          {r.era && (
            <Row label="Era">
              {r.era.name} ({r.era.yearOfEra})
            </Row>
          )}
          {r.holidays.length > 0 && <Row label="Today">{r.holidays.join(", ")}</Row>}
          {r.moons.map((m) => (
            <Row key={m.name} label={m.name}>
              <span className="inline-flex items-center gap-1.5">
                <MoonGlyph phase={m.phase} illumination={m.illumination} color={m.color} />
                {m.phase}
              </span>
            </Row>
          ))}
        </dl>
        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/w/${w.worldId}/calendar`}>Open calendar</Link>
          </Button>
          {onAdvance && w.activeCampaign && (
            <Button variant="primary" size="sm" onClick={onAdvance}>
              <FastForward /> Advance time
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatShort(cal: CalendarDefinition, now: number) {
  const r = resolve(cal, now);
  const m = cal.months[r.month]!;
  const day = m.intercalary && m.days === 1 ? r.monthName : `${r.day} ${r.monthName}`;
  return `${day}, ${r.era?.abbreviation ? `${r.era.yearOfEra} ${r.era.abbreviation}` : r.year}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-faint">{label}</dt>
      <dd className="text-right text-fg">{children}</dd>
    </div>
  );
}
