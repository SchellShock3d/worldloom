import Link from "next/link";
import { CheckCircle2, Circle, Compass, MapPin, XCircle } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { pickPlayerCampaign, playerOverview } from "@/server/services/player-view";
import { formatDate } from "@/lib/calendar";
import { ENTITY_GROUPS, getEntityType } from "@/lib/entity-types";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/common/markdown";
import { TypeIcon } from "@/components/entity/type-icon";

export const metadata = { title: "Player portal" };

export default async function PlayerHome({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<{ c?: string }> }) {
  const { worldId } = await params;
  const { c } = await searchParams;
  const { calendar } = await requireWorld(worldId, "player");
  const db = await getDb();
  const { campaign, all } = await pickPlayerCampaign(db, worldId, c);
  const data = await playerOverview(db, worldId, campaign);
  const q = campaign ? `?c=${campaign.id}` : "";
  const base = `/play/${worldId}/e`;
  const refs = Object.fromEntries([...data.known.entries()].map(([id, k]) => [id, { name: k.name, type: k.type, summary: k.summary }]));
  const byGroup = ENTITY_GROUPS.map((g) => ({
    ...g,
    items: [...data.known.entries()]
      .filter(([, k]) => getEntityType(k.type).group === g.key && !["quest", "rumour", "event", "pc"].includes(k.type))
      .map(([id, k]) => ({ id, ...k }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length);

  return (
    <div className="flex flex-col gap-12">
      <section>
        {all.length > 1 && (
          <nav aria-label="Campaigns" className="mb-4 flex flex-wrap gap-1.5 text-sm">
            {all.map((x) => (
              <Link key={x.id} href={`/play/${worldId}?c=${x.id}`} aria-current={x.id === campaign?.id ? "page" : undefined} className={cn("rounded-full border px-3 py-1", x.id === campaign?.id ? "border-brass/60 bg-brass-soft text-fg" : "border-line text-muted hover:text-fg")}>
                {x.name}
              </Link>
            ))}
          </nav>
        )}
        <p className="flex items-center gap-1.5 text-sm text-brass">
          <Compass className="size-4" /> {campaign ? campaign.name : "The world"}
        </p>
        <h1 className="mt-1 font-serif text-4xl font-semibold leading-tight">{campaign ? formatDate(calendar, campaign.currentAt, { weekday: true }) : "Welcome"}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 text-md text-muted">
          {data.location && (
            <Link href={`${base}/${data.location.id}${q}`} className="inline-flex items-center gap-1 hover:text-fg">
              <MapPin className="size-4" /> {data.location.name}
            </Link>
          )}
          {campaign?.currentWeather && <span>{campaign.currentWeather}</span>}
        </p>
        {data.party.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {data.party.map((p) => (
              <li key={p.id} className="rounded-lg border border-line bg-surface px-3 py-2">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted">{[p.className, p.level ? `level ${p.level}` : ""].filter(Boolean).join(", ")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.recaps.length > 0 && (
        <section>
          <h2 className="mb-3 font-serif text-2xl font-semibold">Previously</h2>
          <div className="flex flex-col gap-6">
            {data.recaps.map((r, i) => (
              <article key={r.id} className={cn(i > 0 && "border-t border-line pt-5")}>
                <p className="mb-1 text-sm text-faint">
                  Session {r.number}
                  {r.title ? `: ${r.title}` : ""}
                </p>
                <Markdown refs={refs} playerView linkBase={base} variant={i === 0 ? "lore" : "compact"}>
                  {r.recap}
                </Markdown>
              </article>
            ))}
          </div>
        </section>
      )}

      {data.quests.length > 0 && (
        <section>
          <h2 className="mb-3 font-serif text-2xl font-semibold">Quests</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.quests.map((qq) => (
              <li key={qq.id} className={cn("rounded-lg border border-line bg-surface p-4", (qq.status === "completed" || qq.status === "failed") && "opacity-70")}>
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={`${base}/${qq.id}${q}`} className="font-serif text-lg font-semibold hover:text-accent">
                    {qq.name}
                  </Link>
                  <span className="text-xs capitalize text-faint">{qq.status}</span>
                </div>
                {qq.giver && <p className="text-xs text-faint">From {qq.giver.name}</p>}
                <p className="mt-1 text-sm text-muted">{qq.playerKnowledge || qq.summary}</p>
                {qq.objectives.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {qq.objectives.map((o) => (
                      <li key={o.id} className={cn("flex items-start gap-1.5 text-sm", o.status !== "open" && "text-faint line-through")}>
                        {o.status === "done" ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-accent" /> : o.status === "failed" ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-ember" /> : <Circle className="mt-0.5 size-3.5 shrink-0 text-faint" />}
                        {o.text}
                      </li>
                    ))}
                  </ul>
                )}
                {qq.rewards && <p className="mt-2 text-xs text-brass">Reward: {qq.rewards}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.rumours.length > 0 && (
        <section>
          <h2 className="mb-3 font-serif text-2xl font-semibold">Things you&apos;ve heard</h2>
          <ul className="flex flex-col gap-3">
            {data.rumours.map((r) => (
              <li key={r.id} className="border-l-2 border-lore/50 pl-4">
                <p className="font-serif text-lg italic">&ldquo;{r.claim}&rdquo;</p>
                <p className="text-xs text-faint">
                  {r.location ? `Heard in ${r.location.name}` : "Word going around"}
                  {r.startedAt !== null ? ` · since ${formatDate(calendar, r.startedAt)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {byGroup.length > 0 && (
        <section>
          <h2 className="mb-3 font-serif text-2xl font-semibold">Who and what you know</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {byGroup.map((g) => (
              <div key={g.key}>
                <h3 className="mb-1.5 text-sm font-semibold text-muted">{g.label}</h3>
                <ul className="flex flex-col gap-1">
                  {g.items.map((it) => (
                    <li key={it.id}>
                      <Link href={`${base}/${it.id}${q}`} className="group flex items-start gap-2 rounded px-1 py-0.5 hover:bg-surface-2">
                        <TypeIcon type={it.type} className="mt-0.5 size-3.5" />
                        <span className="min-w-0">
                          <span className="font-medium group-hover:text-accent">{it.name}</span>
                          {it.summary && <span className="block truncate text-xs text-muted">{it.summary}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.timeline.length > 0 && (
        <section>
          <h2 className="mb-3 font-serif text-2xl font-semibold">What has happened</h2>
          <ol className="flex flex-col gap-2 border-l border-line-strong pl-4">
            {data.timeline.map((e) => (
              <li key={e.id}>
                <p className="text-xs text-brass">{formatDate(calendar, e.startAt, { precision: e.precision === "minute" ? "day" : e.precision })}</p>
                <Link href={`${base}/${e.id}${q}`} className="font-medium hover:text-accent">
                  {e.name}
                </Link>
                {e.summary && <p className="text-sm text-muted">{e.summary}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.known.size === 0 && <p className="text-muted">Nothing has been revealed yet. Your DM will share more as you play.</p>}
    </div>
  );
}
