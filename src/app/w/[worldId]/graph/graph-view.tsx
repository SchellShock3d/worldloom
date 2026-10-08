"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { Crosshair, Maximize, Minus, Plus, Search, Waypoints, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented, Switch } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/display";
import { TypeIcon, TONE_VAR } from "@/components/entity/type-icon";
import { useWorld } from "@/components/shell/world-context";
import { ENTITY_GROUPS, getEntityType } from "@/lib/entity-types";
import { relationshipLabel, RELATIONSHIP_TYPE_MAP } from "@/lib/relationship-types";
import { cn } from "@/lib/utils";

interface NodeIn {
  id: string;
  name: string;
  type: string;
  importance: number;
  summary: string;
}
interface EdgeIn {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  derived?: boolean;
}
type N = NodeIn & SimulationNodeDatum & { r: number; degree: number };
type L = SimulationLinkDatum<N> & { id: string; type: string; label: string; derived?: boolean };

const HOSTILE = new Set(["enemy_of", "at_war_with", "rival_of", "hates", "fears", "threatens"]);
const WARM = new Set(["allied_with", "friend_of", "loves", "spouse_of", "parent_of", "sibling_of", "mentor_of"]);
function edgeColor(type: string, derived?: boolean) {
  if (derived) return "var(--line-strong)";
  if (HOSTILE.has(type)) return "var(--ember)";
  if (WARM.has(type)) return "var(--accent)";
  return "var(--text-faint)";
}

