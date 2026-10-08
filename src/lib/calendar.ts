/**
 * Custom fantasy calendar engine.
 *
 * In-world time is stored everywhere as an integer count of minutes since the
 * calendar epoch (absolute minute 0 = first day of `firstYear`, 00:00). Integers
 * sort and index in SQL, survive calendar edits, and make "advance 3 days"
 * trivial. This module converts between absolute minutes and calendar parts.
 *
 * Negative values are allowed (deep history before the epoch); all division
 * uses floor semantics so dates before the epoch resolve correctly.
 */
import { z } from "zod";

export const calendarMonthSchema = z.object({
  name: z.string().min(1).max(60),
  days: z.number().int().min(1).max(400),
  /** Festival / intercalary days that sit outside the regular weeks' naming (still counted). */
  intercalary: z.boolean().optional(),
});

export const calendarDefinitionSchema = z.object({
  minutesPerHour: z.number().int().min(1).max(1000).default(60),
  hoursPerDay: z.number().int().min(1).max(100).default(24),
  months: z.array(calendarMonthSchema).min(1).max(40),
  weekdays: z.array(z.string().min(1).max(40)).min(1).max(20),
  /** Year number of absolute day 0. */
  firstYear: z.number().int().default(1),
  /** Weekday index (0-based) of absolute day 0. */
  epochWeekday: z.number().int().min(0).default(0),
  leapYear: z
    .object({
      every: z.number().int().min(2).max(1000),
      monthIndex: z.number().int().min(0),
      extraDays: z.number().int().min(1).max(30),
    })
    .nullable()
    .optional(),
  eras: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        abbreviation: z.string().max(12).default(""),
        startYear: z.number().int(),
      }),
    )
    .default([]),
  seasons: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        /** 0-based month index */
        startMonth: z.number().int().min(0),
        /** 1-based day of month */
        startDay: z.number().int().min(1),
      }),
    )
    .default([]),
  holidays: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        month: z.number().int().min(0),
        day: z.number().int().min(1),
        description: z.string().max(500).optional(),
      }),
    )
    .default([]),
  moons: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        cycleDays: z.number().min(1).max(10000),
        /** Day (absolute) on which this moon was full. */
        fullMoonOffset: z.number().default(0),
        color: z.string().max(20).optional(),
      }),
    )
    .default([]),
});

export type CalendarDefinition = z.infer<typeof calendarDefinitionSchema>;

export interface DateParts {
  year: number;
  /** 0-based month index */
  month: number;
  /** 1-based day of month */
  day: number;
  hour: number;
  minute: number;
}

export interface ResolvedDate extends DateParts {
  absoluteDay: number;
  dayOfYear: number; // 1-based
  weekdayIndex: number | null; // null on intercalary days
  weekday: string | null;
  monthName: string;
  era: { name: string; abbreviation: string; yearOfEra: number } | null;
  season: string | null;
  holidays: string[];
  moons: { name: string; phase: MoonPhase; illumination: number; color?: string }[];
}

export type MoonPhase =
  | "new"
  | "waxing crescent"
  | "first quarter"
  | "waxing gibbous"
  | "full"
  | "waning gibbous"
  | "last quarter"
  | "waning crescent";

const floorDiv = (a: number, b: number) => Math.floor(a / b);
const mod = (a: number, b: number) => ((a % b) + b) % b;

export function minutesPerDay(cal: CalendarDefinition) {
  return cal.minutesPerHour * cal.hoursPerDay;
}

function baseYearLength(cal: CalendarDefinition) {
  return cal.months.reduce((s, m) => s + m.days, 0);
}

/** `relYear` is the year index relative to firstYear (0 = firstYear). */
function isLeap(cal: CalendarDefinition, relYear: number) {
  if (!cal.leapYear) return false;
  // Leap years fall on the last year of each cycle, so year 0 is never leap.
  return mod(relYear + 1, cal.leapYear.every) === 0;
}

function yearLength(cal: CalendarDefinition, relYear: number) {
  return baseYearLength(cal) + (isLeap(cal, relYear) ? cal.leapYear!.extraDays : 0);
}

function monthLength(cal: CalendarDefinition, relYear: number, monthIndex: number) {
  const m = cal.months[monthIndex];
  if (!m) throw new Error(`Month index ${monthIndex} out of range`);
  const leapExtra =
    cal.leapYear && isLeap(cal, relYear) && cal.leapYear.monthIndex === monthIndex
      ? cal.leapYear.extraDays
      : 0;
  return m.days + leapExtra;
}

