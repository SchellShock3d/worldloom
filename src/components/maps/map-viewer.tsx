"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Beer,
  Castle,
  DoorClosed,
  Eye,
  EyeOff,
  Flag,
  Landmark,
  Layers,
  MapPin,
  Maximize,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Orbit,
  Pentagon,
  Plus,
  ScrollText,
  Store,
  Swords,
  Trash2,
  UserRound,
  X,
  type LucideIcon,
  Map as MapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Segmented, Switch } from "@/components/ui/primitives";
import { ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Tooltip } from "@/components/ui/overlays";
import { EntityPicker, type EntityOption } from "@/components/entity/entity-picker";
import { TypeIcon } from "@/components/entity/type-icon";
import { useWorld } from "@/components/shell/world-context";
import { deleteLayerAction, deleteMarkerAction, deleteRegionAction, moveMarkerAction, saveLayerAction, saveMarkerAction, saveRegionAction } from "@/server/actions/maps";
import { cn } from "@/lib/utils";

export const MARKER_CATEGORIES: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  settlement: { label: "Settlement", icon: Castle, color: "var(--type-places)" },
  landmark: { label: "Landmark", icon: Landmark, color: "var(--brass)" },
  dungeon: { label: "Dungeon", icon: DoorClosed, color: "var(--ember)" },
  shop: { label: "Shop", icon: Store, color: "var(--type-things)" },
  tavern: { label: "Tavern", icon: Beer, color: "var(--type-people)" },
  npc: { label: "NPC", icon: UserRound, color: "var(--type-people)" },
  quest: { label: "Quest", icon: ScrollText, color: "var(--type-play)" },
  encounter: { label: "Encounter", icon: Swords, color: "var(--ember)" },
  faction: { label: "Faction", icon: Flag, color: "var(--type-powers)" },
  portal: { label: "Portal", icon: Orbit, color: "var(--arcane)" },
  secret: { label: "Secret", icon: EyeOff, color: "var(--ember)" },
  custom: { label: "Custom", icon: MapPin, color: "var(--accent)" },
};

export interface MarkerView {
  id: string;
  label: string;
  category: string;
  x: number;
  y: number;
  color: string | null;
  description: string;
  visibility: string;
  layerId: string | null;
  childMapId: string | null;
  entity: { id: string; name: string; type: string; summary: string } | null;
}
export interface RegionView {
  id: string;
  name: string;
  color: string;
  points: [number, number][];
  visibility: string;
  layerId: string | null;
  entity: { id: string; name: string; type: string } | null;
}

type Selection = { kind: "marker"; id: string | null; draft: Omit<MarkerView, "id"> & { id?: string } } | { kind: "region"; id: string | null; draft: Omit<RegionView, "id"> & { id?: string } } | null;

