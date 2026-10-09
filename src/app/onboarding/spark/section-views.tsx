"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/display";
import { Markdown } from "@/components/common/markdown";
import type { SectionData, SectionKey } from "@/lib/spark-schema";
import { cn } from "@/lib/utils";

function Remove({ label, onClick }: { label: string; onClick?: () => void }) {
  if (!onClick) return null;
  return (
    <button type="button" onClick={onClick} aria-label={`Remove ${label}`} title={`Remove ${label}`} className="shrink-0 rounded p-0.5 text-faint hover:bg-surface-3 hover:text-ember focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
      <X className="size-3.5" />
    </button>
  );
}

function Group({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h4 className="mb-2 text-sm font-semibold text-muted">{title}</h4>
      {children}
    </div>
  );
}

function Item({ name, meta, children, onRemove, className }: { name: string; meta?: React.ReactNode; children?: React.ReactNode; onRemove?: () => void; className?: string }) {
  return (
    <li className={cn("group rounded-lg border border-line px-3 py-2.5", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="font-medium">{name}</span>
          {meta && <span className="ml-2 text-xs text-faint">{meta}</span>}
        </div>
        <Remove label={name} onClick={onRemove} />
      </div>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </li>
  );
}

const PREV_TONE: Record<string, "accent" | "brass" | "neutral" | "outline"> = { Common: "accent", Uncommon: "brass", Rare: "neutral", "Very rare": "outline", Legendary: "outline" };
const without = <T,>(xs: T[], i: number) => xs.filter((_, j) => j !== i);

/** A readable view of one draft section. With `onChange`, items can be removed one at a time. */
export function SectionView<K extends SectionKey>({ k, data, onChange }: { k: K; data: SectionData[K]; onChange?: (d: SectionData[K]) => void }) {
  const set = onChange as ((d: unknown) => void) | undefined;
  switch (k) {
    case "overview": {
      const d = data as SectionData["overview"];
      return (
        <div className="flex flex-col gap-4">
          <div>
            <p className="font-serif text-3xl font-semibold leading-tight">{d.name}</p>
            <p className="mt-1 text-md">{d.logline}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[d.genre, d.tone, `${d.magicLevel} magic`, d.techLevel, d.worldShape].filter(Boolean).map((t) => (
                <Badge key={t} tone="outline" className="max-w-full" title={t}>
                  <span className="min-w-0 truncate">{t}</span>
                </Badge>
              ))}
            </div>
          </div>
          <Markdown variant="lore">{d.overview}</Markdown>
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
            <dt className="text-faint">Central conflict</dt>
            <dd>{d.conflict}</dd>
            <dt className="text-faint">Themes</dt>
            <dd>{d.themes}</dd>
            <dt className="text-faint">Magic</dt>
            <dd>
              {d.magicSources.join(", ")}
              {d.magicAttitude ? `; seen as ${d.magicAttitude.toLowerCase()}` : ""}
            </dd>
          </dl>
          {d.secret && (
            <p className="rounded-md border border-ember/30 bg-ember-soft/40 px-3 py-2 text-sm">
              <span className="font-medium text-ember">DM secret:</span> {d.secret}
            </p>
          )}
        </div>
      );
    }
    case "land": {
      const d = data as SectionData["land"];
      return (
        <div className="flex flex-col gap-5">
          <Group title={d.landmasses.length === 1 ? "Landmass" : "Landmasses"}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {d.landmasses.map((m, i) => (
                <Item key={m.name + i} name={m.name} onRemove={set && d.landmasses.length > 1 ? () => set({ ...d, landmasses: without(d.landmasses, i) }) : undefined}>
                  {m.summary}
                </Item>
              ))}
            </ul>
          </Group>
          <Group title="Regions">
            <ul className="grid gap-2 sm:grid-cols-2">
              {d.regions.map((r, i) => (
                <Item key={r.name + i} name={r.name} meta={`${r.climate} · ${r.terrain}`} onRemove={set && d.regions.length > 1 ? () => set({ ...d, regions: without(d.regions, i) }) : undefined}>
                  {r.summary}
                  {r.danger && <span className="mt-1 block text-faint">Danger: {r.danger}</span>}
                </Item>
              ))}
            </ul>
          </Group>
          {d.landmarks.length > 0 && (
            <Group title="Landmarks">
              <ul className="grid gap-2 sm:grid-cols-2">
                {d.landmarks.map((l, i) => (
                  <Item key={l.name + i} name={l.name} meta={l.region} onRemove={set ? () => set({ ...d, landmarks: without(d.landmarks, i) }) : undefined}>
                    {l.summary}
                  </Item>
                ))}
              </ul>
            </Group>
          )}
        </div>
      );
    }
    case "peoples":
      return <PeoplesView d={data as SectionData["peoples"]} set={set} />;
    case "powers": {
      const d = data as SectionData["powers"];
      return (
        <div className="flex flex-col gap-5">
          <Group title="Nations">
            <ul className="grid gap-2 sm:grid-cols-2">
              {d.nations.map((n, i) => (
                <Item key={n.name + i} name={n.name} meta={n.region} onRemove={set && d.nations.length > 1 ? () => set({ ...d, nations: without(d.nations, i) }) : undefined}>
                  {n.summary}
                  <span className="mt-1 block text-faint">
                    {n.government}
                    {n.ruler ? `, ruled by ${n.ruler}` : ""}
                  </span>
                  {n.demographics && <span className="mt-0.5 block text-faint">{n.demographics}</span>}
                </Item>
              ))}
            </ul>
          </Group>
          <Group title="Factions">
            <ul className="grid gap-2 sm:grid-cols-2">
              {d.factions.map((f, i) => (
                <Item key={f.name + i} name={f.name} meta={`${f.kind}${f.base ? `, ${f.base}` : ""}`} onRemove={set ? () => set({ ...d, factions: without(d.factions, i) }) : undefined}>
                  {f.summary}
                  <span className="mt-1 block">Goal: {f.goal}</span>
                  {f.secret && <span className="mt-1 block text-ember/90">Secret: {f.secret}</span>}
                </Item>
              ))}
            </ul>
          </Group>
          {d.religions.length > 0 && (
            <Group title="Faiths">
              <ul className="grid gap-2 sm:grid-cols-2">
                {d.religions.map((r, i) => (
                  <Item key={r.name + i} name={r.name} onRemove={set ? () => set({ ...d, religions: without(d.religions, i) }) : undefined}>
                    {r.summary}
                    {r.deities.length > 0 && <span className="mt-1 block text-faint">{r.deities.map((g) => `${g.name} (${g.domains})`).join(", ")}</span>}
                  </Item>
                ))}
              </ul>
            </Group>
          )}
          {d.ties.length > 0 && (
            <Group title="How they relate">
              <ul className="flex flex-col gap-1 text-sm">
                {d.ties.map((t, i) => (
                  <li key={i} className="group flex items-start justify-between gap-2">
                    <span>
                      <span className="font-medium">{t.from}</span> <span className="text-arcane">{t.type.replace(/_/g, " ")}</span> <span className="font-medium">{t.to}</span>
                      {t.why && <span className="text-muted">: {t.why}</span>}
                    </span>
                    <Remove label="this tie" onClick={set ? () => set({ ...d, ties: without(d.ties, i) }) : undefined} />
                  </li>
                ))}
              </ul>
            </Group>
          )}
        </div>
      );
    }
    case "history": {
      const d = data as SectionData["history"];
      const events = d.events.map((e, i) => ({ e, i })).sort((a, b) => b.e.yearsAgo - a.e.yearsAgo);
      return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Group title="How the world got here">
            <ol className="relative flex flex-col gap-3 border-l border-line pl-4">
              {events.map(({ e, i }) => (
                <li key={e.title + i} className="group">
                  <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border border-line-strong bg-surface" aria-hidden />
                  <div className="flex items-start justify-between gap-2">
                    <p>
                      <span className="text-xs tabular text-brass">{e.yearsAgo > 0 ? `${e.yearsAgo} years ago` : "This year"}</span>
                      <span className="block font-medium">{e.title}</span>
                    </p>
                    <Remove label={e.title} onClick={set ? () => set({ ...d, events: without(d.events, i) }) : undefined} />
                  </div>
                  <p className="text-sm text-muted">{e.summary}</p>
                </li>
              ))}
            </ol>
          </Group>
          <Group title="Ongoing conflicts">
            <ul className="flex flex-col gap-2">
              {d.threads.map((t, i) => (
                <Item key={t.name + i} name={t.name} meta={`urgency ${Math.max(1, Math.min(5, Math.round(t.urgency)))}/5`} onRemove={set && d.threads.length > 1 ? () => set({ ...d, threads: without(d.threads, i) }) : undefined}>
                  {t.summary}
                  {t.stakes && <span className="mt-1 block text-faint">If nobody intervenes: {t.stakes}</span>}
                  {t.drivers.length > 0 && <span className="mt-0.5 block text-faint">Driven by {t.drivers.join(", ")}</span>}
                </Item>
              ))}
            </ul>
          </Group>
        </div>
      );
    }
    case "start": {
      const d = data as SectionData["start"];
      const st = d.settlement;
      return (
        <div className="flex flex-col gap-5">
          <div>
            <p className="font-serif text-2xl font-semibold">{st.name}</p>
            <p className="text-sm text-faint">
              {st.size}
              {st.within ? ` in ${st.within}` : ""}
              {st.population ? `, population ${st.population}` : ""}
            </p>
            <p className="mt-2">{st.summary}</p>
            {st.features && <p className="mt-1 text-sm text-muted">{st.features}</p>}
            {st.demographics && <p className="mt-1 text-sm text-faint">Who lives here: {st.demographics}</p>}
          </div>
          <Group title="The tavern">
            <p>
              <span className="font-medium">{d.tavern.name}</span>: {d.tavern.summary}
            </p>
            {d.tavern.ambience && <p className="text-sm text-muted">{d.tavern.ambience}</p>}
          </Group>
          <Group title="People to meet">
            <ul className="grid gap-2 sm:grid-cols-3">
              {d.npcs.map((n, i) => (
                <Item key={n.name + i} name={n.name} meta={[n.race, n.className].filter(Boolean).join(" ")} onRemove={set ? () => set({ ...d, npcs: without(d.npcs, i) }) : undefined}>
                  <span className="block text-faint">{n.occupation}</span>
                  {n.summary}
                  <span className="mt-1 block">Wants: {n.want}</span>
                  {n.secret && <span className="mt-1 block text-ember/90">Secret: {n.secret}</span>}
                </Item>
              ))}
            </ul>
          </Group>
          {d.rumours.length > 0 && (
            <Group title="Rumours">
              <ul className="flex flex-col gap-1.5 text-sm">
                {d.rumours.map((r, i) => (
                  <li key={i} className="group flex items-start justify-between gap-2">
                    <span>
                      “{r.claim}” <span className="text-faint">Truth: {r.truth}</span>
                    </span>
                    <Remove label="this rumour" onClick={set ? () => set({ ...d, rumours: without(d.rumours, i) }) : undefined} />
                  </li>
                ))}
              </ul>
            </Group>
          )}
          {d.hook && (
            <p className="rounded-md border border-brass/30 bg-brass-soft/40 px-3 py-2 text-sm">
              <span className="font-medium text-brass">Session one opens:</span> {d.hook}
            </p>
          )}
        </div>
      );
    }
  }
  return null;
}

