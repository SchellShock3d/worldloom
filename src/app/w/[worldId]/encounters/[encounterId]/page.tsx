import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { ChevronLeft, MapPin, ScrollText } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { campaigns, encounterCombatants, encounters, entities } from "@/server/db/schema";
import { Panel, PanelHeader } from "@/components/ui/display";
import { InitiativeTracker } from "@/components/play/initiative-tracker";
import { EncounterDialogButton } from "../encounter-dialog";
import { DeleteEncounterButton } from "./delete-encounter";

export async function generateMetadata({ params }: { params: Promise<{ worldId: string; encounterId: string }> }) {
  const { worldId, encounterId } = await params;
  const db = await getDb();
  const [e] = await db.select({ name: encounters.name }).from(encounters).where(and(eq(encounters.id, encounterId), eq(encounters.worldId, worldId)));
  return { title: e?.name ?? "Encounter" };
}

export default async function EncounterPage({ params }: { params: Promise<{ worldId: string; encounterId: string }> }) {
  const { worldId, encounterId } = await params;
  const { role } = await requireWorld(worldId);
  const db = await getDb();
  const [e] = await db.select().from(encounters).where(and(eq(encounters.id, encounterId), eq(encounters.worldId, worldId)));
  if (!e) notFound();
  const { campaign: active } = await getActiveCampaign(worldId);
  const campaignId = e.campaignId ?? active?.id ?? null;
  const [combatants, refs, pcs, owner] = await Promise.all([
    db.select().from(encounterCombatants).where(eq(encounterCombatants.encounterId, e.id)).orderBy(asc(encounterCombatants.position)),
    [e.locationId, e.questId].some(Boolean)
      ? db.select({ id: entities.id, name: entities.name, type: entities.type }).from(entities).where(inArray(entities.id, [e.locationId, e.questId].filter((x): x is string => !!x)))
      : Promise.resolve([]),
    campaignId ? db.select({ fields: entities.fields, status: entities.status }).from(entities).where(and(eq(entities.campaignId, campaignId), eq(entities.type, "pc"))) : Promise.resolve([]),
    e.campaignId ? db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.id, e.campaignId)) : Promise.resolve([]),
  ]);
  const loc = refs.find((r) => r.id === e.locationId) ?? null;
  const quest = refs.find((r) => r.id === e.questId) ?? null;
  const levels = pcs.filter((p) => p.status !== "dead").map((p) => Number((p.fields as { level?: number }).level ?? 1));
  const canEdit = role === "owner" || role === "editor";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href={`/w/${worldId}/encounters`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" /> Encounters
      </Link>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold leading-tight">{e.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted">
            {loc && (
              <Link href={`/w/${worldId}/e/${loc.id}`} className="inline-flex items-center gap-1 hover:text-fg">
                <MapPin className="size-3.5" /> {loc.name}
              </Link>
            )}
            {quest && (
              <Link href={`/w/${worldId}/e/${quest.id}`} className="inline-flex items-center gap-1 hover:text-fg">
                <ScrollText className="size-3.5" /> {quest.name}
              </Link>
            )}
            <span className="text-faint">{owner[0] ? `${owner[0].name} only` : "Any campaign"}</span>
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <EncounterDialogButton
              campaign={active ? { id: active.id, name: active.name } : null}
              initial={{ id: e.id, name: e.name, description: e.description, rewards: e.rewards, notes: e.notes, location: loc, quest, campaignId: e.campaignId }}
            />
            <DeleteEncounterButton encounterId={e.id} name={e.name} />
          </div>
        )}
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel className="p-4">
          {canEdit ? (
            <InitiativeTracker encounter={{ ...e, campaignId }} combatants={combatants} partyLevels={levels} />
          ) : (
            <p className="text-sm text-muted">{combatants.filter((c) => !c.hidden).length} combatants.</p>
          )}
          {!levels.length && combatants.some((c) => c.side === "enemy") && <p className="mt-3 text-xs text-faint">Add player characters to a campaign to rate this encounter&apos;s difficulty.</p>}
        </Panel>
        <div className="flex flex-col gap-4">
          {e.description && (
            <Panel>
              <PanelHeader title="Set-up" />
              <p className="whitespace-pre-line px-4 pb-4 text-sm text-muted">{e.description}</p>
            </Panel>
          )}
          {e.rewards && (
            <Panel>
              <PanelHeader title="Rewards" />
              <p className="whitespace-pre-line px-4 pb-4 text-sm">{e.rewards}</p>
            </Panel>
          )}
          {canEdit && e.notes && (
            <Panel>
              <PanelHeader title="Private notes" />
              <p className="whitespace-pre-line px-4 pb-4 text-sm text-muted">{e.notes}</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
