"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { Clapperboard, Compass, FileText, Map as MapIcon, Moon, NotebookPen, Plus, Search, Sparkles, type LucideIcon, ArrowRight } from "lucide-react";
import { ENTITY_TYPES, getEntityType } from "@/lib/entity-types";
import { TypeIcon } from "@/components/entity/type-icon";
import { useWorld } from "./world-context";
import { setThemeAction } from "@/server/actions/worlds";
import type { SearchResult } from "@/server/services/search";
import { Kbd } from "@/components/ui/input";
import { lowerLabel } from "@/lib/utils";

interface PaletteAction {
  id: string;
  label: string;
  group: string;
  icon?: LucideIcon;
  typeIcon?: string;
  keywords?: string;
  run: () => void;
}

function Highlight({ text }: { text: string }) {
  const parts = text.split(/(⟦[^⟧]*⟧)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("⟦") ? (
          <mark key={i} className="rounded-sm bg-brass-soft px-0.5 text-fg">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const w = useWorld();
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  // Keep the best match highlighted as results stream in, so Enter opens it (not "Create …").
  const [selected, setSelected] = React.useState("");
  React.useEffect(() => {
    if (results[0]) setSelected(`${results[0].kind}-${results[0].id}`);
  }, [results]);
  const [loading, setLoading] = React.useState(false);
  const base = `/w/${w.worldId}`;
  const c = w.activeCampaign;

  React.useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
    }
  }, [open]);

  React.useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/w/${w.worldId}/search?q=${encodeURIComponent(query)}${c ? `&campaign=${c.id}` : ""}`, { signal: ctrl.signal });
        if (res.ok) setResults(await res.json());
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 140);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, w.worldId, c]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const actions: PaletteAction[] = React.useMemo(() => {
    const list: PaletteAction[] = [];
    if (c) {
      list.push(
        { id: "run", label: "Run session", group: "Campaign", icon: Clapperboard, keywords: "play live table", run: () => go(`${base}/campaigns/${c.id}/run`) },
        { id: "prep", label: "Prepare next session", group: "Campaign", icon: NotebookPen, keywords: "briefing prep", run: () => go(`${base}/campaigns/${c.id}/prepare`) },
        { id: "camp", label: `Open ${c.name}`, group: "Campaign", icon: Compass, run: () => go(`${base}/campaigns/${c.id}`) },
      );
    }
    list.push({ id: "ai", label: "Ask the AI assistant", group: "Actions", icon: Sparkles, keywords: "copilot chat", run: () => { onOpenChange(false); w.openAssistant(); } });
    for (const t of ENTITY_TYPES.filter((t) => !t.hiddenFromCreate && (!t.campaignScoped || c))) {
      list.push({
        id: `create-${t.key}`,
        label: `New ${lowerLabel(t.label)}`,
        group: "Create",
        typeIcon: t.key,
        keywords: `create add ${t.plural}`,
        run: () => {
          onOpenChange(false);
          w.openQuickCreate({ type: t.key });
        },
      });
    }
    const nav: [string, string, LucideIcon][] = [
      ["Dashboard", base, Compass],
      ["Wiki", `${base}/wiki`, FileText],
      ["Maps", `${base}/maps`, MapIcon],
      ["Timeline", `${base}/timeline`, FileText],
      ["World threads", `${base}/threads`, FileText],
      ["Proposals", `${base}/proposals`, FileText],
      ["Calendar", `${base}/calendar`, FileText],
      ["Generators", `${base}/generators`, FileText],
      ["Relationship graph", `${base}/graph`, FileText],
      ["Thin spots", `${base}/thin-spots`, FileText],
      ["World settings", `${base}/settings`, FileText],
    ];
    for (const [label, href, icon] of nav) list.push({ id: `nav-${href}`, label: `Go to ${label}`, group: "Navigate", icon, run: () => go(href) });
    list.push(
      { id: "theme-dark", label: "Use dark theme", group: "Preferences", icon: Moon, run: async () => { await setThemeAction("dark"); document.documentElement.classList.add("dark"); onOpenChange(false); } },
      { id: "theme-light", label: "Use light theme", group: "Preferences", icon: Moon, run: async () => { await setThemeAction("light"); document.documentElement.classList.remove("dark"); onOpenChange(false); } },
    );
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, base]);

  const ql = q.trim().toLowerCase();
  const filteredActions = ql ? actions.filter((a) => (a.label + " " + (a.keywords ?? "")).toLowerCase().includes(ql)) : actions.filter((a) => a.group !== "Create" || ["npc", "location", "quest", "faction"].some((k) => a.id === `create-${k}`));
  const groups = Array.from(new Set(filteredActions.map((a) => a.group)));

  const hrefFor = (r: SearchResult) => {
    switch (r.kind) {
      case "entity":
        return `${base}/e/${r.id}`;
      case "session":
        return `${base}/campaigns/${r.campaignId}/sessions/${r.id}`;
      case "campaign":
        return `${base}/campaigns/${r.id}`;
      case "map":
        return `${base}/maps/${r.id}`;
      case "note":
        return r.campaignId ? `${base}/campaigns/${r.campaignId}/notes#${r.id}` : `${base}`;
    }
  };

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px]" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-pop data-[state=open]:animate-in">
          <D.Title className="sr-only">Search and commands</D.Title>
          <D.Description className="sr-only">Search the world or run a command</D.Description>
          <Command shouldFilter={false} loop value={selected} onValueChange={setSelected} className="flex max-h-[min(70vh,36rem)] flex-col">
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search className="size-4 shrink-0 text-faint" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search your world, or type a command…"
                className="h-12 flex-1 bg-transparent text-md outline-none placeholder:text-faint"
              />
              {loading && <span className="text-xs text-faint">Searching…</span>}
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
                {ql.length < 2 ? "Type at least two letters to search." : loading ? "Searching…" : `Nothing matches “${q}”. Press Enter on a create command to make it.`}
              </Command.Empty>
              {results.length > 0 && (
                <Command.Group heading="Results" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-faint">
                  {results.map((r) => (
                    <Command.Item
                      key={`${r.kind}-${r.id}`}
                      value={`${r.kind}-${r.id}`}
                      onSelect={() => go(hrefFor(r))}
                      className="flex cursor-default items-start gap-3 rounded-md px-2.5 py-2 data-[selected=true]:bg-surface-2"
                    >
                      <span className="mt-0.5">{r.kind === "entity" ? <TypeIcon type={r.type ?? "lore"} /> : <FileText className="size-4 text-faint" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate font-medium">{r.title}</span>
                          <span className="shrink-0 text-xs text-faint">{r.kind === "entity" ? getEntityType(r.type ?? "").label : r.subtitle}</span>
                        </span>
                        {r.snippet && (
                          <span className="mt-0.5 line-clamp-1 text-sm text-muted">
                            <Highlight text={r.snippet} />
                          </span>
                        )}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {ql.length >= 2 && (
                <Command.Group heading="Create" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-faint">
                  <Command.Item
                    value="create-from-query"
                    onSelect={() => {
                      onOpenChange(false);
                      w.openQuickCreate({ defaults: { name: q.trim() } });
                    }}
                    className="flex cursor-default items-center gap-3 rounded-md px-2.5 py-2 data-[selected=true]:bg-surface-2"
                  >
                    <Plus className="size-4 text-accent" />
                    <span>
                      Create <span className="font-medium">“{q.trim()}”</span>
                    </span>
                  </Command.Item>
                </Command.Group>
              )}
              {groups.map((g) => (
                <Command.Group key={g} heading={g} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-faint">
                  {filteredActions
                    .filter((a) => a.group === g)
                    .map((a) => (
                      <Command.Item
                        key={a.id}
                        value={a.id}
                        onSelect={a.run}
                        className="flex cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-base data-[selected=true]:bg-surface-2"
                      >
                        {a.typeIcon ? <TypeIcon type={a.typeIcon} /> : a.icon ? <a.icon className="size-4 text-faint" /> : <ArrowRight className="size-4 text-faint" />}
                        <span>{a.label}</span>
                      </Command.Item>
                    ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
