import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { pickPlayerCampaign, playerEntity } from "@/server/services/player-view";
import { Markdown } from "@/components/common/markdown";
import { TypeIcon } from "@/components/entity/type-icon";

export const metadata = { title: "Player portal" };

export default async function PlayerEntityPage({ params, searchParams }: { params: Promise<{ worldId: string; entityId: string }>; searchParams: Promise<{ c?: string }> }) {
  const { worldId, entityId } = await params;
  const { c } = await searchParams;
  await requireWorld(worldId, "player");
  const db = await getDb();
  const { campaign } = await pickPlayerCampaign(db, worldId, c);
  const d = await playerEntity(db, worldId, campaign, entityId);
  if (!d) notFound();
  const q = campaign ? `?c=${campaign.id}` : "";
  const base = `/play/${worldId}/e`;
  return (
    <article className="flex flex-col gap-6">
      <Link href={`/play/${worldId}${q}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" /> What you know
      </Link>
      <header className="flex flex-col-reverse gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
        {d.chain.length > 0 && (
          <nav aria-label="Where" className="mb-1 flex flex-wrap items-center gap-1 text-xs text-faint">
            {d.chain.map((p, i) => (
              <span key={p.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3" />}
                <Link href={`${base}/${p.id}${q}`} className="hover:text-fg">
                  {p.name}
                </Link>
              </span>
            ))}
          </nav>
        )}
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <TypeIcon type={d.entity.type} /> {d.label}
          {d.entity.status && <span className="text-faint">· {d.entity.status}</span>}
        </p>
        <h1 className="font-serif text-4xl font-semibold leading-tight">{d.entity.name}</h1>
        {d.entity.aliases.length > 0 && <p className="text-sm text-faint">Also known as {d.entity.aliases.join(", ")}</p>}
        {d.entity.summary && <p className="mt-2 max-w-[65ch] font-serif text-lg text-muted">{d.entity.summary}</p>}
        {d.entity.partial && <p className="mt-2 text-sm text-brass">You only know part of the story.</p>}
        </div>
        {d.entity.imageFileId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${d.entity.imageFileId}`} alt={`Picture of ${d.entity.name}`} className="size-32 shrink-0 rounded-xl border border-line object-cover" />
        )}
      </header>
      {d.fields.length > 0 && (
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {d.fields.map((f) => (
            <div key={f.label}>
              <dt className="text-xs text-faint">{f.label}</dt>
              <dd className="text-sm">{f.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {d.body.trim() && (
        <Markdown refs={d.refs} playerView linkBase={base}>
          {d.body}
        </Markdown>
      )}
      {d.relationships.length > 0 && (
        <section>
          <h2 className="mb-2 text-md font-semibold">Ties</h2>
          <ul className="flex flex-col gap-1">
            {d.relationships.map((r) => (
              <li key={r.id} className="text-sm">
                <span className="text-muted">{r.label}</span>{" "}
                <Link href={`${base}/${r.other.id}${q}`} className="font-medium hover:text-accent">
                  {r.other.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {d.inside.length > 0 && (
        <section>
          <h2 className="mb-2 text-md font-semibold">Here</h2>
          <ul className="flex flex-col gap-1">
            {d.inside.map((x) => (
              <li key={x.id}>
                <Link href={`${base}/${x.id}${q}`} className="flex items-center gap-1.5 text-sm hover:text-accent">
                  <TypeIcon type={x.type} className="size-3.5" /> {x.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
