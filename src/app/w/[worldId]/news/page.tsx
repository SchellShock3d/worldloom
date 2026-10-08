import Link from "next/link";
import { EyeOff, MapPin, Newspaper } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { NEWS_CATEGORY_LABELS, worldNews, type NewsCategory, type NewsItem } from "@/server/services/news";
import { formatDate, minutesPerDay } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { TypeIcon } from "@/components/entity/type-icon";
import { NewsControls } from "./news-controls";

export const metadata = { title: "World news" };

const WINDOWS: Record<string, number> = { "7": 7, "30": 30, "90": 90, "365": 365 };
const CATEGORY_TONE: Record<NewsCategory, string> = {
  war: "text-ember",
  death: "text-ember",
  disaster: "text-ember",
  missing: "text-people",
  politics: "text-powers",
  faction: "text-powers",
  trade: "text-things",
  faith: "text-culture",
  discovery: "text-places",
  rumour: "text-lore",
  other: "text-muted",
};

export default async function NewsPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<{ days?: string; players?: string; cat?: string }> }) {
  const { worldId } = await params;
  const sp = await searchParams;
  const { world, calendar, role } = await requireWorld(worldId);
  const db = await getDb();
  const { campaign } = await getActiveCampaign(worldId);
  const days = WINDOWS[sp.days ?? ""] ?? 30;
  const playersOnly = sp.players === "1" || role === "player";
  const now = campaign?.currentAt ?? world.currentAt;
  const mpd = minutesPerDay(calendar);
  const from = now - days * mpd;

  const all = await worldNews(db, worldId, { campaignId: campaign?.id ?? null, from, to: now, playersOnly });
  const categories = Array.from(new Set(all.map((i) => i.category)));
  const cat = categories.includes(sp.cat as NewsCategory) ? (sp.cat as NewsCategory) : null;
  const items = cat ? all.filter((i) => i.category === cat) : all;

  // Group by in-world week relative to "now".
  const week = calendar.weekdays.length * mpd;
  const groups: { label: string; items: NewsItem[] }[] = [];
  for (const it of items) {
    const ago = Math.floor((now - it.at) / week);
    const label = ago <= 0 ? "This week" : ago === 1 ? "Last week" : ago < 5 ? `${ago} weeks ago` : "Earlier";
    const g = groups.at(-1);
    if (g && g.label === label) g.items.push(it);
    else groups.push({ label, items: [it] });
  }
  const lead = items.find((i) => i.source === "event") ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<Newspaper />}
        title="World news"
        description={`What has happened across ${world.name} from ${formatDate(calendar, from)} to ${formatDate(calendar, now)}${campaign ? `, as of ${campaign.name}` : ""}. Built only from canon: approved events, rumours and world threads.`}
      />
      <NewsControls days={String(days)} playersOnly={playersOnly} lockPlayers={role === "player"} categories={categories.map((c) => ({ key: c, label: NEWS_CATEGORY_LABELS[c], count: all.filter((i) => i.category === c).length }))} active={cat} />

      {items.length === 0 ? (
        <EmptyState icon={<Newspaper />} title="A quiet stretch">
          Nothing significant has been recorded in this period. Advance the world, or widen the window.
        </EmptyState>
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          {lead && !cat && (
            <article className="border-b border-line pb-6">
              <p className={cn("text-sm font-medium", CATEGORY_TONE[lead.category])}>{NEWS_CATEGORY_LABELS[lead.category]}</p>
              <Link href={`/w/${worldId}/e/${lead.entityId}`} className="mt-1 block font-serif text-3xl font-semibold leading-tight hover:text-accent">
                {lead.title}
              </Link>
              {lead.summary && <p className="mt-2 max-w-[65ch] font-serif text-lg leading-relaxed text-muted">{lead.summary}</p>}
              <Byline item={lead} worldId={worldId} date={formatDate(calendar, lead.at)} playersOnly={playersOnly} />
            </article>
          )}
          {groups.map((g) => {
            const list = g.items.filter((i) => i !== lead || !!cat);
            if (!list.length) return null;
            return (
              <section key={g.label}>
                <h2 className="mb-3 text-sm font-semibold text-faint">{g.label}</h2>
                <ul className="grid gap-x-8 gap-y-6 md:grid-cols-2">
                  {list.map((it) => (
                    <li key={it.id} className={cn(it.source === "rumour" && "border-l-2 border-lore/50 pl-4")}>
                      <p className={cn("text-xs font-medium", CATEGORY_TONE[it.category])}>
                        {it.source === "rumour" ? "Word on the street" : it.source === "thread" ? "World thread" : NEWS_CATEGORY_LABELS[it.category]}
                      </p>
                      <Link href={`/w/${worldId}/e/${it.entityId}`} className={cn("mt-0.5 block font-serif text-lg font-semibold leading-snug hover:text-accent", it.source === "rumour" && "italic")}>
                        {it.source === "rumour" ? `“${it.title}”` : it.title}
                      </Link>
                      {it.summary && <p className="mt-1 text-sm text-muted">{it.summary}</p>}
                      <Byline item={it} worldId={worldId} date={formatDate(calendar, it.at)} playersOnly={playersOnly} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Byline({ item, worldId, date, playersOnly }: { item: NewsItem; worldId: string; date: string; playersOnly: boolean }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-faint">
      <span>{date}</span>
      {item.location && (
        <Link href={`/w/${worldId}/e/${item.location.id}`} className="inline-flex items-center gap-1 hover:text-fg">
          <MapPin className="size-3" /> {item.location.name}
        </Link>
      )}
      {item.people.map((p) => (
        <Link key={p.id} href={`/w/${worldId}/e/${p.id}`} className="inline-flex items-center gap-1 hover:text-fg">
          <TypeIcon type={p.type} className="size-3" /> {p.name}
        </Link>
      ))}
      {item.accuracy !== undefined && <span title="How true this rumour is (only you see this)">{item.accuracy}% true</span>}
      {!playersOnly && !item.visibleToPlayers && (
        <span className="inline-flex items-center gap-1">
          <EyeOff className="size-3" /> players don&apos;t know
        </span>
      )}
    </p>
  );
}