/** Absolute day number of the first day of a relative year. */
function daysBeforeYear(cal: CalendarDefinition, relYear: number) {
  const base = baseYearLength(cal);
  if (!cal.leapYear) return relYear * base;
  const every = cal.leapYear.every;
  // number of leap years in [0, relYear)
  const leapsBefore = (y: number) => floorDiv(y, every);
  return relYear * base + leapsBefore(relYear) * cal.leapYear.extraDays;
}

function relYearOfDay(cal: CalendarDefinition, absDay: number) {
  const base = baseYearLength(cal);
  let y = floorDiv(absDay, base + (cal.leapYear ? cal.leapYear.extraDays / cal.leapYear.every : 0));
  // correct the estimate
  while (daysBeforeYear(cal, y) > absDay) y--;
  while (daysBeforeYear(cal, y + 1) <= absDay) y++;
  return y;
}

export function toAbsolute(cal: CalendarDefinition, parts: Partial<DateParts> & { year: number }): number {
  const relYear = parts.year - cal.firstYear;
  const month = parts.month ?? 0;
  const day = parts.day ?? 1;
  if (month < 0 || month >= cal.months.length) throw new Error("Invalid month");
  const mLen = monthLength(cal, relYear, month);
  if (day < 1 || day > mLen) throw new Error(`Day must be between 1 and ${mLen}`);
  let absDay = daysBeforeYear(cal, relYear);
  for (let i = 0; i < month; i++) absDay += monthLength(cal, relYear, i);
  absDay += day - 1;
  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;
  return absDay * minutesPerDay(cal) + hour * cal.minutesPerHour + minute;
}

export function moonPhase(cycleDays: number, fullMoonOffset: number, absDayFraction: number) {
  // position 0 = full, 0.5 = new
  const pos = mod(absDayFraction - fullMoonOffset, cycleDays) / cycleDays;
  const illumination = (Math.cos(pos * 2 * Math.PI) + 1) / 2;
  // map to 8 phases where 0 = full
  const idx = Math.round(pos * 8) % 8;
  const phases: MoonPhase[] = [
    "full",
    "waning gibbous",
    "last quarter",
    "waning crescent",
    "new",
    "waxing crescent",
    "first quarter",
    "waxing gibbous",
  ];
  return { phase: phases[idx]!, illumination: Math.round(illumination * 100) / 100 };
}

export function resolve(cal: CalendarDefinition, absoluteMinutes: number): ResolvedDate {
  const mpd = minutesPerDay(cal);
  const absDay = floorDiv(absoluteMinutes, mpd);
  const minuteOfDay = mod(absoluteMinutes, mpd);
  const relYear = relYearOfDay(cal, absDay);
  let dayInYear = absDay - daysBeforeYear(cal, relYear); // 0-based
  const dayOfYear = dayInYear + 1;
  let month = 0;
  while (month < cal.months.length - 1 && dayInYear >= monthLength(cal, relYear, month)) {
    dayInYear -= monthLength(cal, relYear, month);
    month++;
  }
  const day = dayInYear + 1;
  const monthDef = cal.months[month]!;
  const year = relYear + cal.firstYear;

  // Weekdays skip intercalary days: count regular days since epoch.
  let weekdayIndex: number | null = null;
  if (!monthDef.intercalary) {
    const intercalaryPerYear = cal.months.filter((m) => m.intercalary).reduce((s, m) => s + m.days, 0);
    let regularDays: number;
    if (intercalaryPerYear === 0) {
      regularDays = absDay;
    } else {
      // regular days before this year + regular days so far this year
      const yearStart = daysBeforeYear(cal, relYear);
      let regularThisYear = 0;
      for (let i = 0; i < month; i++) if (!cal.months[i]!.intercalary) regularThisYear += monthLength(cal, relYear, i);
      regularThisYear += day - 1;
      regularDays = yearStart - relYear * intercalaryPerYear + regularThisYear;
    }
    weekdayIndex = mod(regularDays + cal.epochWeekday, cal.weekdays.length);
  }

  const eras = [...cal.eras].sort((a, b) => a.startYear - b.startYear);
  let era: ResolvedDate["era"] = null;
  for (const e of eras) {
    if (year >= e.startYear) era = { name: e.name, abbreviation: e.abbreviation, yearOfEra: year - e.startYear + 1 };
  }

  let season: string | null = null;
  if (cal.seasons.length) {
    const sorted = [...cal.seasons].sort((a, b) => a.startMonth - b.startMonth || a.startDay - b.startDay);
    const key = month * 1000 + day;
    season = sorted[sorted.length - 1]!.name; // wraps from previous year
    for (const s of sorted) if (key >= s.startMonth * 1000 + s.startDay) season = s.name;
  }

  const holidays = cal.holidays.filter((h) => h.month === month && h.day === day).map((h) => h.name);
  const dayFraction = absDay + minuteOfDay / mpd;
  const moons = cal.moons.map((m) => ({ name: m.name, color: m.color, ...moonPhase(m.cycleDays, m.fullMoonOffset, dayFraction) }));

  return {
    year,
    month,
    day,
    hour: Math.floor(minuteOfDay / cal.minutesPerHour),
    minute: minuteOfDay % cal.minutesPerHour,
    absoluteDay: absDay,
    dayOfYear,
    weekdayIndex,
    weekday: weekdayIndex === null ? null : cal.weekdays[weekdayIndex]!,
    monthName: monthDef.name,
    era,
    season,
    holidays,
    moons,
  };
}

