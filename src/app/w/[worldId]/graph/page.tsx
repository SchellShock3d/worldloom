import { and, eq, inArray } from "drizzle-orm";
import { Waypoints } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { entities } from "@/server/db/schema";
import { getGraph } from "@/server/services/relationships";
import { getCustomTypes } from "@/server/services/entities";
import { ENTITY_GROUPS, ENTITY_TYPES, getEntityType, type EntityGroup } from "@/lib/entity-types";
import { clamp } from "@/lib/utils";
import { GraphView } from "./graph-view";

export const metadata = { title: "Relationships" };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function GraphPage({
  params,
  searchParams,
}: {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ focus?: string; depth?: string; groups?: string; places?: string }>;
}) {
  const { worldId } = await params;
  const sp = await searchParams;
  await requireWorld(worldId);
  const db = await getDb();
  const { campaign } = await getActiveCampaign(worldId);
  const focusId = sp.focus && UUID.test(sp.focus) ? sp.focus : undefined;
  const depth = clamp(Number.parseInt(sp.depth ?? "2", 10) || 2, 1, 3);
  const groups = (sp.groups ?? "").split(",").filter((g): g is EntityGroup => ENTITY_GROUPS.some((x) => x.key === g));
  const custom = await getCustomTypes(db, worldId);
  const types = groups.length ? [...ENTITY_TYPES.filter((t) => groups.includes(t.group)).map((t) => t.key), ...custom.filter((c) => groups.includes(getEntityType(c.key, custom).group)).map((c) => c.key)] : undefined;
  const showPlaces = sp.places !== "0";

  const graph = await getGraph(db, worldId, { focusId, depth, types, campaignId: campaign?.id ?? null, limit: 250 });
  const edges = showPlaces ? graph.edges : graph.edges.filter((e) => !e.derived);
  const focus = focusId ? ((await db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(and(eq(entities.worldId, worldId), eq(entities.id, focusId))))[0] ?? null) : null;
  const summaries = graph.nodes.length
    ? await db.select({ id: entities.id, summary: entities.summary }).from(entities).where(inArray(entities.id, graph.nodes.map((n) => n.id)))
    : [];
  const summaryOf = new Map(summaries.map((s) => [s.id, s.summary]));

  return (
    <div className="flex h-full min-h-[32rem] flex-col">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight">
            <Waypoints className="size-5 text-faint" /> Relationships
          </h1>
          <p className="text-sm text-muted">Who serves, loves, fears and owes whom. Drag to rearrange; select someone to trace their ties.</p>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <GraphView
          key={`${focusId ?? "all"}-${depth}-${groups.join(",")}-${showPlaces}`}
          nodes={graph.nodes.map((n) => ({ ...n, summary: summaryOf.get(n.id) ?? "" }))}
          edges={edges}
          focus={focus}
          depth={depth}
          groups={groups}
          showPlaces={showPlaces}
          campaignName={campaign?.name ?? null}
        />
      </div>
    </div>
  );
}
