import Link from "next/link";
import { Plus, SearchCheck } from "lucide-react";
import { requireCampaign } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { listMysteries } from "@/server/services/quests";
import { Badge, EmptyState, Meter, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Mysteries" };

export default async function MysteriesPage({ params }: { params: Promise<{ worldId: string; campaignId: string }> }) {
  const { worldId, campaignId } = await params;
  const { campaign } = await requireCampaign(worldId, campaignId);
  const db = await getDb();
  const list = await listMysteries(db, worldId, campaign.id);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<SearchCheck />}
        title="Mysteries"
        description="Questions with hidden truths. See at a glance which clues the players have found."
        actions={
          <Button asChild variant="primary">
            <Link href={`/w/${worldId}/new?type=mystery`}>
              <Plus /> New mystery
            </Link>
          </Button>
        }
      />
      {list.length === 0 ? (
        <EmptyState icon={<SearchCheck />} title="No mysteries yet">
          Create a mystery, then add the clues that lead to its truth (and a red herring or two).
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((m) => {
            const real = m.clues.filter((c) => !c.isRedHerring);
            const found = real.filter((c) => c.discovered);
            return (
              <li key={m.id}>
                <Link href={`/w/${worldId}/e/${m.id}`} className="block rounded-lg border border-line bg-surface p-4 hover:border-line-strong">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-serif text-xl font-semibold">{m.name}</p>
                    <Badge tone={m.mystery.status === "solved" ? "accent" : m.mystery.status === "abandoned" ? "neutral" : "arcane"}>{m.mystery.status.replace("_", " ")}</Badge>
                  </div>
                  {m.mystery.question && <p className="mt-0.5 text-muted">{m.mystery.question}</p>}
                  <div className="mt-3 flex items-center gap-3">
                    <Meter value={found.length} max={Math.max(1, real.length)} tone="arcane" className="max-w-64" label="Clues found" />
                    <span className="text-sm tabular text-muted">
                      {found.length} of {real.length} clues found
                    </span>
                  </div>
                  <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                    {m.clues.map((c) => (
                      <li key={c.id} className={c.discovered ? "text-fg" : "text-faint"}>
                        {c.discovered ? "● " : "○ "}
                        {c.description}
                        {c.isRedHerring && <span className="text-ember"> (red herring)</span>}
                      </li>
                    ))}
                  </ul>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
