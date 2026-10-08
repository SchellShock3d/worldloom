import { asc, eq, sql } from "drizzle-orm";
import { Dices } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { entities, randomTableEntries, randomTables } from "@/server/db/schema";
import { PageHeader, Panel, PanelHeader } from "@/components/ui/display";
import { DiceRoller, NeedSomethingNow } from "@/components/play/quick-tools";
import { CreateWithAI } from "./create-with-ai";
import { TablesManager, type TableView } from "./tables-manager";

export const metadata = { title: "Generators" };

export default async function GeneratorsPage({ params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { role } = await requireWorld(worldId);
  const db = await getDb();
  const rows = await db
    .select({ t: randomTables, location: { id: entities.id, name: entities.name, type: entities.type } })
    .from(randomTables)
    .leftJoin(entities, eq(entities.id, randomTables.locationId))
    .where(eq(randomTables.worldId, worldId))
    .orderBy(asc(randomTables.category), asc(randomTables.name));
  const entries = rows.length
    ? await db
        .select({ tableId: randomTableEntries.tableId, text: randomTableEntries.text, weight: randomTableEntries.weight })
        .from(randomTableEntries)
        .where(sql`${randomTableEntries.tableId} in (select id from random_tables where world_id = ${worldId})`)
        .orderBy(asc(randomTableEntries.position))
    : [];
  const tables: TableView[] = rows.map(({ t, location }) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    location: location?.id ? location : null,
    entries: entries.filter((e) => e.tableId === t.id).map((e) => ({ text: e.text, weight: e.weight })),
  }));
  const canEdit = role === "owner" || role === "editor";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader icon={<Dices />} title="Generators" description="Improvise at the table, roll on your own tables, or have the AI draft new places, people and plots for you to approve." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          {canEdit && (
            <Panel>
              <PanelHeader title="I need something now" description="One click for something usable this second. Save it to your world if it sticks." />
              <div className="px-4 pb-4">
                <NeedSomethingNow />
              </div>
            </Panel>
          )}
          {canEdit && (
            <Panel>
              <PanelHeader title="Create with AI" description="Drafts arrive as proposals woven into your existing world. Nothing becomes canon until you approve it." />
              <div className="px-4 pb-4">
                <CreateWithAI />
              </div>
            </Panel>
          )}
        </div>
        <Panel className="self-start">
          <PanelHeader title="Dice" />
          <div className="px-4 pb-4">
            <DiceRoller />
          </div>
        </Panel>
      </div>
      <div className="mt-10">
        <TablesManager tables={tables} canEdit={canEdit} />
      </div>
    </div>
  );
}
