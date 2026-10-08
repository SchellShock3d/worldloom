import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { Map as MapIcon } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { mapMarkers, maps } from "@/server/db/schema";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { NewMapButton } from "@/components/maps/new-map-dialog";

export const metadata = { title: "Maps" };

export default async function MapsPage({ params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  await requireWorld(worldId);
  const db = await getDb();
  const rows = await db
    .select({ map: maps, markers: sql<number>`count(${mapMarkers.id})::int` })
    .from(maps)
    .leftJoin(mapMarkers, eq(mapMarkers.mapId, maps.id))
    .where(eq(maps.worldId, worldId))
    .groupBy(maps.id)
    .orderBy(asc(maps.position), asc(maps.name));
  const roots = rows.filter((r) => !r.map.parentMapId);
  const childrenOf = (id: string) => rows.filter((r) => r.map.parentMapId === id);
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader icon={<MapIcon />} title="Maps" description="Upload your maps, pin places and people, draw regions, and nest maps inside each other: world, region, city, dungeon." actions={<NewMapButton maps={rows.map((r) => ({ id: r.map.id, name: r.map.name }))} />} />
      {rows.length === 0 ? (
        <EmptyState icon={<MapIcon />} title="No maps yet" action={<NewMapButton maps={[]} />}>
          Upload a PNG, JPEG or WebP image of your world. Markers are stored relative to the image, so you can replace it later.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {roots.map((r) => (
            <section key={r.map.id}>
              <MapCard worldId={worldId} m={r.map} markers={r.markers} large />
              {childrenOf(r.map.id).length > 0 && (
                <ul className="mt-3 grid gap-3 pl-4 sm:grid-cols-2 lg:grid-cols-4">
                  {childrenOf(r.map.id).map((c) => (
                    <li key={c.map.id}>
                      <MapCard worldId={worldId} m={c.map} markers={c.markers} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {rows.filter((r) => r.map.parentMapId && !rows.some((p) => p.map.id === r.map.parentMapId)).map((r) => (
            <MapCard key={r.map.id} worldId={worldId} m={r.map} markers={r.markers} />
          ))}
        </div>
      )}
    </div>
  );
}

function MapCard({ worldId, m, markers, large }: { worldId: string; m: typeof maps.$inferSelect; markers: number; large?: boolean }) {
  return (
    <Link href={`/w/${worldId}/maps/${m.id}`} className="group block overflow-hidden rounded-lg border border-line bg-surface hover:border-line-strong">
      <div className={large ? "aspect-[21/8] overflow-hidden bg-surface-3" : "aspect-[16/10] overflow-hidden bg-surface-3"}>
        {m.imageFileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${m.imageFileId}`} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex size-full items-center justify-center text-faint">
            <MapIcon className="size-8" />
          </div>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2 px-4 py-2.5">
        <span className={large ? "font-serif text-xl font-semibold" : "font-medium"}>{m.name}</span>
        <span className="text-xs text-faint tabular">{markers} markers</span>
      </div>
    </Link>
  );
}
