"use client";

import * as React from "react";
import { EyeOff, X } from "lucide-react";
import { Markdown } from "@/components/common/markdown";
import { TypeIcon } from "@/components/entity/type-icon";
import { emptyFieldFills, type BuildSectionData, type BuildSectionDef } from "@/lib/build-out";
import { ENTITY_TYPE_MAP, getEntityType } from "@/lib/entity-types";
import { RELATIONSHIP_TYPE_MAP, relationshipLabel } from "@/lib/relationship-types";
import type { BuildFocus } from "./build-out";

const without = <T,>(xs: T[], i: number) => xs.filter((_, j) => j !== i);

/** Claude writes "@Name" for entries; they become links when added. In the draft, just show the name. */
const showMentions = (md: string) => md.replace(/@(?=[\p{Lu}\p{N}"'])/gu, "");

function Remove({ label, onClick }: { label: string; onClick?: () => void }) {
  if (!onClick) return null;
  return (
    <button type="button" onClick={onClick} aria-label={`Remove ${label}`} title={`Remove ${label}`} className="shrink-0 rounded p-0.5 text-faint hover:bg-surface-3 hover:text-ember focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
      <X className="size-3.5" />
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-muted">{title}</h3>
      {children}
    </div>
  );
}

const linkLabel = (t: string) => (RELATIONSHIP_TYPE_MAP[t] ? relationshipLabel(t, "forward") : t.replace(/_/g, " "));
const typeLabel = (t: string) => (ENTITY_TYPE_MAP[t.toLowerCase()] ? getEntityType(t.toLowerCase()).label : t.replace(/_/g, " "));

/** A readable view of one build-out section. With `onChange`, items can be removed one at a time. */
export function BuildSectionView({ section, data: d, focus, onChange, onLeaveOut }: { section: BuildSectionDef; data: BuildSectionData; focus: BuildFocus; onChange?: (d: BuildSectionData) => void; onLeaveOut?: () => void }) {
  const def = getEntityType(focus.type);
  const fills = emptyFieldFills(
    d.fields,
    focus.fields,
    def.fields.map((f) => f.key),
  );
  const label = (key: string) => def.fields.find((f) => f.key === key)?.label ?? key;
  const set = onChange;

  return (
    <div className="flex flex-col gap-5">
      {d.article && <Markdown variant={section.key === "about" ? "lore" : "compact"}>{showMentions(d.article)}</Markdown>}

      {fills.length > 0 && (
        <Group title={`Fills in for ${focus.name}`}>
          <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[10rem_1fr]">
            {fills.map((f) => (
              <React.Fragment key={f.key}>
                <dt className="text-faint">{label(f.key)}</dt>
                <dd className="group flex items-start justify-between gap-2">
                  <span className="min-w-0">{f.value}</span>
                  <Remove label={label(f.key)} onClick={set ? () => set({ ...d, fields: d.fields.filter((x) => x.key !== f.key) }) : undefined} />
                </dd>
              </React.Fragment>
            ))}
          </dl>
        </Group>
      )}

      {d.entries.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {d.entries.map((e, i) => {
            const links = e.links.filter((l) => l.to.trim());
            return (
              <li key={`${e.name}-${i}`} className="group flex flex-col gap-1 rounded-lg border border-line px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <TypeIcon type={e.type.toLowerCase()} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">{e.name}</p>
                      <p className="text-xs text-faint">
                        {typeLabel(e.type)}
                        {e.within && e.within.toLowerCase() !== focus.name.toLowerCase() ? ` · in ${e.within}` : ""}
                        {e.fields.find((f) => f.key === "species")?.value ? ` · ${e.fields.find((f) => f.key === "species")!.value}` : ""}
                        {e.fields.find((f) => f.key === "occupation")?.value ? ` · ${e.fields.find((f) => f.key === "occupation")!.value}` : ""}
                      </p>
                    </div>
                  </div>
                  <Remove label={e.name} onClick={set ? () => set({ ...d, entries: without(d.entries, i) }) : undefined} />
                </div>
                {e.summary && <p className="text-sm">{e.summary}</p>}
                {e.details && (
                  <Markdown variant="small">
                    {showMentions(e.details)}
                  </Markdown>
                )}
                {e.secret && (
                  <p className="flex items-start gap-1.5 text-sm text-muted">
                    <EyeOff className="mt-0.5 size-3.5 shrink-0 text-ember" aria-label="DM only" />
                    <span>{e.secret}</span>
                  </p>
                )}
                {links.length > 0 && <p className="text-xs text-faint">{links.map((l) => `${linkLabel(l.type)} ${l.to}`).join(" · ")}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {d.links.length > 0 && (
        <Group title={`${focus.name}'s ties`}>
          <ul className="flex flex-col gap-1 text-sm">
            {d.links.map((l, i) => (
              <li key={`${l.to}-${i}`} className="group flex items-start justify-between gap-2">
                <span>
                  {focus.name} <span className="text-muted">{linkLabel(l.type)}</span> {l.to}
                  {l.why && <span className="text-faint"> · {l.why}</span>}
                </span>
                <Remove label={`tie to ${l.to}`} onClick={set ? () => set({ ...d, links: without(d.links, i) }) : undefined} />
              </li>
            ))}
          </ul>
        </Group>
      )}

      {d.rumours.length > 0 && (
        <Group title="Rumours">
          <ul className="flex flex-col gap-2">
            {d.rumours.map((r, i) => (
              <li key={`${r.claim}-${i}`} className="group flex items-start justify-between gap-2 border-l-2 border-line pl-3">
                <div className="min-w-0 text-sm">
                  <p className="italic">“{r.claim}”</p>
                  {r.truth && <p className="mt-0.5 text-muted">Truth: {r.truth}</p>}
                </div>
                <Remove label="this rumour" onClick={set ? () => set({ ...d, rumours: without(d.rumours, i) }) : undefined} />
              </li>
            ))}
          </ul>
        </Group>
      )}

      {d.hooks.length > 0 && (
        <Group title="Adventure hooks">
          <ul className="flex flex-col gap-1.5 text-sm">
            {d.hooks.map((h, i) => (
              <li key={`${h}-${i}`} className="group flex items-start justify-between gap-2">
                <span className="min-w-0">{h}</span>
                <Remove label="this hook" onClick={set ? () => set({ ...d, hooks: without(d.hooks, i) }) : undefined} />
              </li>
            ))}
          </ul>
        </Group>
      )}

      {!d.article && !fills.length && !d.entries.length && !d.links.length && !d.rumours.length && !d.hooks.length && <p className="text-sm text-faint">Nothing left in this section. Redo it, or leave it out.</p>}

      {onLeaveOut && (
        <button type="button" onClick={onLeaveOut} className="self-start text-xs text-faint underline-offset-4 hover:text-fg hover:underline">
          Leave this part out
        </button>
      )}
    </div>
  );
}