export function MapViewer({
  map,
  markers: initialMarkers,
  regions,
  layers,
  maps,
  focusMarkerId,
  readOnly = false,
}: {
  map: { id: string; name: string; imageUrl: string | null; width: number; height: number };
  markers: MarkerView[];
  regions: RegionView[];
  layers: { id: string; name: string; visibleByDefault?: boolean }[];
  maps: { id: string; name: string }[];
  focusMarkerId?: string | null;
  /** Viewers and players can browse but not edit. */
  readOnly?: boolean;
}) {
  const w = useWorld();
  const router = useRouter();
  const container = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState({ x: 0, y: 0, s: 1 });
  const [mode, setMode] = React.useState<"view" | "marker" | "region">("view");
  const [markers, setMarkers] = React.useState(initialMarkers);
  const [sel, setSel] = React.useState<Selection>(null);
  const [draftPts, setDraftPts] = React.useState<[number, number][]>([]);
  const [hiddenCats, setHiddenCats] = React.useState<Set<string>>(new Set());
  const [hiddenLayers, setHiddenLayers] = React.useState<Set<string>>(() => new Set(layers.filter((l) => l.visibleByDefault === false).map((l) => l.id)));
  const [playerView, setPlayerView] = React.useState(false);
  const [newLayer, setNewLayer] = React.useState("");
  const drag = React.useRef<{ kind: "pan" | "marker"; id?: string; startX: number; startY: number; vx: number; vy: number; moved: boolean } | null>(null);
  const W = map.width;
  const H = map.height;

  React.useEffect(() => setMarkers(initialMarkers), [initialMarkers]);

  const fit = React.useCallback(() => {
    const el = container.current;
    if (!el) return;
    const s = Math.min(el.clientWidth / W, el.clientHeight / H) * 0.98;
    setView({ s, x: (el.clientWidth - W * s) / 2, y: (el.clientHeight - H * s) / 2 });
  }, [W, H]);
  React.useEffect(() => {
    fit();
    const ro = new ResizeObserver(() => fit());
    if (container.current) ro.observe(container.current);
    return () => ro.disconnect();
  }, [fit]);
  React.useEffect(() => {
    if (!focusMarkerId) return;
    const m = initialMarkers.find((x) => x.id === focusMarkerId);
    const el = container.current;
    if (!m || !el) return;
    const s = Math.min(el.clientWidth / W, el.clientHeight / H) * 2;
    setView({ s, x: el.clientWidth / 2 - m.x * W * s, y: el.clientHeight / 2 - m.y * H * s });
    setSel({ kind: "marker", id: m.id, draft: { ...m } });
  }, [focusMarkerId, initialMarkers, W, H]);

  const toImage = (clientX: number, clientY: number) => {
    const r = container.current!.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.s / W, y: (clientY - r.top - view.y) / view.s / H };
  };

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const el = container.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = cx ?? r.left + el.clientWidth / 2;
    const py = cy ?? r.top + el.clientHeight / 2;
    setView((v) => {
      const minS = Math.min(el.clientWidth / W, el.clientHeight / H) * 0.5;
      const s = Math.max(minS, Math.min(8, v.s * factor));
      const k = s / v.s;
      return { s, x: px - r.left - (px - r.left - v.x) * k, y: py - r.top - (py - r.top - v.y) * k };
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

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.kind === "pan") setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    else if (d.kind === "marker" && d.id && !readOnly) {
      const p = toImage(e.clientX, e.clientY);
      setMarkers((ms) => ms.map((m) => (m.id === d.id ? { ...m, x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) } : m)));
    }
  };
  const onPointerUp = async (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "marker" && d.id) {
      if (d.moved && !readOnly) {
        const m = markers.find((x) => x.id === d.id);
        if (m) {
          const res = await moveMarkerAction(w.worldId, map.id, m.id, m.x, m.y);
          if (!res.ok) toast.error(res.error);
        }
      } else {
        const m = markers.find((x) => x.id === d.id);
        if (m) setSel({ kind: "marker", id: m.id, draft: { ...m } });
      }
      return;
    }
    if (d.moved) return;
    const p = toImage(e.clientX, e.clientY);
    if (p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1) return;
    if (mode === "marker") {
      setSel({ kind: "marker", id: null, draft: { label: "", category: "landmark", x: p.x, y: p.y, color: null, description: "", visibility: "public", layerId: layers[0]?.id ?? null, childMapId: null, entity: null } });
      setMode("view");
    } else if (mode === "region") {
      setDraftPts((pts) => [...pts, [p.x, p.y]]);
    } else setSel(null);
  };

  const finishRegion = () => {
    if (draftPts.length < 3) return toast.error("A region needs at least three points.");
    setSel({ kind: "region", id: null, draft: { name: "", color: "#5bb3a4", points: draftPts, visibility: "public", layerId: layers[0]?.id ?? null, entity: null } });
    setDraftPts([]);
    setMode("view");
  };

  const visible = (vis: string, layerId: string | null) => (!playerView || ["public", "discovered", "partially_known"].includes(vis)) && !(layerId && hiddenLayers.has(layerId));
  const shownMarkers = markers.filter((m) => visible(m.visibility, m.layerId) && !hiddenCats.has(m.category));
  const shownRegions = regions.filter((r) => visible(r.visibility, r.layerId));
  const markerSize = 30;

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className="relative min-h-[18rem] min-w-0 flex-1">
        <div
          ref={container}
          className={cn("absolute inset-0 touch-none select-none overflow-hidden bg-bg-subtle", mode === "view" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={(e) => {
            if (mode === "region") {
              e.preventDefault();
              finishRegion();
            } else zoomAt(1.6, e.clientX, e.clientY);
          }}
          role="application"
          aria-label={`Map of ${map.name}`}
        >
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
            {map.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={map.imageUrl} alt="" width={W} height={H} draggable={false} className="pointer-events-none block max-w-none" />
            ) : (
              <div className="flex size-full items-center justify-center border border-dashed border-line-strong text-faint">No image. Edit the map to upload one.</div>
            )}
            <svg className="absolute inset-0" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              {shownRegions.map((r) => (
                <polygon
                  key={r.id}
                  points={r.points.map(([x, y]) => `${x * W},${y * H}`).join(" ")}
                  fill={r.color}
                  fillOpacity={sel?.kind === "region" && sel.id === r.id ? 0.32 : 0.14}
                  stroke={r.color}
                  strokeWidth={2 / view.s}
                  strokeDasharray={r.visibility === "dm_only" ? `${6 / view.s} ${4 / view.s}` : undefined}
                  className="cursor-pointer"
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (mode === "view") setSel({ kind: "region", id: r.id, draft: { ...r } });
                  }}
                >
                  <title>{r.name}</title>
                </polygon>
              ))}
              {draftPts.length > 0 && (
                <>
                  <polyline points={draftPts.map(([x, y]) => `${x * W},${y * H}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={2 / view.s} strokeDasharray={`${6 / view.s} ${4 / view.s}`} />
                  {draftPts.map(([x, y], i) => (
                    <circle key={i} cx={x * W} cy={y * H} r={4 / view.s} fill="var(--accent)" />
                  ))}
                </>
              )}
            </svg>
            {shownMarkers.map((m) => {
              const cat = MARKER_CATEGORIES[m.category] ?? MARKER_CATEGORIES.custom!;
              const Icon = cat.icon;
              const selected = sel?.kind === "marker" && sel.id === m.id;
              return (
                <button
                  key={m.id}
                  className="group absolute"
                  style={{ left: m.x * W, top: m.y * H, transform: `translate(-50%, -100%) scale(${1 / view.s})`, transformOrigin: "50% 100%" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    drag.current = { kind: "marker", id: m.id, startX: e.clientX, startY: e.clientY, vx: 0, vy: 0, moved: false };
                  }}
                  onPointerMove={onPointerMove}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    onPointerUp(e);
                  }}
                  aria-label={m.label}
                >
                  <span
                    className={cn("relative flex items-center justify-center rounded-full rounded-br-none border-2 shadow-pop transition-transform", selected && "scale-125")}
                    style={{ width: markerSize, height: markerSize, background: "var(--surface)", borderColor: m.color ?? cat.color, color: m.color ?? cat.color, transform: "rotate(45deg)" }}
                  >
                    <Icon className="size-4" style={{ transform: "rotate(-45deg)" }} />
                    {m.visibility === "dm_only" && <span className="absolute -right-1 -top-1 size-2.5 rounded-full border border-surface bg-ember" style={{ transform: "rotate(-45deg)" }} />}
                  </span>
                  <span className={cn("pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-surface/90 px-1.5 py-0.5 text-xs font-medium text-fg shadow", view.s < 0.5 && !selected && "hidden group-hover:block")}>
                    {m.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {/* Toolbar */}
        <div className="absolute left-3 top-3 flex flex-col gap-1 rounded-lg border border-line bg-surface/95 p-1 shadow-pop backdrop-blur">
          <Tooltip content="Pan & select" side="right">
            <Button variant={mode === "view" ? "subtle" : "ghost"} size="icon-sm" onClick={() => (setMode("view"), setDraftPts([]))} aria-label="Pan and select">
              <MousePointer2 />
            </Button>
          </Tooltip>
          {!readOnly && (
            <>
              <Tooltip content="Add a marker (click the map)" side="right">
                <Button variant={mode === "marker" ? "subtle" : "ghost"} size="icon-sm" onClick={() => setMode("marker")} aria-label="Add marker">
                  <MapPin />
                </Button>
              </Tooltip>
              <Tooltip content="Draw a region (click points, double-click to finish)" side="right">
                <Button variant={mode === "region" ? "subtle" : "ghost"} size="icon-sm" onClick={() => setMode("region")} aria-label="Draw region">
                  <Pentagon />
                </Button>
              </Tooltip>
            </>
          )}
          <div className="my-0.5 h-px bg-line" />
          <Button variant="ghost" size="icon-sm" onClick={() => zoomAt(1.4)} aria-label="Zoom in">
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => zoomAt(1 / 1.4)} aria-label="Zoom out">
            <Minus />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={fit} aria-label="Fit to screen">
            <Maximize />
          </Button>
        </div>
        {mode !== "view" && (
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface/95 px-3 py-1.5 text-sm shadow-pop">
            {mode === "marker" ? "Click the map to place a marker" : `Click to add points (${draftPts.length}). Double-click to finish.`}
            {mode === "region" && draftPts.length >= 3 && (
              <Button size="xs" variant="primary" onClick={finishRegion}>
                Finish
              </Button>
            )}
            <button onClick={() => (setMode("view"), setDraftPts([]))} className="text-faint hover:text-fg" aria-label="Cancel">
              <X className="size-4" />
            </button>
          </div>
        )}
        {playerView && <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-fg">Player view: DM-only items hidden</div>}
      </div>

      {/* Side panel */}
      <aside className="flex max-h-[45%] w-full shrink-0 flex-col overflow-y-auto border-t border-line bg-surface md:max-h-none md:w-80 md:border-l md:border-t-0">
        {sel?.kind === "marker" ? (
          <MarkerPanel key={sel.id ?? "new"} readOnly={readOnly} mapId={map.id} draft={sel.draft} id={sel.id} layers={layers} maps={maps.filter((m) => m.id !== map.id)} onClose={() => setSel(null)} onSaved={() => (setSel(null), router.refresh())} />
        ) : sel?.kind === "region" ? (
          <RegionPanel key={sel.id ?? "new"} readOnly={readOnly} mapId={map.id} draft={sel.draft} id={sel.id} layers={layers} onClose={() => setSel(null)} onSaved={() => (setSel(null), router.refresh())} />
        ) : (
          <div className="flex flex-col gap-5 p-4">
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">{playerView ? <Eye className="size-4 text-accent" /> : <EyeOff className="size-4 text-faint" />} Preview as players</span>
              <Switch checked={playerView} onCheckedChange={setPlayerView} />
            </label>
            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-muted">
                <Layers className="size-4" /> Layers
              </h3>
              {layers.map((l) => (
                <LayerRow
                  key={l.id}
                  mapId={map.id}
                  layer={l}
                  shown={!hiddenLayers.has(l.id)}
                  readOnly={readOnly}
                  onToggle={(c) =>
                    setHiddenLayers((s) => {
                      const n = new Set(s);
                      if (c) n.delete(l.id);
                      else n.add(l.id);
                      return n;
                    })
                  }
                  onChanged={() => router.refresh()}
                />
              ))}
              {!readOnly && <form
                className="mt-1 flex gap-1.5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newLayer.trim()) return;
                  const res = await saveLayerAction(w.worldId, map.id, newLayer);
                  if (!res.ok) return toast.error(res.error);
                  setNewLayer("");
                  router.refresh();
                }}
              >
                <Input value={newLayer} onChange={(e) => setNewLayer(e.target.value)} placeholder="New layer" className="h-7 text-sm" aria-label="New layer name" />
                <Button type="submit" size="xs" variant="secondary">
                  Add
                </Button>
              </form>}
            </section>
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-muted">Show</h3>
              <div className="flex flex-wrap gap-1">
                {Object.entries(MARKER_CATEGORIES)
                  .filter(([k]) => markers.some((m) => m.category === k))
                  .map(([k, c]) => (
                    <button
                      key={k}
                      onClick={() => setHiddenCats((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
                      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", hiddenCats.has(k) ? "border-line text-faint line-through" : "border-line-strong")}
                    >
                      <c.icon className="size-3" style={{ color: c.color }} /> {c.label}
                    </button>
                  ))}
              </div>
            </section>
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-muted">Markers</h3>
              <ul className="flex flex-col">
                {shownMarkers
                  .slice()
                  .sort((a, b) => a.label.localeCompare(b.label))
                  .map((m) => {
                    const cat = MARKER_CATEGORIES[m.category] ?? MARKER_CATEGORIES.custom!;
                    return (
                      <li key={m.id}>
                        <button
                          onClick={() => {
                            const el = container.current!;
                            setView((v) => ({ ...v, x: el.clientWidth / 2 - m.x * W * v.s, y: el.clientHeight / 2 - m.y * H * v.s }));
                            setSel({ kind: "marker", id: m.id, draft: { ...m } });
                          }}
                          className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-surface-2"
                        >
                          <cat.icon className="size-3.5 shrink-0" style={{ color: cat.color }} />
                          <span className="min-w-0 flex-1 truncate">{m.label}</span>
                          {m.visibility === "dm_only" && <EyeOff className="size-3 text-ember" />}
                        </button>
                      </li>
                    );
                  })}
                {shownMarkers.length === 0 && <li className="text-sm text-faint">{readOnly ? "No markers yet." : "No markers. Use the pin tool to add one."}</li>}
              </ul>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function MarkerPanel({
  mapId,
  draft,
  id,
  layers,
  maps,
  onClose,
  onSaved,
  readOnly,
}: {
  readOnly: boolean;
  mapId: string;
  draft: Omit<MarkerView, "id">;
  id: string | null;
  layers: { id: string; name: string }[];
  maps: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const w = useWorld();
  const [d, setD] = React.useState(draft);
  const [editing, setEditing] = React.useState(!id);
  const [pending, setPending] = React.useState(false);
  const entity: EntityOption | null = d.entity ? { id: d.entity.id, name: d.entity.name, type: d.entity.type } : null;
  const save = async () => {
    const label = d.label.trim() || d.entity?.name || "";
    if (!label) return toast.error("Give the marker a label or link an entity.");
    setPending(true);
    const res = await saveMarkerAction(w.worldId, mapId, { label, category: d.category, x: d.x, y: d.y, entityId: d.entity?.id ?? null, childMapId: d.childMapId, layerId: d.layerId, color: d.color, description: d.description, visibility: d.visibility as "public" }, id ?? undefined);
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    onSaved();
  };
  if ((!editing || readOnly) && id) {
    const cat = MARKER_CATEGORIES[d.category] ?? MARKER_CATEGORIES.custom!;
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-xs" style={{ color: cat.color }}>
              <cat.icon className="size-3.5" /> {cat.label}
              {d.visibility === "dm_only" && <span className="text-ember">· DM only</span>}
            </p>
            <p className="font-serif text-xl font-semibold">{d.label}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        {d.entity && (
          <Link href={`/w/${w.worldId}/e/${d.entity.id}`} className="rounded-md border border-line px-3 py-2 hover:border-line-strong">
            <span className="flex items-center gap-2 font-medium">
              <TypeIcon type={d.entity.type} /> {d.entity.name}
            </span>
            {d.entity.summary && <span className="mt-0.5 block text-sm text-muted">{d.entity.summary}</span>}
          </Link>
        )}
        {d.description && <p className="whitespace-pre-line text-sm text-muted">{d.description}</p>}
        {d.childMapId && (
          <Button asChild variant="primary" size="sm">
            <Link href={`/w/${w.worldId}/maps/${d.childMapId}`}>
              <MapIcon /> Open {maps.find((m) => m.id === d.childMapId)?.name ?? "map"}
            </Link>
          </Button>
        )}
        {!readOnly && (
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Edit marker
            </Button>
            <p className="text-xs text-faint">Tip: drag markers on the map to move them.</p>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{id ? "Edit marker" : "New marker"}</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>
      <Field label="Linked entity">
        <EntityPicker
          value={entity}
          onChange={(e) => setD((x) => ({ ...x, entity: e ? { ...e, summary: "" } : null, label: x.label || e?.name || "", category: e ? guessCategory(e.type) : x.category }))}
          placeholder="Link a place, NPC, quest…"
          size="sm"
        />
      </Field>
      <Field label="Label" htmlFor="mk-label">
        <Input id="mk-label" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} className="h-7 text-sm" autoFocus={!id} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Category" htmlFor="mk-cat">
          <NativeSelect id="mk-cat" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} className="h-7 text-sm">
            {Object.entries(MARKER_CATEGORIES).map(([k, c]) => (
              <option key={k} value={k}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Layer" htmlFor="mk-layer">
          <NativeSelect id="mk-layer" value={d.layerId ?? ""} onChange={(e) => setD({ ...d, layerId: e.target.value || null })} className="h-7 text-sm">
            <option value="">None</option>
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Opens map" htmlFor="mk-child" hint="For nested maps: a city marker that opens the city map.">
        <NativeSelect id="mk-child" value={d.childMapId ?? ""} onChange={(e) => setD({ ...d, childMapId: e.target.value || null })} className="h-7 text-sm">
          <option value="">None</option>
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Notes" htmlFor="mk-desc">
        <Textarea id="mk-desc" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className="min-h-16 text-sm" />
      </Field>
      <Field label="Who can see it">
        <Segmented
          size="sm"
          value={d.visibility === "dm_only" ? "dm_only" : "public"}
          onChange={(v) => setD({ ...d, visibility: v })}
          options={[
            { value: "public", label: "Everyone" },
            { value: "dm_only", label: "DM only" },
          ]}
        />
      </Field>
      <div className="flex gap-2">
        {id && (
          <ConfirmDialog
            trigger={
              <Button variant="danger-ghost" size="sm" aria-label="Delete marker">
                <Trash2 />
              </Button>
            }
            title="Delete this marker?"
            description="The entry it points to is not affected."
            onConfirm={async () => {
              const res = await deleteMarkerAction(w.worldId, mapId, id);
              if (!res.ok) return void toast.error(res.error);
              onSaved();
            }}
          />
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={id ? () => setEditing(false) : onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={save} loading={pending}>
          Save
        </Button>
      </div>
    </div>
  );
}

function LayerRow({
  mapId,
  layer,
  shown,
  readOnly,
  onToggle,
  onChanged,
}: {
  mapId: string;
  layer: { id: string; name: string; visibleByDefault?: boolean };
  shown: boolean;
  readOnly: boolean;
  onToggle: (shown: boolean) => void;
  onChanged: () => void;
}) {
  const w = useWorld();
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(layer.name);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const save = async (patch: { name?: string; visibleByDefault?: boolean }) => {
    const res = await saveLayerAction(w.worldId, mapId, patch.name ?? layer.name, layer.id, { visibleByDefault: patch.visibleByDefault });
    if (!res.ok) return void toast.error(res.error);
    setRenaming(false);
    onChanged();
  };
  if (renaming)
    return (
      <form
        className="flex gap-1.5 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save({ name });
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-sm" autoFocus aria-label="Layer name" onKeyDown={(e) => e.key === "Escape" && setRenaming(false)} />
        <Button type="submit" size="xs" variant="secondary">
          Save
        </Button>
      </form>
    );
  return (
    <div className="group flex items-center justify-between gap-2 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate">
        {layer.name}
        {layer.visibleByDefault === false && <span className="ml-1.5 text-xs text-faint">hidden at first</span>}
      </span>
      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="hover-reveal rounded p-0.5 text-faint hover:bg-surface-2 hover:text-fg" aria-label={`Layer options for ${layer.name}`}>
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => save({ visibleByDefault: layer.visibleByDefault === false })}>{layer.visibleByDefault === false ? "Show when the map opens" : "Hide when the map opens"}</DropdownMenuItem>
            <DropdownMenuItem danger onSelect={() => setConfirmDelete(true)}>
              Delete layer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Switch checked={shown} onCheckedChange={onToggle} aria-label={`Show ${layer.name}`} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete the "${layer.name}" layer?`}
        description="Its markers and regions stay on the map, without a layer."
        onConfirm={async () => {
          const res = await deleteLayerAction(w.worldId, mapId, layer.id);
          if (!res.ok) return void toast.error(res.error);
          onChanged();
        }}
      />
    </div>
  );
}

function guessCategory(type: string) {
  const map: Record<string, string> = { settlement: "settlement", nation: "settlement", dungeon: "dungeon", landmark: "landmark", location: "landmark", shop: "shop", tavern: "tavern", npc: "npc", quest: "quest", faction: "faction", organization: "faction", region: "landmark" };
  return map[type] ?? "custom";
}

function RegionPanel({ mapId, draft, id, layers, onClose, onSaved, readOnly }: { readOnly: boolean; mapId: string; draft: Omit<RegionView, "id">; id: string | null; layers: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const w = useWorld();
  const [d, setD] = React.useState(draft);
  const [pending, setPending] = React.useState(false);
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{id ? "Region" : "New region"}</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>
      {d.entity && id && (
        <Link href={`/w/${w.worldId}/e/${d.entity.id}`} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium hover:border-line-strong">
          <TypeIcon type={d.entity.type} /> {d.entity.name}
        </Link>
      )}
      {readOnly ? (
        <p className="font-serif text-xl font-semibold">{d.name}</p>
      ) : (
      <>
      <Field label="Name" htmlFor="rg-name">
        <Input id="rg-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="h-7 text-sm" autoFocus={!id} />
      </Field>
      <Field label="Linked entity">
        <EntityPicker value={d.entity} onChange={(e) => setD({ ...d, entity: e, name: d.name || e?.name || "" })} placeholder="A region, nation…" size="sm" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Colour" htmlFor="rg-color">
          <input id="rg-color" type="color" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} className="h-7 w-full cursor-pointer rounded border border-line bg-surface" />
        </Field>
        <Field label="Layer" htmlFor="rg-layer">
          <NativeSelect id="rg-layer" value={d.layerId ?? ""} onChange={(e) => setD({ ...d, layerId: e.target.value || null })} className="h-7 text-sm">
            <option value="">None</option>
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Who can see it">
        <Segmented
          size="sm"
          value={d.visibility === "dm_only" ? "dm_only" : "public"}
          onChange={(v) => setD({ ...d, visibility: v })}
          options={[
            { value: "public", label: "Everyone" },
            { value: "dm_only", label: "DM only" },
          ]}
        />
      </Field>
      <div className="flex gap-2">
        {id && (
          <ConfirmDialog
            trigger={
              <Button variant="danger-ghost" size="sm" aria-label="Delete region">
                <Trash2 />
              </Button>
            }
            title="Delete this region?"
            description="The entry it points to is not affected."
            onConfirm={async () => {
              const res = await deleteRegionAction(w.worldId, mapId, id);
              if (!res.ok) return void toast.error(res.error);
              onSaved();
            }}
          />
        )}
        <div className="flex-1" />
        <Button
          variant="primary"
          size="sm"
          loading={pending}
          onClick={async () => {
            if (!d.name.trim()) return toast.error("Name the region.");
            setPending(true);
            const res = await saveRegionAction(w.worldId, mapId, { name: d.name, color: d.color, points: d.points, entityId: d.entity?.id ?? null, layerId: d.layerId, visibility: d.visibility as "public" }, id ?? undefined);
            setPending(false);
            if (!res.ok) return toast.error(res.error);
            onSaved();
          }}
        >
          Save region
        </Button>
      </div>
      </>
      )}
    </div>
  );
}
