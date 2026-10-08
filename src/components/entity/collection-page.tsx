import Link from "next/link";
import { inArray, and, eq, ne, sql } from "drizzle-orm";
import { Plus, Search } from "lucide-react";
import type { DB } from "@/server/db/client";
import { entities, campaignEntityStates } from "@/server/db/schema";
import { listEntities, listTags, getCustomTypes, campaignScope } from "@/server/services/entities";
import { getEntityType, type EntityTypeDef } from "@/lib/entity-types";
import { EntityTable } from "./entity-table";
import { TypeIcon } from "./type-icon";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CollectionSpec {
  title: string;
  description: string;
  types: string[];
  path: string;
}

export async function CollectionView({
  db,
  worldId,
  campaignId,
  spec,
  searchParams,
}: {
  db: DB;
  worldId: string;
  campaignId: string | null;
  spec: CollectionSpec;
  searchParams: { type?: string; q?: string; tag?: string; status?: string; sort?: string; canon?: string };
}) {
  const custom = await getCustomTypes(db, worldId);
  const activeType = searchParams.type && spec.types.includes(searchParams.type) ? searchParams.type : null;
  const types = activeType ? [activeType] : spec.types;
  const canon = searchParams.canon === "archived" ? (["archived"] as const) : searchParams.canon === "drafts" ? (["draft", "proposed"] as const) : undefined;
  const rows = await listEntities(db, worldId, {
    types: types.length ? types : undefined,
    campaignId,
    q: searchParams.q,
    tag: searchParams.tag,
    status: searchParams.status,
    sort: (searchParams.sort as "name" | "updated" | "importance") ?? "name",
    canon: canon ? [...canon] : undefined,
  });
  const counts = spec.types.length > 1 ? await countByType(db, worldId, spec.types, campaignId) : {};
  const locIds = Array.from(new Set(rows.map((r) => r.locationId).filter((x): x is string => !!x)));
  const locs = locIds.length ? await db.select({ id: entities.id, name: entities.name }).from(entities).where(inArray(entities.id, locIds)) : [];
  const overlays = campaignId && rows.length ? await db.select().from(campaignEntityStates).where(and(eq(campaignEntityStates.campaignId, campaignId), inArray(campaignEntityStates.entityId, rows.map((r) => r.id)))) : [];
  const tags = await listTags(db, worldId);
  const defs: EntityTypeDef[] = spec.types.map((t) => getEntityType(t, custom));
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { ...searchParams, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `${spec.path}${s ? `?${s}` : ""}`;
  };
  const createType = activeType ?? spec.types[0] ?? "lore";
  const statuses = activeType ? (getEntityType(activeType, custom).statuses ?? []) : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={spec.title}
        description={spec.description}
        actions={
          <Button asChild variant="primary">
            <Link href={`/w/${worldId}/new?type=${createType}`}>
              <Plus /> New {getEntityType(createType, custom).label.toLowerCase()}
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {spec.types.length > 1 && (
          <nav aria-label="Filter by type" className="flex flex-wrap gap-1">
            <Link href={qs({ type: undefined, status: undefined })} className={cn("rounded-full px-3 py-1 text-sm", !activeType ? "bg-surface-3 font-medium text-fg" : "text-muted hover:bg-surface-2")}>
              All <span className="text-faint tabular">{Object.values(counts).reduce((a, b) => a + b, 0)}</span>
            </Link>
            {defs.map((d) => (
              <Link key={d.key} href={qs({ type: d.key, status: undefined })} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm", activeType === d.key ? "bg-surface-3 font-medium text-fg" : "text-muted hover:bg-surface-2")}>
                <TypeIcon type={d.key} className="size-3.5" />
                {d.plural} <span className="text-faint tabular">{counts[d.key] ?? 0}</span>
              </Link>
            ))}
          </nav>
        )}
        <div className="flex-1" />
        <form action={spec.path} className="relative">
          {Object.entries(searchParams)
            .filter(([k, v]) => k !== "q" && v)
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input name="q" defaultValue={searchParams.q} placeholder="Filter by name…" className="h-8 w-56 rounded-md border border-line bg-surface pl-8 pr-2.5 text-sm outline-none placeholder:text-faint focus:border-accent" />
        </form>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {statuses.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            <span className="text-faint">Status:</span>
            {statuses.map((s) => (
              <Link key={s} href={qs({ status: searchParams.status === s ? undefined : s })} className={cn("rounded px-2 py-0.5", searchParams.status === s ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>
                {s}
              </Link>
            ))}
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="text-faint">Sort:</span>
          {[
            ["name", "Name"],
            ["updated", "Recently edited"],
            ["importance", "Importance"],
          ].map(([k, l]) => (
            <Link key={k} href={qs({ sort: k === "name" ? undefined : k })} className={cn("rounded px-2 py-0.5", (searchParams.sort ?? "name") === k ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>
              {l}
            </Link>
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-faint">Show:</span>
          {[
            [undefined, "Canon"],
            ["drafts", "Drafts & proposed"],
            ["archived", "Archived"],
          ].map(([k, l]) => (
            <Link key={l} href={qs({ canon: k })} className={cn("rounded px-2 py-0.5", searchParams.canon === k ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>
              {l}
            </Link>
          ))}
        </span>
        {searchParams.tag && (
          <Link href={qs({ tag: undefined })} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-accent">
            #{searchParams.tag} ×
          </Link>
        )}
      </div>
      {rows.length ? (
        <EntityTable worldId={worldId} rows={rows} locations={Object.fromEntries(locs.map((l) => [l.id, l.name]))} custom={custom} overlays={Object.fromEntries(overlays.map((o) => [o.entityId, { status: o.status, reputation: o.reputation, knowledge: o.knowledge }]))} />
      ) : (
        <EmptyState
          title={searchParams.q || searchParams.tag || searchParams.status ? "Nothing matches those filters" : `No ${spec.title.toLowerCase()} yet`}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href={`/w/${worldId}/new?type=${createType}`}>
                <Plus /> Create one
              </Link>
            </Button>
          }
        >
          {spec.description}
        </EmptyState>
      )}
      {tags.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-faint">Tags:</span>
          {tags.map((t) => (
            <Link key={t.name} href={qs({ tag: t.name })} className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted hover:text-fg">
              #{t.name} <span className="text-faint">{t.n}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

async function countByType(db: DB, worldId: string, types: string[], campaignId: string | null) {
  const rows = await db
    .select({ type: entities.type, n: sql<number>`count(*)::int` })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), inArray(entities.type, types), ne(entities.canonStatus, "archived"), campaignScope(campaignId)))
    .groupBy(entities.type);
  return Object.fromEntries(rows.map((r) => [r.type, r.n])) as Record<string, number>;
}