export type DatePrecision = "year" | "month" | "day" | "minute";

export function formatDate(
  cal: CalendarDefinition,
  absoluteMinutes: number,
  opts: { precision?: DatePrecision; weekday?: boolean; era?: boolean } = {},
): string {
  const r = resolve(cal, absoluteMinutes);
  const precision = opts.precision ?? "day";
  const yearStr = opts.era === false ? String(r.year) : formatYear(r);
  if (precision === "year") return yearStr;
  if (precision === "month") return `${r.monthName}, ${yearStr}`;
  const monthDef = cal.months[r.month]!;
  const dayPart = monthDef.intercalary && monthDef.days === 1 ? r.monthName : `${r.day} ${r.monthName}`;
  let s = `${dayPart}, ${yearStr}`;
  if (opts.weekday && r.weekday) s = `${r.weekday}, ${s}`;
  if (precision === "minute") s += `, ${formatTime(cal, absoluteMinutes)}`;
  return s;
}

function formatYear(r: ResolvedDate) {
  if (r.era?.abbreviation) return `${r.era.yearOfEra} ${r.era.abbreviation}`;
  return `Year ${r.year}`;
}

export function formatShortDate(cal: CalendarDefinition, absoluteMinutes: number) {
  const r = resolve(cal, absoluteMinutes);
  const monthDef = cal.months[r.month]!;
  return monthDef.intercalary && monthDef.days === 1 ? r.monthName : `${r.day} ${r.monthName}`;
}

export function formatTime(cal: CalendarDefinition, absoluteMinutes: number) {
  const r = resolve(cal, absoluteMinutes);
  const hh = String(r.hour).padStart(2, "0");
  const mm = String(r.minute).padStart(Math.max(2, String(cal.minutesPerHour - 1).length), "0");
  return `${hh}:${mm}`;
}

/** Human description of the hour, e.g. "dawn", "night". Assumes a 24-hour-like day. */
export function timeOfDay(cal: CalendarDefinition, absoluteMinutes: number) {
  const r = resolve(cal, absoluteMinutes);
  const f = (r.hour + r.minute / cal.minutesPerHour) / cal.hoursPerDay;
  if (f < 0.2) return "night";
  if (f < 0.27) return "dawn";
  if (f < 0.48) return "morning";
  if (f < 0.56) return "midday";
  if (f < 0.75) return "afternoon";
  if (f < 0.83) return "dusk";
  return "evening";
}

export type AdvanceUnit = "minutes" | "hours" | "days" | "weeks" | "months" | "years";