/**
 * Peoples, compactly: core races and classes as chips grouped by how common they are (details on
 * demand), homebrew as full cards, since that's what's new.
 */
function PeoplesView({ d, set }: { d: SectionData["peoples"]; set?: (d: unknown) => void }) {
  const [details, setDetails] = React.useState(false);
  type P = SectionData["peoples"]["races"][number] | SectionData["peoples"]["classes"][number];
  const block = (kind: "races" | "classes", title: string) => {
    const xs: P[] = d[kind];
    const remove = (p: P) => (set && xs.length > 1 ? () => set({ ...d, [kind]: xs.filter((x) => x !== p) }) : undefined);
    const core = xs.filter((p) => p.core);
    const brew = xs.filter((p) => !p.core);
    const order = ["Common", "Uncommon", "Rare", "Very rare", "Legendary"];
    return (
      <Group title={`${title} (${xs.length})`}>
        {details ? (
          <ul className="flex flex-col gap-2">
            {core.map((p, i) => (
              <Item key={p.name + i} name={p.name} meta={p.prevalence} onRemove={remove(p)}>
                {p.place}
              </Item>
            ))}
          </ul>
        ) : (
          <dl className="flex flex-col gap-1.5 text-sm">
            {order
              .map((o) => [o, core.filter((p) => p.prevalence === o)] as const)
              .filter(([, ps]) => ps.length)
              .map(([o, ps]) => (
                <div key={o} className="flex flex-wrap items-baseline gap-1.5">
                  <dt className="w-20 shrink-0 text-faint">{o}</dt>
                  {ps.map((p) => (
                    <dd key={p.name} className="group inline-flex items-center gap-0.5 rounded-full border border-line py-0.5 pl-2.5 pr-1" title={p.place}>
                      {p.name}
                      <Remove label={p.name} onClick={remove(p)} />
                    </dd>
                  ))}
                </div>
              ))}
          </dl>
        )}
        {brew.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {brew.map((p, i) => (
              <li key={p.name + i} className="group rounded-lg border border-arcane/40 bg-arcane-soft/30 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="font-medium">{p.name}</span>
                    <Badge tone={PREV_TONE[p.prevalence] ?? "neutral"}>{p.prevalence}</Badge>
                    <Badge tone="arcane">Homebrew</Badge>
                  </div>
                  <Remove label={p.name} onClick={remove(p)} />
                </div>
                <p className="mt-1 text-sm text-muted">{p.place}</p>
                {"traits" in p && p.traits && <p className="mt-1 text-sm text-faint">Traits: {p.traits}</p>}
                {"features" in p && p.features && <p className="mt-1 text-sm text-faint">Features: {p.features}</p>}
              </li>
            ))}
          </ul>
        )}
      </Group>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-5 lg:grid-cols-2">
        {block("races", "Races")}
        {block("classes", "Classes")}
      </div>
      <button type="button" onClick={() => setDetails((v) => !v)} className="self-start text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
        {details ? "Show the core races and classes compactly" : "Show how each core race and class fits this world"}
      </button>
    </div>
  );
}
