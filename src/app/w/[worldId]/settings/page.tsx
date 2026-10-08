import Link from "next/link";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { Settings } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb, rowsOf } from "@/server/db/client";
import { customEntityTypes, revisions, users, worldMembers } from "@/server/db/schema";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/display";
import { GeneralForm } from "./general-form";
import { CalendarEditor } from "./calendar-editor";
import { CustomTypes } from "./custom-types";
import { Members } from "./members";
import { HistoryList } from "./history-list";
import { DataTools } from "./data-tools";

export const metadata = { title: "World settings" };

const TABS = [
  { key: "general", label: "General" },
  { key: "calendar", label: "Calendar" },
  { key: "types", label: "Entry types" },
  { key: "members", label: "People" },
  { key: "history", label: "History" },
  { key: "data", label: "Backup & data" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<{ tab?: string; before?: string; actor?: string }> }) {
  const { worldId } = await params;
  const sp = await searchParams;
  const { world, calendar, role, user } = await requireWorld(worldId, "editor");
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "general";
  const db = await getDb();
  const isOwner = role === "owner";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader icon={<Settings />} title="World settings" description={world.name} />
      <nav aria-label="Settings sections" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/w/${worldId}/settings${t.key === "general" ? "" : `?tab=${t.key}`}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", tab === t.key ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "general" && (
        <GeneralForm
          world={{ name: world.name, genre: world.genre, tone: world.tone, magicLevel: world.magicLevel, techLevel: world.techLevel, description: world.description, aiCreativity: world.settings.aiCreativity ?? "balanced", houseRules: world.settings.houseRules ?? "" }}
        />
      )}
      {tab === "calendar" && <CalendarEditor initial={calendar} now={world.currentAt} />}
      {tab === "types" && (
        <CustomTypes
          types={(await db.select().from(customEntityTypes).where(eq(customEntityTypes.worldId, worldId)).orderBy(asc(customEntityTypes.name))).map((t) => ({
            id: t.id,
            key: t.key,
            name: t.name,
            pluralName: t.pluralName ?? "",
            description: t.description ?? "",
            icon: t.icon ?? "shapes",
            isPlace: t.isPlace,
            fields: t.fields,
          }))}
        />
      )}
      {tab === "members" && (
        <Members
          isOwner={isOwner}
          me={user.id}
          members={(
            await db
              .select({ userId: worldMembers.userId, role: worldMembers.role, name: users.name, email: users.email })
              .from(worldMembers)
              .innerJoin(users, eq(users.id, worldMembers.userId))
              .where(eq(worldMembers.worldId, worldId))
              .orderBy(asc(users.name))
          ).map((m) => ({ ...m, email: isOwner ? m.email : "" }))}
        />
      )}
      {tab === "history" && <HistoryTab worldId={worldId} before={sp.before} actor={sp.actor} />}
      {tab === "data" && <DataTools worldName={world.name} isOwner={isOwner} />}
    </div>
  );
}

async function HistoryTab({ worldId, before, actor }: { worldId: string; before?: string; actor?: string }) {
  const db = await getDb();
  const cursor = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null;
  const actorFilter = actor === "ai" || actor === "user" || actor === "system" ? actor : null;
  const rows = await db
    .select({ r: revisions, userName: users.name })
    .from(revisions)
    .leftJoin(users, eq(users.id, revisions.actorUserId))
    .where(and(eq(revisions.worldId, worldId), cursor ? lt(revisions.createdAt, cursor) : undefined, actorFilter ? eq(revisions.actorType, actorFilter) : undefined))
    .orderBy(desc(revisions.createdAt))
    .limit(60);
  const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(revisions).where(eq(revisions.worldId, worldId));
  // Entities that no longer exist can be restored from their delete revision.
  const deletedIds = rows.filter((x) => x.r.action === "delete" && x.r.targetKind === "entity").map((x) => x.r.targetId);
  const stillThere = deletedIds.length ? rowsOf<{ id: string }>(await db.execute(sql`select id from entities where id in (${sql.join(deletedIds.map((i) => sql`${i}`), sql`, `)})`)) : [];
  const existing = new Set(stillThere.map((x) => x.id));
  return (
    <HistoryList
      total={total}
      actor={actorFilter}
      rows={rows.map(({ r, userName }) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        action: r.action,
        targetKind: r.targetKind,
        targetId: r.targetId,
        targetLabel: r.targetLabel,
        summary: r.summary,
        actorType: r.actorType,
        userName: userName ?? null,
        fromProposal: !!r.proposalId,
        restorable: r.targetKind === "entity" && !!r.before && (r.action === "update" || (r.action === "delete" && !existing.has(r.targetId))),
      }))}
      nextCursor={rows.length === 60 ? rows.at(-1)!.r.createdAt.toISOString() : null}
    />
  );
}
