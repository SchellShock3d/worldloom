import Link from "next/link";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { CollectionView } from "@/components/entity/collection-page";
import { ENTITY_GROUPS, ENTITY_TYPES } from "@/lib/entity-types";
import { getCustomTypes } from "@/server/services/entities";
import { TypeIcon } from "@/components/entity/type-icon";

export const metadata = { title: "Wiki" };

export default async function WikiPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { worldId } = await params;
  await requireWorld(worldId);
  const db = await getDb();
  const { campaign } = await getActiveCampaign(worldId);
  const custom = await getCustomTypes(db, worldId);
  const types = [...ENTITY_TYPES.map((t) => t.key), ...custom.map((c) => c.key)];
  return (
    <div>
      <CollectionView
        db={db}
        worldId={worldId}
        campaignId={campaign?.id ?? null}
        spec={{ title: "Wiki", description: "Everything in your world, interlinked. Type @ in any article to link entries; backlinks appear automatically.", types, path: `/w/${worldId}/wiki` }}
        searchParams={await searchParams}
      />
      <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <h2 className="mb-3 text-sm font-semibold text-muted">Create a page</h2>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {ENTITY_GROUPS.map((g) => (
            <div key={g.key}>
              <p className="mb-1 text-xs text-faint">{g.label}</p>
              <ul className="flex flex-col">
                {ENTITY_TYPES.filter((t) => t.group === g.key && (!t.campaignScoped || campaign)).map((t) => (
                  <li key={t.key}>
                    <Link href={`/w/${worldId}/new?type=${t.key}`} className="inline-flex items-center gap-2 rounded px-1 py-0.5 text-sm text-muted hover:text-fg">
                      <TypeIcon type={t.key} className="size-3.5" /> {t.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {custom.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-faint">Custom types</p>
              <ul>
                {custom.map((c) => (
                  <li key={c.key}>
                    <Link href={`/w/${worldId}/new?type=${c.key}`} className="text-sm text-muted hover:text-fg">
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
