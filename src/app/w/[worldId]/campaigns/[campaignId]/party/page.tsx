import Link from "next/link";
import { Plus, ShieldUser } from "lucide-react";
import { requireCampaign } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { listPartyMembers, listReputations } from "@/server/services/campaigns";
import { getPlayerKnownEntities } from "@/server/services/knowledge";
import { Badge, EmptyState, PageHeader, Panel, PanelHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { TypeIcon } from "@/components/entity/type-icon";
import { ENTITY_GROUPS, getEntityType } from "@/lib/entity-types";
import { CampaignNotes } from "../campaign-widgets";

export const metadata = { title: "Party" };

export default async function PartyPage({ params }: { params: Promise<{ worldId: string; campaignId: string }> }) {
  const { worldId, campaignId } = await params;
  const { campaign } = await requireCampaign(worldId, campaignId);
  const db = await getDb();
  const [pcs, reps, known] = await Promise.all([listPartyMembers(db, worldId, campaign.id), listReputations(db, campaign.id), getPlayerKnownEntities(db, worldId, campaign.id)]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<ShieldUser />}
        title={campaign.partyName}
        description="The player characters, what they carry, who they've impressed or angered, and what they know."
        actions={
          <Button asChild variant="primary">
            <Link href={`/w/${worldId}/new?type=pc`}>
              <Plus /> Add character
            </Link>
          </Button>
        }
      />
      {pcs.length === 0 ? (
        <EmptyState title="No player characters yet" />
      ) : (
        <ul className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pcs.map((p) => {
            const f = p.fields as Record<string, string | number | undefined>;
            return (
              <li key={p.id}>
                <Link href={`/w/${worldId}/e/${p.id}`} className="block h-full rounded-lg border border-line bg-surface p-4 hover:border-line-strong">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-serif text-xl font-semibold">{p.name}</p>
                    {p.status && p.status !== "active" && <Badge tone={p.status === "dead" ? "ember" : "neutral"}>{p.status}</Badge>}
                  </div>
                  <p className="text-sm text-muted">{[f.species, f.className].filter(Boolean).join(" ")}</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Level", f.level],
                      ["AC", f.ac],
                      ["HP", f.hpMax],
                    ].map(([l, v]) => (
                      <div key={String(l)} className="rounded-md bg-surface-2 py-1.5">
                        <dt className="text-2xs text-faint">{l}</dt>
                        <dd className="font-semibold tabular">{v ?? "–"}</dd>
                      </div>
                    ))}
                  </dl>
                  {f.playerName && <p className="mt-2 text-xs text-faint">Played by {f.playerName}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="Inventory & funds" />
          <div className="px-4 pb-4">
            <CampaignNotes campaignId={campaign.id} field="partyInventory" value={campaign.partyInventory} label="Party inventory" rows={10} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Standing with the party" />
          {reps.length ? (
            <ul className="px-4 pb-4">
              {reps.map((r) => (
                <li key={r.entityId} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <Link href={`/w/${worldId}/e/${r.entityId}`} className="flex items-center gap-2 hover:text-accent">
                    <TypeIcon type={r.type} /> {r.name}
                  </Link>
                  <span className={r.reputation! >= 0 ? "tabular text-accent" : "tabular text-ember"}>
                    {r.reputation! > 0 ? "+" : ""}
                    {r.reputation} {r.attitude && <span className="text-faint">· {r.attitude}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 pb-4 text-sm text-muted">No standings recorded yet.</p>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="What the players know" description="Public knowledge plus everything discovered in this campaign. Never DM-only content." />
          <div className="px-4 pb-4">
            {ENTITY_GROUPS.map((g) => {
              const items = known.filter((k) => getEntityType(k.type).group === g.key);
              if (!items.length) return null;
              return (
                <div key={g.key} className="mb-2">
                  <p className="text-xs text-faint">{g.label}</p>
                  <p className="text-sm">
                    {items.map((k, i) => (
                      <span key={k.id}>
                        {i > 0 && ", "}
                        <Link href={`/w/${worldId}/e/${k.id}`} className={k.knowledge === "rumoured" || k.knowledge === "partial" ? "italic text-muted hover:text-fg" : "hover:text-accent"}>
                          {k.name}
                        </Link>
                      </span>
                    ))}
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}
