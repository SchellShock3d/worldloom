import { notFound } from "next/navigation";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getEntity } from "@/server/services/entities";
import { surroundings } from "@/server/services/build-out";
import { planFor } from "@/lib/build-out";
import { BuildOut } from "./build-out";

export async function generateMetadata({ params }: { params: Promise<{ worldId: string; entityId: string }> }) {
  const { worldId, entityId } = await params;
  await requireWorld(worldId);
  const e = await getEntity(await getDb(), worldId, entityId);
  return { title: e ? `Build out ${e.name}` : "Not found" };
}

export default async function BuildOutPage({ params, searchParams }: { params: Promise<{ worldId: string; entityId: string }>; searchParams: Promise<{ parts?: string }> }) {
  const { worldId, entityId } = await params;
  const { parts } = await searchParams;
  await requireWorld(worldId, "editor");
  const db = await getDb();
  const entity = await getEntity(db, worldId, entityId);
  if (!entity) notFound();
  const plan = planFor(entity.type);
  const around = await surroundings(db, worldId, entity);
  const wanted = (parts ?? "").split(",").filter((k) => plan.sections.some((s) => s.key === k));
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <BuildOut
        entity={{ id: entity.id, name: entity.name, type: entity.type, summary: entity.summary, fields: entity.fields, visibility: entity.visibility }}
        around={around.map((a) => ({ id: a.id, name: a.name, type: a.type, how: a.how }))}
        preselect={wanted.length ? wanted : null}
      />
    </div>
  );
}
