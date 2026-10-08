"use client";

import * as React from "react";
import { daysInMonth, resolve, toAbsolute, type CalendarDefinition } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { inputBase } from "@/components/ui/input";

/** Date picker for in-world (custom calendar) dates. Value is absolute minutes. */
export function WorldDateInput({
  calendar,
  value,
  onChange,
  withTime = false,
  className,
  idPrefix,
}: {
  calendar: CalendarDefinition;
  value: number;
  onChange: (v: number) => void;
  withTime?: boolean;
  className?: string;
  idPrefix?: string;
}) {
  const r = resolve(calendar, value);
  const [yearText, setYearText] = React.useState(String(r.era?.abbreviation ? r.year : r.year));
  React.useEffect(() => setYearText(String(r.year)), [r.year]);

  const update = (parts: Partial<{ year: number; month: number; day: number; hour: number; minute: number }>) => {
    const year = parts.year ?? r.year;
    const month = parts.month ?? r.month;
    const maxDay = daysInMonth(calendar, year, month);
    const day = Math.min(parts.day ?? r.day, maxDay);
    onChange(toAbsolute(calendar, { year, month, day, hour: parts.hour ?? r.hour, minute: parts.minute ?? r.minute }));
  };
  const maxDay = daysInMonth(calendar, r.year, r.month);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <select
        id={idPrefix ? `${idPrefix}-day` : undefined}
        aria-label="Day"
        className={cn(inputBase, "h-8 w-16 px-2")}
        value={r.day}
        onChange={(e) => update({ day: Number(e.target.value) })}
      >
        {Array.from({ length: maxDay }, (_, i) => (
          <option key={i} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
      <select aria-label="Month" className={cn(inputBase, "h-8 w-auto min-w-28 px-2")} value={r.month} onChange={(e) => update({ month: Number(e.target.value) })}>
        {calendar.months.map((m, i) => (
          <option key={i} value={i}>
            {m.name}
          </option>
        ))}
      </select>
      <input
        aria-label="Year"
        className={cn(inputBase, "h-8 w-24 tabular")}
        inputMode="numeric"
        value={yearText}
        onChange={(e) => {
          setYearText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isInteger(n)) update({ year: n });
        }}
      />
      {withTime && (
        <span className="flex items-center gap-1">
          <input
            aria-label="Hour"
            type="number"
            min={0}
            max={calendar.hoursPerDay - 1}
            className={cn(inputBase, "h-8 w-16 tabular")}
            value={r.hour}
            onChange={(e) => update({ hour: Math.max(0, Math.min(calendar.hoursPerDay - 1, Number(e.target.value) || 0)) })}
          />
          <span className="text-faint">:</span>
          <input
            aria-label="Minute"
            type="number"
            min={0}
            max={calendar.minutesPerHour - 1}
            className={cn(inputBase, "h-8 w-16 tabular")}
            value={r.minute}
            onChange={(e) => update({ minute: Math.max(0, Math.min(calendar.minutesPerHour - 1, Number(e.target.value) || 0)) })}
          />
        </span>
      )}
      {r.era?.abbreviation && <span className="text-sm text-faint">{r.era.abbreviation}</span>}
    </div>
  );
}