/** Duration in minutes; months/years use calendar-average lengths when not anchored. */
export function durationToMinutes(cal: CalendarDefinition, amount: number, unit: AdvanceUnit, from?: number): number {
  const mpd = minutesPerDay(cal);
  switch (unit) {
    case "minutes":
      return Math.round(amount);
    case "hours":
      return Math.round(amount * cal.minutesPerHour);
    case "days":
      return Math.round(amount * mpd);
    case "weeks":
      return Math.round(amount * cal.weekdays.length * mpd);
    case "months":
    case "years": {
      if (from !== undefined && Number.isInteger(amount)) {
        const r = resolve(cal, from);
        let { year, month } = r;
        const regularMonths = cal.months.length;
        const steps = unit === "years" ? amount * regularMonths : amount;
        month += steps;
        year += floorDiv(month, regularMonths);
        month = mod(month, regularMonths);
        const relYear = year - cal.firstYear;
        const day = Math.min(r.day, monthLength(cal, relYear, month));
        return toAbsolute(cal, { year, month, day, hour: r.hour, minute: r.minute }) - from;
      }
      const avgMonth = baseYearLength(cal) / cal.months.length;
      const days = unit === "years" ? amount * baseYearLength(cal) : amount * avgMonth;
      return Math.round(days * mpd);
    }
  }
}

