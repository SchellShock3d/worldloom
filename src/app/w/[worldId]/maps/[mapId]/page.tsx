import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ChevronRight, Map as MapIcon } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { entities, mapLayers, mapMarkers, mapRegions, maps } from "@/server/db/schema";
import { MapViewer, type MarkerView, type RegionView } from "@/components/maps/map-viewer";
import { NewMapButton } from "@/components/maps/new-map-dialog";
import { TypeIcon } from "@/components/entity/type-icon";
import { MapSettingsButton } from "./map-settings";

export async function generateMetadata({ params }: { params: Promise<{ worldId: string; mapId: string }> }) {
  const { worldId, mapId } = await params;
  const db = await getDb();
  const [m] = await db.select({ name: maps.name }).from(maps).where(and(eq(maps.id, mapId), eq(maps.worldId, worldId)));
  return { title: m?.name ?? "Map" };
}

export default async function MapPage({ params, searchParams }: { params: Promise<{ worldId: string; mapId: string }>; searchParams: Promise<{ marker?: string }> }) {
  const { worldId, mapId } = await params;
  const { marker } = await searchParams;
  const { role } = await requireWorld(worldId);
  const db = await getDb();
  const all = await db.select().from(maps).where(eq(maps.worldId, worldId)).orderBy(asc(maps.position), asc(maps.name));
  const map = all.find((m) => m.id === mapId);
  if (!map) notFound();

  const [markerRows, regionRows, layers, depicts] = await Promise.all([
    db
      .select({ m: mapMarkers, e: { id: entities.id, name: entities.name, type: entities.type, summary: entities.summary } })
      .from(mapMarkers)
      .leftJoin(entities, eq(entities.id, mapMarkers.entityId))
      .where(eq(mapMarkers.mapId, mapId))
      .orderBy(asc(mapMarkers.label)),
    db
      .select({ r: mapRegions, e: { id: entities.id, name: entities.name, type: entities.type } })
      .from(mapRegions)
      .leftJoin(entities, eq(entities.id, mapRegions.entityId))
      .where(eq(mapRegions.mapId, mapId))
      .orderBy(asc(mapRegions.name)),
    db.select({ id: mapLayers.id, name: mapLayers.name, visibleByDefault: mapLayers.visibleByDefault }).from(mapLayers).where(eq(mapLayers.mapId, mapId)).orderBy(asc(mapLayers.position)),
    map.entityId ? db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(eq(entities.id, map.entityId)) : Promise.resolve([]),
  ]);

  const markers: MarkerView[] = markerRows.map(({ m, e }) => ({
    id: m.id,
    label: m.label,
    category: m.category,
    x: m.x,
    y: m.y,
    color: m.color,
    description: m.description,
    visibility: m.visibility,
    layerId: m.layerId,
    childMapId: m.childMapId,
    entity: e?.id ? { id: e.id, name: e.name, type: e.type, summary: e.summary } : null,
  }));
  const regions: RegionView[] = regionRows.map(({ r, e }) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    points: r.points,
    visibility: r.visibility,
    layerId: r.layerId,
    entity: e?.id ? { id: e.id, name: e.name, type: e.type } : null,
  }));

  // Breadcrumb up the parent chain (guarding against accidental cycles).
  const chain: (typeof all)[number][] = [];
  let cursor = map.parentMapId ? all.find((m) => m.id === map.parentMapId) : undefined;
  while (cursor && chain.length < 10 && !chain.includes(cursor)) {
    chain.unshift(cursor);
    cursor = cursor.parentMapId ? all.find((m) => m.id === cursor!.parentMapId) : undefined;
  }
  const children = all.filter((m) => m.parentMapId === map.id);
  const canEdit = role === "owner" || role === "editor";
  const place = depicts[0];

  return (
    <div className="flex h-full min-h-[32rem] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <nav aria-label="Map hierarchy" className="flex flex-wrap items-center gap-1 text-xs text-faint">
            <Link href={`/w/${worldId}/maps`} className="hover:text-fg">
              Maps
            </Link>
            {chain.map((c) => (
              <span key={c.id} className="flex items-center gap-1">
                <ChevronRight className="size-3" />
                <Link href={`/w/${worldId}/maps/${c.id}`} className="hover:text-fg">
                  {c.name}
                </Link>
              </span>
            ))}
          </nav>
          <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight">
            <MapIcon className="size-5 text-faint" />
            {map.name}
            {place && (
              <Link href={`/w/${worldId}/e/${place.id}`} className="ml-1 inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 font-sans text-xs font-normal text-muted hover:text-fg">
                <TypeIcon type={place.type} className="size-3.5" />
                {place.name}
              </Link>
            )}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {children.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-faint">Maps inside this one:</span>
              {children.map((c) => (
                <Link key={c.id} href={`/w/${worldId}/maps/${c.id}`} className="rounded-md border border-line px-2 py-1 text-muted hover:border-line-strong hover:text-fg">
                  {c.name}
                </Link>
              ))}
            </div>
          )}
          {canEdit && (
            <>
              <NewMapButton maps={all.map((m) => ({ id: m.id, name: m.name }))} parentMapId={map.id} label="Nested map" variant="ghost" />
              <MapSettingsButton
                map={{ id: map.id, name: map.name, description: map.description, parentMapId: map.parentMapId, imageFileId: map.imageFileId, scaleDistance: map.scaleDistance, scaleUnit: map.scaleUnit, width: map.width, height: map.height }}
                place={place ?? null}
                maps={all.filter((m) => m.id !== map.id).map((m) => ({ id: m.id, name: m.name }))}
              />
            </>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <MapViewer
          map={{ id: map.id, name: map.name, imageUrl: map.imageFileId ? `/api/files/${map.imageFileId}` : null, width: map.width ?? 1600, height: map.height ?? 1000 }}
          markers={markers}
          regions={regions}
          layers={layers}
          maps={all.filter((m) => m.id !== map.id).map((m) => ({ id: m.id, name: m.name }))}
          focusMarkerId={marker ?? null}
          readOnly={!canEdit}
        />
      </div>
    </div>
  );
}
