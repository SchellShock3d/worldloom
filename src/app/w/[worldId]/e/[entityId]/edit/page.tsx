import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getEntity } from "@/server/services/entities";
import { collectRefs } from "@/server/services/refs";
import { formValueFor } from "@/server/services/entity-form-data";
import { EntityForm } from "@/components/entity/entity-form";

export const metadata = { title: "Edit" };

export default async function EditEntityPage({ params }: { params: Promise<{ worldId: string; entityId: string }> }) {
  const { worldId, entityId } = await params;
  await requireWorld(worldId, "editor");
  const db = await getDb();
  const e = await getEntity(db, worldId, entityId);
  if (!e) notFound();
  const [initial, refs] = await Promise.all([formValueFor(db, worldId, e), collectRefs(db, worldId, e.body, e.dmNotes)]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href={`/w/${worldId}/e/${e.id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" /> Back to {e.name}
      </Link>
      <EntityForm initial={initial} refs={refs} mode="edit" />
    </div>
  );
}