export function GraphView({
  nodes: nodesIn,
  edges: edgesIn,
  focus,
  depth,
  groups,
  showPlaces,
  campaignName,
}: {
  nodes: NodeIn[];
  edges: EdgeIn[];
  focus: { id: string; name: string; type: string } | null;
  depth: number;
  groups: string[];
  showPlaces: boolean;
  campaignName: string | null;
}) {
  const w = useWorld();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const container = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState({ x: 0, y: 0, s: 1 });
  const [selected, setSelected] = React.useState<string | null>(focus?.id ?? null);
  const [hover, setHover] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [, setFrame] = React.useState(0);
  const drag = React.useRef<{ kind: "pan" | "node"; id?: string; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  const push = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  // Build simulation data once per data set (the page re-keys this component on filter changes).
  const sim = React.useMemo(() => {
    const degree = new Map<string, number>();
    for (const e of edgesIn) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    const nodes: N[] = nodesIn.map((n) => {
      const d = degree.get(n.id) ?? 0;
      return { ...n, degree: d, r: 5 + n.importance * 2.5 + Math.min(8, Math.sqrt(d) * 2) };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: L[] = edgesIn.filter((e) => byId.has(e.source) && byId.has(e.target)).map((e) => ({ ...e, source: byId.get(e.source)!, target: byId.get(e.target)! }));
    if (focus && byId.has(focus.id)) {
      const f = byId.get(focus.id)!;
      f.fx = 0;
      f.fy = 0;
    }
    const s: Simulation<N, L> = forceSimulation(nodes)
      .force("link", forceLink<N, L>(links).id((n) => n.id).distance((l) => (l.derived ? 40 : 80)).strength((l) => (l.derived ? 0.6 : 0.35)))
      .force("charge", forceManyBody<N>().strength((n) => -140 - n.r * 12))
      .force("collide", forceCollide<N>((n) => n.r + 6))
      .force("x", forceX<N>(0).strength(0.04))
      .force("y", forceY<N>(0).strength(0.04))
      .force("center", forceCenter(0, 0))
      .stop();
    // Settle synchronously so the graph appears laid out, without a jittery intro.
    for (let i = 0; i < 300; i++) s.tick();
    return { s, nodes, links, byId };
  }, [nodesIn, edgesIn, focus]);

  React.useEffect(() => {
    sim.s.on("tick", () => setFrame((f) => f + 1));
    return () => {
      sim.s.stop();
      sim.s.on("tick", null);
    };
  }, [sim]);

  const fit = React.useCallback(() => {
    const el = container.current;
    if (!el || !sim.nodes.length) return;
    const xs = sim.nodes.map((n) => n.x ?? 0);
    const ys = sim.nodes.map((n) => n.y ?? 0);
    const minX = Math.min(...xs) - 60;
    const maxX = Math.max(...xs) + 60;
    const minY = Math.min(...ys) - 40;
    const maxY = Math.max(...ys) + 40;
    const s = Math.min(2, Math.min(el.clientWidth / (maxX - minX), el.clientHeight / (maxY - minY)));
    setView({ s, x: el.clientWidth / 2 - ((minX + maxX) / 2) * s, y: el.clientHeight / 2 - ((minY + maxY) / 2) * s });
  }, [sim]);
  React.useEffect(() => {
    fit();
  }, [fit]);

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const el = container.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (cx ?? r.left + el.clientWidth / 2) - r.left;
    const py = (cy ?? r.top + el.clientHeight / 2) - r.top;
    setView((v) => {
      const s = Math.max(0.15, Math.min(4, v.s * factor));
      const k = s / v.s;
      return { s, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  };
  React.useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const toGraph = (clientX: number, clientY: number) => {
    const r = container.current!.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.s, y: (clientY - r.top - view.y) / view.s };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.kind === "pan") setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    else if (d.id && d.moved) {
      const n = sim.byId.get(d.id);
      if (!n) return;
      const p = toGraph(e.clientX, e.clientY);
      n.fx = p.x;
      n.fy = p.y;
      sim.s.alphaTarget(0.25).restart();
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "node" && d.id) {
      // Dragged nodes stay pinned where the DM put them; let the rest settle.
      sim.s.alphaTarget(0);
      if (!d.moved) setSelected((s) => (s === d.id ? null : d.id!));
    } else if (!d.moved) setSelected(null);
  };

  const active = hover ?? selected;
  const neighbours = React.useMemo(() => {
    if (!active) return null;
    const set = new Set([active]);
    for (const l of sim.links) {
      const s = (l.source as N).id;
      const t = (l.target as N).id;
      if (s === active) set.add(t);
      if (t === active) set.add(s);
    }
    return set;
  }, [active, sim.links]);

  const matches = query.trim() ? sim.nodes.filter((n) => n.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : [];
  const centerOn = (id: string) => {
    const n = sim.byId.get(id);
    const el = container.current;
    if (!n || !el) return;
    setView((v) => ({ ...v, x: el.clientWidth / 2 - (n.x ?? 0) * v.s, y: el.clientHeight / 2 - (n.y ?? 0) * v.s }));
    setSelected(id);
  };

  const sel = selected ? sim.byId.get(selected) : null;
  const selLinks = sel
    ? sim.links
        .filter((l) => (l.source as N).id === sel.id || (l.target as N).id === sel.id)
        .map((l) => {
          const out = (l.source as N).id === sel.id;
          const other = (out ? l.target : l.source) as N;
          return { id: l.id, other, label: relationshipLabel(l.type, out ? "forward" : "inverse"), type: l.type, derived: l.derived };
        })
        .sort((a, b) => a.label.localeCompare(b.label) || a.other.name.localeCompare(b.other.name))
    : [];

  const showLabel = (n: N) => view.s > 1.1 || n.importance > 0 || n.degree >= 3 || (neighbours?.has(n.id) ?? false) || n.id === focus?.id;

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className="relative min-h-[20rem] min-w-0 flex-1">
        {sim.nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState icon={<Waypoints />} title={groups.length ? "Nothing to show with these filters" : "No relationships yet"}>
              {groups.length ? "Turn more groups back on." : "Open a character or faction and add ties under Relationships. They will appear here as a web."}
            </EmptyState>
          </div>
        ) : (
          <div
            ref={container}
            className="absolute inset-0 touch-none select-none overflow-hidden bg-bg-subtle"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            role="application"
            aria-label="Relationship graph"
          >
            <svg className="absolute inset-0 size-full">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,1 L10,5 L0,9 z" fill="var(--text-faint)" />
                </marker>
              </defs>
              <g transform={`translate(${view.x},${view.y}) scale(${view.s})`}>
                {sim.links.map((l) => {
                  const s = l.source as N;
                  const t = l.target as N;
                  const lit = !neighbours || (neighbours.has(s.id) && neighbours.has(t.id) && (s.id === active || t.id === active));
                  const sym = RELATIONSHIP_TYPE_MAP[l.type]?.symmetric;
                  // shorten line so arrowheads sit on the node edge
                  const dx = (t.x ?? 0) - (s.x ?? 0);
                  const dy = (t.y ?? 0) - (s.y ?? 0);
                  const len = Math.hypot(dx, dy) || 1;
                  const x2 = (t.x ?? 0) - (dx / len) * (t.r + 2);
                  const y2 = (t.y ?? 0) - (dy / len) * (t.r + 2);
                  return (
                    <g key={l.id} opacity={lit ? 1 : 0.12}>
                      <line
                        x1={s.x}
                        y1={s.y}
                        x2={x2}
                        y2={y2}
                        stroke={edgeColor(l.type, l.derived)}
                        strokeWidth={(l.derived ? 1 : 1.4) / Math.sqrt(view.s)}
                        strokeDasharray={l.derived ? "3 3" : undefined}
                        markerEnd={!sym && !l.derived ? "url(#arrow)" : undefined}
                      />
                      {active && lit && !l.derived && (
                        <text x={((s.x ?? 0) + (t.x ?? 0)) / 2} y={((s.y ?? 0) + (t.y ?? 0)) / 2 - 3} textAnchor="middle" fontSize={10 / Math.sqrt(view.s)} fill="var(--text-muted)" className="pointer-events-none" style={{ paintOrder: "stroke", stroke: "var(--bg-subtle)", strokeWidth: 3 }}>
                          {l.label}
                        </text>
                      )}
                    </g>
                  );
                })}
                {sim.nodes.map((n) => {
                  const def = getEntityType(n.type, w.customTypes);
                  const color = TONE_VAR[def.tone];
                  const dim = neighbours && !neighbours.has(n.id);
                  const isSel = n.id === selected;
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${n.x},${n.y})`}
                      opacity={dim ? 0.2 : 1}
                      className="cursor-pointer"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        (e.target as Element).setPointerCapture?.(e.pointerId);
                        drag.current = { kind: "node", id: n.id, sx: e.clientX, sy: e.clientY, vx: 0, vy: 0, moved: false };
                      }}
                      onPointerEnter={() => setHover(n.id)}
                      onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                    >
                      {isSel && <circle r={n.r + 5} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={2} />}
                      <circle r={n.r} fill="var(--surface)" stroke={color} strokeWidth={n.id === focus?.id ? 3 : 2} />
                      <circle r={Math.max(2, n.r - 4)} fill={color} fillOpacity={0.35} />
                      {showLabel(n) && (
                        <text y={n.r + 12} textAnchor="middle" fontSize={11 / Math.sqrt(Math.max(view.s, 0.6))} fill="var(--text)" className="pointer-events-none select-none" style={{ paintOrder: "stroke", stroke: "var(--bg-subtle)", strokeWidth: 3, fontWeight: n.importance > 1 ? 600 : 400 }}>
                          {n.name}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        )}
        {sim.nodes.length > 0 && (
          <>
            <div className="absolute left-3 top-3 flex w-64 flex-col gap-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 z-[1] size-3.5 -translate-y-1/2 text-faint" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && matches[0]) {
                      centerOn(matches[0].id);
                      setQuery("");
                    }
                  }}
                  placeholder="Find in graph…"
                  className="h-8 bg-surface/95 pl-8 text-sm shadow-pop backdrop-blur"
                  aria-label="Find in graph"
                />
              </div>
              {matches.length > 0 && (
                <ul className="rounded-md border border-line bg-surface p-1 shadow-pop">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-surface-2" onClick={() => (centerOn(m.id), setQuery(""))}>
                        <TypeIcon type={m.type} className="size-3.5" /> {m.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="absolute bottom-3 left-3 flex gap-1 rounded-lg border border-line bg-surface/95 p-1 shadow-pop backdrop-blur">
              <Button variant="ghost" size="icon-sm" onClick={() => zoomAt(1.3)} aria-label="Zoom in">
                <Plus />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => zoomAt(1 / 1.3)} aria-label="Zoom out">
                <Minus />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={fit} aria-label="Fit to screen">
                <Maximize />
              </Button>
            </div>
            <div className="pointer-events-none absolute bottom-3 right-3 hidden gap-3 rounded-lg border border-line bg-surface/90 px-3 py-1.5 text-xs text-muted sm:flex">
              <span className="flex items-center gap-1.5">
                <span className="h-px w-4 bg-accent" /> close ties
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-px w-4 bg-ember" /> hostility
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-px w-4 bg-faint" /> other
              </span>
              {showPlaces && (
                <span className="flex items-center gap-1.5">
                  <span className="w-4 border-t border-dashed border-line-strong" /> located in
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <aside className="flex max-h-[45%] w-full shrink-0 flex-col gap-5 overflow-y-auto border-t border-line bg-surface p-4 md:max-h-none md:w-80 md:border-l md:border-t-0">
        {sel ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <TypeIcon type={sel.type} className="size-3.5" /> {getEntityType(sel.type, w.customTypes).label}
                </p>
                <Link href={`/w/${w.worldId}/e/${sel.id}`} className="font-serif text-xl font-semibold hover:text-accent">
                  {sel.name}
                </Link>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setSelected(null)} aria-label="Close">
                <X />
              </Button>
            </div>
            {sel.summary && <p className="text-sm text-muted">{sel.summary}</p>}
            {focus?.id !== sel.id && (
              <Button variant="secondary" size="sm" onClick={() => push({ focus: sel.id })}>
                <Crosshair /> Show only {sel.name}&apos;s web
              </Button>
            )}
            <section>
              <h3 className="mb-1 text-sm font-semibold text-muted">Ties ({selLinks.length})</h3>
              <ul className="flex flex-col">
                {selLinks.map((l) => (
                  <li key={l.id}>
                    <button onClick={() => centerOn(l.other.id)} className="flex w-full items-baseline gap-1.5 rounded px-1.5 py-1 text-left text-sm hover:bg-surface-2">
                      <span className={cn("shrink-0", HOSTILE.has(l.type) ? "text-ember" : WARM.has(l.type) ? "text-accent" : "text-faint")}>{l.label}</span>
                      <span className="truncate font-medium">{l.other.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : (
          <>
            {focus ? (
              <div className="rounded-md border border-line-strong p-3">
                <p className="text-xs text-faint">Showing the web around</p>
                <p className="flex items-center gap-1.5 font-medium">
                  <TypeIcon type={focus.type} /> {focus.name}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Segmented size="sm" value={String(depth)} onChange={(v) => push({ depth: v === "2" ? null : v })} options={[{ value: "1", label: "Direct" }, { value: "2", label: "2 steps" }, { value: "3", label: "3 steps" }]} />
                  <Button variant="ghost" size="xs" onClick={() => push({ focus: null, depth: null })}>
                    Whole world
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">
                Showing the most connected {sim.nodes.length} entries{campaignName ? `, including ${campaignName}'s own ties` : ""}. Select anyone to see their ties, or focus the graph on them.
              </p>
            )}
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-muted">Include</h3>
              <div className="flex flex-col gap-1">
                {ENTITY_GROUPS.map((g) => {
                  const on = groups.length === 0 || groups.includes(g.key);
                  return (
                    <label key={g.key} className="flex items-center justify-between gap-2 py-0.5 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: TONE_VAR[g.key] }} /> {g.label}
                      </span>
                      <Switch
                        checked={on}
                        onCheckedChange={(c) => {
                          const current = groups.length ? new Set(groups) : new Set(ENTITY_GROUPS.map((x) => x.key as string));
                          if (c) current.add(g.key);
                          else current.delete(g.key);
                          const all = current.size === ENTITY_GROUPS.length;
                          push({ groups: all || current.size === 0 ? null : Array.from(current).join(",") });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </section>
            <label className="flex items-center justify-between gap-2 text-sm">
              Show where things are
              <Switch checked={showPlaces} onCheckedChange={(c) => push({ places: c ? null : "0" })} />
            </label>
          </>
        )}
      </aside>
    </div>
  );
}
