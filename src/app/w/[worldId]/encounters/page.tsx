import Link from "next/link";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { MapPin, ScrollText, Swords } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { encounterCombatants, encounters, entities } from "@/server/db/schema";
import { DND5E } from "@/lib/game-systems/dnd5e";
import { cn } from "@/lib/utils";
import { Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { EncounterDialogButton } from "./encounter-dialog";

export const metadata = { title: "Encounters" };

const STATUS_ORDER = ["active", "ready", "draft", "completed"] as const;
const STATUS_LABEL: Record<string, string> = { active: "Running now", ready: "Ready", draft: "Drafts", completed: "Finished" };

export default async function EncountersPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<{ new?: string }> }) {
  const { worldId } = await params;
  const sp = await searchParams;
  const { role } = await requireWorld(worldId);
  const db = await getDb();
  const { campaign } = await getActiveCampaign(worldId);
  const rows = await db
    .select()
    .from(encounters)
    .where(and(eq(encounters.worldId, worldId), campaign ? or(isNull(encounters.campaignId), eq(encounters.campaignId, campaign.id)) : undefined))
    .orderBy(desc(encounters.updatedAt));
  const ids = rows.map((r) => r.id);
  const combatants = ids.length ? await db.select({ encounterId: encounterCombatants.encounterId, side: encounterCombatants.side, stats: encounterCombatants.stats, defeated: encounterCombatants.defeated }).from(encounterCombatants).where(inArray(encounterCombatants.encounterId, ids)) : [];
  const refIds = rows.flatMap((r) => [r.locationId, r.questId]).filter((x): x is string => !!x);
  const refs = refIds.length ? await db.select({ id: entities.id, name: entities.name }).from(entities).where(inArray(entities.id, refIds)) : [];
  const pcs = campaign ? await db.select({ fields: entities.fields, status: entities.status }).from(entities).where(and(eq(entities.campaignId, campaign.id), eq(entities.type, "pc"))) : [];
  const levels = pcs.filter((p) => p.status !== "dead").map((p) => Number((p.fields as { level?: number }).level ?? 1));
  const canEdit = role === "owner" || role === "editor";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<Swords />}
        title="Encounters"
        description={`Prepare fights and confrontations, then run them with the initiative tracker.${campaign ? ` Difficulty is rated for ${campaign.name}'s party (D&D 2024 XP budgets).` : ""}`}
        actions={canEdit ? <EncounterDialogButton defaultOpen={sp.new === "1"} campaign={campaign ? { id: campaign.id, name: campaign.name } : null} /> : undefined}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<Swords />} title="No encounters yet">
          Build one from your bestiary and NPCs. During a session, start it from the Combat tab and the tracker handles initiative, HP and conditions.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {STATUS_ORDER.map((status) => {
            const list = rows.filter((r) => r.status === status);
            if (!list.length) return null;
            return (
              <section key={status}>
                <h2 className="mb-3 text-md font-semibold">
                  {STATUS_LABEL[status]} <span className="font-normal text-faint">{list.length}</span>
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((e) => {
                    const cs = combatants.filter((c) => c.encounterId === e.id);
                    const enemies = cs.filter((c) => c.side === "enemy");
                    const rating = DND5E.rateEncounter(levels, enemies.map((c) => String((c.stats as { cr?: string }).cr ?? "")));
                    const loc = refs.find((r) => r.id === e.locationId);
                    const quest = refs.find((r) => r.id === e.questId);
                    return (
                      <li key={e.id}>
                        <Link href={`/w/${worldId}/encounters/${e.id}`} className={cn("flex h-full flex-col gap-2 rounded-lg border bg-surface p-4 hover:border-line-strong", status === "active" ? "border-ember/60" : "border-line")}>
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-serif text-lg font-semibold leading-snug">{e.name}</span>
                            {status === "active" && <Badge tone="ember">Round {e.round}</Badge>}
                          </div>
                          {e.description && <p className="line-clamp-2 text-sm text-muted">{e.description}</p>}
                          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                            <span>
                              {enemies.length} foe{enemies.length === 1 ? "" : "s"}
                              {cs.length > enemies.length && ` · ${cs.length - enemies.length} others`}
                            </span>
                            {enemies.length > 0 && levels.length > 0 && <span className={cn(rating.label === "Deadly" || rating.label === "Beyond high" ? "text-ember" : rating.label === "High" ? "text-brass" : "")}>{rating.label}</span>}
                            {loc && (
                              <span className="inline-flex items-center gap-0.5">
                                <MapPin className="size-3" /> {loc.name}
                              </span>
                            )}
                            {quest && (
                              <span className="inline-flex items-center gap-0.5">
                                <ScrollText className="size-3" /> {quest.name}
                              </span>
                            )}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