/** "3 days, 4 hours" style description of a duration. */
export function describeDuration(cal: CalendarDefinition, minutes: number): string {
  const mpd = minutesPerDay(cal);
  const neg = minutes < 0;
  let m = Math.abs(minutes);
  const days = Math.floor(m / mpd);
  m -= days * mpd;
  const hours = Math.floor(m / cal.minutesPerHour);
  m -= hours * cal.minutesPerHour;
  const parts: string[] = [];
  const week = cal.weekdays.length;
  if (days >= week && days % week === 0 && days < week * 8) parts.push(plural(days / week, "week"));
  else if (days) parts.push(plural(days, "day"));
  if (hours) parts.push(plural(hours, "hour"));
  if (m && days === 0) parts.push(plural(m, "minute"));
  const s = parts.length ? parts.join(", ") : "no time";
  return neg ? `-${s}` : s;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Number of days in a given month of a given (absolute) year. */
export function daysInMonth(cal: CalendarDefinition, year: number, month: number) {
  return monthLength(cal, year - cal.firstYear, month);
}

export function daysInYear(cal: CalendarDefinition, year: number) {
  return yearLength(cal, year - cal.firstYear);
}

// ---------------------------------------------------------------------------
// Presets (original names; not taken from any published setting)
// ---------------------------------------------------------------------------

export const CALENDAR_PRESETS: Record<string, { label: string; description: string; definition: CalendarDefinition }> = {
  wheel: {
    label: "The Turning Wheel",
    description: "Twelve 30-day months, a seven-day week, and five festival days at year's end. Two moons.",
    definition: {
      minutesPerHour: 60,
      hoursPerDay: 24,
      firstYear: 1,
      epochWeekday: 0,
      leapYear: null,
      months: [
        { name: "Frostwane", days: 30 },
        { name: "Thawmere", days: 30 },
        { name: "Seedwake", days: 30 },
        { name: "Rainmoot", days: 30 },
        { name: "Bloomrise", days: 30 },
        { name: "Highsun", days: 30 },
        { name: "Goldmere", days: 30 },
        { name: "Harvestide", days: 30 },
        { name: "Leafturn", days: 30 },
        { name: "Mistfall", days: 30 },
        { name: "Duskwane", days: 30 },
        { name: "Longnight", days: 30 },
        { name: "Yearturn", days: 5, intercalary: true },
      ],
      weekdays: ["Sunsday", "Moonsday", "Hearthday", "Tideday", "Stoneday", "Embersday", "Restday"],
      eras: [{ name: "Age of Embers", abbreviation: "AE", startYear: 1 }],
      seasons: [
        { name: "Spring", startMonth: 2, startDay: 1 },
        { name: "Summer", startMonth: 5, startDay: 1 },
        { name: "Autumn", startMonth: 8, startDay: 1 },
        { name: "Winter", startMonth: 11, startDay: 1 },
      ],
      holidays: [
        { name: "First Thaw", month: 1, day: 15, description: "Bonfires mark the breaking of the ice." },
        { name: "Midsummer Vigil", month: 5, day: 15 },
        { name: "Harvest Moot", month: 7, day: 30 },
        { name: "Night of Lanterns", month: 11, day: 30 },
      ],
      moons: [
        { name: "The Pale Lady", cycleDays: 30, fullMoonOffset: 14, color: "#d8dde8" },
        { name: "Ember", cycleDays: 47, fullMoonOffset: 3, color: "#e0905a" },
      ],
    },
  },
  gregorian: {
    label: "Gregorian",
    description: "Real-world months and weekdays with a leap day every four years. Good for modern or historical settings.",
    definition: {
      minutesPerHour: 60,
      hoursPerDay: 24,
      firstYear: 1,
      epochWeekday: 0,
      leapYear: { every: 4, monthIndex: 1, extraDays: 1 },
      months: [
        { name: "January", days: 31 },
        { name: "February", days: 28 },
        { name: "March", days: 31 },
        { name: "April", days: 30 },
        { name: "May", days: 31 },
        { name: "June", days: 30 },
        { name: "July", days: 31 },
        { name: "August", days: 31 },
        { name: "September", days: 30 },
        { name: "October", days: 31 },
        { name: "November", days: 30 },
        { name: "December", days: 31 },
      ],
      weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      eras: [{ name: "Common Era", abbreviation: "CE", startYear: 1 }],
      seasons: [
        { name: "Spring", startMonth: 2, startDay: 20 },
        { name: "Summer", startMonth: 5, startDay: 21 },
        { name: "Autumn", startMonth: 8, startDay: 22 },
        { name: "Winter", startMonth: 11, startDay: 21 },
      ],
      holidays: [],
      moons: [{ name: "Moon", cycleDays: 29.53, fullMoonOffset: 0 }],
    },
  },
  tenday: {
    label: "Ten-day weeks",
    description: "Ten months of 36 days, a ten-day week, and a single moon. Simple to reckon at the table.",
    definition: {
      minutesPerHour: 60,
      hoursPerDay: 24,
      firstYear: 1,
      epochWeekday: 0,
      leapYear: null,
      months: Array.from({ length: 10 }, (_, i) => ({ name: `Month ${i + 1}`, days: 36 })),
      weekdays: ["Firstday", "Secondday", "Thirdday", "Fourthday", "Fifthday", "Sixthday", "Seventhday", "Eighthday", "Ninthday", "Tenthday"],
      eras: [],
      seasons: [
        { name: "Spring", startMonth: 1, startDay: 1 },
        { name: "Summer", startMonth: 4, startDay: 1 },
        { name: "Autumn", startMonth: 6, startDay: 1 },
        { name: "Winter", startMonth: 9, startDay: 1 },
      ],
      holidays: [],
      moons: [{ name: "Moon", cycleDays: 30, fullMoonOffset: 0 }],
    },
  },
};

export const DEFAULT_CALENDAR = CALENDAR_PRESETS.wheel!.definition;

/** Problems that make a calendar unusable, in plain words. */
export function calendarProblems(c: CalendarDefinition): string[] {
  const out: string[] = [];
  const n = c.months.length;
  if (!n) out.push("Add at least one month.");
  if (!c.weekdays.length) out.push("Add at least one weekday.");
  if (c.epochWeekday >= c.weekdays.length) out.push("The first weekday is out of range.");
  if (c.leapYear && c.leapYear.monthIndex >= n) out.push("The leap-day month doesn't exist.");
  for (const s of c.seasons) {
    const m = c.months[s.startMonth];
    if (!m) out.push(`Season "${s.name}" starts in a month that doesn't exist.`);
    else if (s.startDay > m.days) out.push(`Season "${s.name}" starts on day ${s.startDay}, but ${m.name} has ${m.days} days.`);
  }
  for (const h of c.holidays) {
    const m = c.months[h.month];
    if (!m) out.push(`Holiday "${h.name}" is in a month that doesn't exist.`);
    else if (h.day > m.days + (c.leapYear?.monthIndex === h.month ? c.leapYear.extraDays : 0)) out.push(`Holiday "${h.name}" is on day ${h.day}, but ${m.name} has ${m.days} days.`);
  }
  const names = c.months.map((m) => m.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) out.push("Two months share a name.");
  return out;
}

/** Would this edit move stored absolute times to different named dates? */
export function isStructuralChange(a: CalendarDefinition, b: CalendarDefinition) {
  if (a.months.length !== b.months.length || a.hoursPerDay !== b.hoursPerDay || a.minutesPerHour !== b.minutesPerHour || a.firstYear !== b.firstYear) return true;
  if (a.months.some((m, i) => m.days !== b.months[i]!.days)) return true;
  return JSON.stringify(a.leapYear ?? null) !== JSON.stringify(b.leapYear ?? null);
}

