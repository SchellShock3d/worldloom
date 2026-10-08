import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { blankFormValue } from "@/server/services/entity-form-data";
import { EntityForm } from "@/components/entity/entity-form";
import { getEntityType, ENTITY_TYPE_MAP } from "@/lib/entity-types";
import { getCustomTypes } from "@/server/services/entities";
import { lowerLabel } from "@/lib/utils";

export const metadata = { title: "New entry" };

export default async function NewEntityPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<{ type?: string; location?: string; name?: string }> }) {
  const { worldId } = await params;
  const sp = await searchParams;
  const { world } = await requireWorld(worldId, "editor");
  const db = await getDb();
  const { campaign } = await getActiveCampaign(worldId);
  const custom = await getCustomTypes(db, worldId);
  const type = sp.type && (ENTITY_TYPE_MAP[sp.type] || custom.some((c) => c.key === sp.type)) ? sp.type : "npc";
  const def = getEntityType(type, custom);
  const initial = await blankFormValue(db, type, { now: campaign?.currentAt ?? world.currentAt, campaignId: campaign?.id ?? null, locationId: sp.location, name: sp.name });
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href={`/w/${worldId}/wiki`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" /> Wiki
      </Link>
      <p className="mb-2 text-sm text-faint">New {lowerLabel(def.label)}</p>
      <EntityForm initial={initial} mode="create" />
    </div>
  );
}
