import { CalendarDays } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { listTimeline } from "@/server/services/timeline";
import { climateAt, weatherFor } from "@/server/services/weather";
import { daysInMonth, daysInYear, formatDate, minutesPerDay, resolve, toAbsolute } from "@/lib/calendar";
import { clamp } from "@/lib/utils";
import { PageHeader } from "@/components/ui/display";
import { CalendarMonth, type CalendarDay } from "./calendar-month";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<{ y?: string; m?: string; d?: string }> }) {
  const { worldId } = await params;
  const sp = await searchParams;
  const { world, calendar: cal, role } = await requireWorld(worldId);
  const db = await getDb();
  const { campaign } = await getActiveCampaign(worldId);
  const now = campaign?.currentAt ?? world.currentAt;
  const nowR = resolve(cal, now);
  const yParsed = Number.parseInt(sp.y ?? "", 10);
  const mParsed = Number.parseInt(sp.m ?? "", 10);
  const year = Number.isFinite(yParsed) ? clamp(yParsed, -100000, 100000) : nowR.year;
  const month = Number.isFinite(mParsed) ? clamp(mParsed, 0, cal.months.length - 1) : nowR.month;
  const mpd = minutesPerDay(cal);

  const yearStart = toAbsolute(cal, { year, month: 0, day: 1, hour: 0, minute: 0 });
  const yearEnd = yearStart + daysInYear(cal, year) * mpd - 1;
  const monthStart = toAbsolute(cal, { year, month, day: 1, hour: 0, minute: 0 });
  const nDays = daysInMonth(cal, year, month);
  const monthEnd = monthStart + nDays * mpd - 1;

  const yearEvents = await listTimeline(db, worldId, { campaignId: campaign?.id ?? null, from: yearStart, to: yearEnd, visibleOnly: role === "player", limit: 1000 });
  const monthCounts = cal.months.map((_, i) => {
    const s = toAbsolute(cal, { year, month: i, day: 1, hour: 0, minute: 0 });
    const e = s + daysInMonth(cal, year, i) * mpd - 1;
    return yearEvents.filter((ev) => ev.startAt <= e && (ev.endAt ?? ev.startAt) >= s).length;
  });
  const monthEvents = yearEvents.filter((ev) => ev.startAt <= monthEnd && (ev.endAt ?? ev.startAt) >= monthStart);

  const climate = campaign ? await climateAt(db, campaign.currentLocationId) : "Temperate";
  // Moon peaks: a day is "full" when its midday illumination is a local maximum (and "new" at a minimum).
  const illum = (abs: number) => resolve(cal, abs + mpd / 2).moons.map((m) => m.illumination);
  const days: CalendarDay[] = [];
  let prev = illum(monthStart - mpd);
  let cur = illum(monthStart);
  for (let d = 1; d <= nDays; d++) {
    const abs = monthStart + (d - 1) * mpd;
    const next = illum(abs + mpd);
    const r = resolve(cal, abs + mpd / 2);
    const seasonStart = cal.seasons.find((s) => s.startMonth === month && s.startDay === d)?.name ?? null;
    days.push({
      day: d,
      abs,
      weekdayIndex: r.weekdayIndex,
      weekday: r.weekday,
      label: formatDate(cal, abs, { precision: "day", weekday: true }),
      season: r.season,
      seasonStart,
      holidays: cal.holidays.filter((h) => h.month === month && h.day === d).map((h) => ({ name: h.name, description: h.description ?? "" })),
      moons: r.moons.map((m, i) => ({
        name: m.name,
        color: m.color ?? null,
        phase: m.phase,
        illumination: m.illumination,
        peak: cur[i]! >= prev[i]! && cur[i]! > next[i]! ? "full" : cur[i]! <= prev[i]! && cur[i]! < next[i]! ? "new" : null,
      })),
      weather: weatherFor(cal, abs + mpd / 2, climate, campaign?.id ?? worldId).description,
      events: monthEvents
        .filter((ev) => ev.startAt < abs + mpd && (ev.endAt ?? ev.startAt) >= abs)
        .map((ev) => ({ id: ev.id, name: ev.name, kind: ev.kind, summary: ev.summary, spans: !!ev.endAt && ev.endAt - ev.startAt >= mpd, hidden: ev.visibility === "dm_only" || ev.visibility === "secret" })),
    });
    prev = cur;
    cur = next;
  }

  const selectedDay = Number.parseInt(sp.d ?? "", 10);
  const monthDef = cal.months[month]!;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader icon={<CalendarDays />} title="Calendar" description={`The ${cal.months.length}-month calendar of ${world.name}: holidays, seasons, moons and events. Edit the calendar itself in world settings.`} />
      <CalendarMonth
        year={year}
        month={month}
        yearLabel={formatDate(cal, monthStart, { precision: "year" })}
        monthName={monthDef.name}
        intercalary={!!monthDef.intercalary}
        months={cal.months.map((m, i) => ({ name: m.name, intercalary: !!m.intercalary, count: monthCounts[i]! }))}
        weekdays={cal.weekdays}
        days={days}
        now={{ year: nowR.year, month: nowR.month, day: nowR.day, abs: now, label: formatDate(cal, now, { precision: "minute" }) }}
        minuteOfDay={((now % mpd) + mpd) % mpd}
        initialDay={Number.isFinite(selectedDay) ? clamp(selectedDay, 1, nDays) : year === nowR.year && month === nowR.month ? nowR.day : 1}
        campaign={campaign ? { id: campaign.id, name: campaign.name } : null}
        climate={campaign ? climate : null}
        canEdit={role === "owner" || role === "editor"}
      />
    </div>
  );
}
