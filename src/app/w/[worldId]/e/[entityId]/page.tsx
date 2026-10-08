import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { BookOpen, Brain, ChevronRight, Eye, EyeOff, GitFork, History, Map as MapIcon, Pin, Sparkles, Star } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { revisions } from "@/server/db/schema";
import { getActiveCampaign } from "@/server/context";
import { getEntity } from "@/server/services/entities";
import { getEntityDetail } from "@/server/services/entity-detail";
import { collectRefs } from "@/server/services/refs";
import { getClueKnowers } from "@/server/services/play";
import { formatDate } from "@/lib/calendar";
import { Badge, Panel, SectionTitle } from "@/components/ui/display";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { Markdown } from "@/components/common/markdown";
import { TypeGlyph, TypeIcon } from "@/components/entity/type-icon";
import { EntityActions } from "@/components/entity/entity-actions";
import { RelationshipsPanel, KnowledgePanel } from "@/components/entity/relations-panel";
import { QuestPanel, ThreadPanel, CluesPanel, RumourPanel, EventPanel } from "@/components/entity/extension-panels";
import { MetricsPanel, CampaignStatePanel, HistoryPanel } from "@/components/entity/side-panels";
import { ShortFields, LongFields } from "@/components/entity/fields-view";
import { getEntityType } from "@/lib/entity-types";

const VIS_LABEL: Record<string, string> = { dm_only: "DM only", secret: "Secret", partially_known: "Partially known", discovered: "Discovered", public: "Public" };

export async function generateMetadata({ params }: { params: Promise<{ worldId: string; entityId: string }> }) {
  const { worldId, entityId } = await params;
  await requireWorld(worldId);
  const db = await getDb();
  const e = await getEntity(db, worldId, entityId);
  return { title: e?.name ?? "Not found" };
}

export default async function EntityPage({ params }: { params: Promise<{ worldId: string; entityId: string }> }) {
  const { worldId, entityId } = await params;
  const { calendar } = await requireWorld(worldId);
  const db = await getDb();
  const entity = await getEntity(db, worldId, entityId);
  if (!entity) notFound();
  const { campaign } = await getActiveCampaign(worldId);
  const d = await getEntityDetail(db, worldId, entity, campaign?.id ?? null);
  const refs = await collectRefs(db, worldId, entity.body, entity.dmNotes);
  const history = await db.select().from(revisions).where(and(eq(revisions.worldId, worldId), eq(revisions.targetId, entity.id))).orderBy(desc(revisions.createdAt)).limit(50);
  const def = d.typeDef;
  const base = `/w/${worldId}`;
  const ext = d.extension;
  const clueKnowers = ext && "clues" in ext && ext.clues ? await getClueKnowers(db, ext.clues.map((c) => c.id)) : [];
  const statusOverride = d.overlay?.status;
  const canHoldKnowledge = ["npc", "pc", "faction", "organization", "religion", "deity", "creature"].includes(entity.type);

  const derived = [
    ...(entity.locationId && d.locationChain.length ? [{ label: getEntityType(entity.type).isPlace ? "located in" : "found at", other: d.locationChain[d.locationChain.length - 1]! }] : []),
    ...(d.overlay?.location ? [{ label: `at (in ${campaign?.name})`, other: { ...d.overlay.location, type: "location" } }] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {d.locationChain.length > 0 && (
        <nav aria-label="Location" className="mb-3 flex flex-wrap items-center gap-1 text-sm text-faint">
          {d.locationChain.map((l, i) => (
            <span key={l.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5" />}
              <Link href={`${base}/e/${l.id}`} className="hover:text-fg">
                {l.name}
              </Link>
            </span>
          ))}
        </nav>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {entity.imageFileId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${entity.imageFileId}`} alt={`Picture of ${entity.name}`} className="size-24 shrink-0 rounded-xl border border-line object-cover sm:size-28" />
          ) : (
            <TypeGlyph type={entity.type} size="lg" />
          )}
          <div className="min-w-0">
            <h1 className="font-serif text-4xl font-semibold leading-tight tracking-[-0.015em]">{entity.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{def.label}</span>
              {(statusOverride || entity.status) && (
                <Badge tone={["dead", "destroyed", "lost", "ruined"].includes(statusOverride ?? entity.status ?? "") ? "ember" : "neutral"}>
                  {statusOverride ?? entity.status}
                  {statusOverride && statusOverride !== entity.status && ` (canon: ${entity.status ?? "—"})`}
                </Badge>
              )}
              <Badge tone={entity.visibility === "public" ? "accent" : entity.visibility === "dm_only" ? "ember" : "outline"}>
                {entity.visibility === "public" ? <Eye /> : <EyeOff />} {VIS_LABEL[entity.visibility]}
              </Badge>
              {entity.canonStatus !== "canon" && <Badge tone={entity.canonStatus === "proposed" ? "arcane" : "brass"}>{entity.canonStatus}</Badge>}
              {entity.importance > 0 && (
                <Badge tone="brass">
                  <Star /> {entity.importance > 1 ? "Major" : "Important"}
                </Badge>
              )}
              {entity.campaignId && <Badge tone="brass">Campaign only</Badge>}
              {entity.aliases.length > 0 && <span className="text-faint">also known as {entity.aliases.join(", ")}</span>}
            </div>
            {entity.summary && <p className="mt-3 max-w-[70ch] font-serif text-lg leading-relaxed text-muted">{entity.summary}</p>}
          </div>
        </div>
        <EntityActions entity={{ id: entity.id, name: entity.name, type: entity.type, canonStatus: entity.canonStatus, visibility: entity.visibility, importance: entity.importance }} />
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          {ext?.kind === "quest" && ext.quest && (
            <div className="mb-6 flex flex-col gap-4">
              <QuestPanel
                questId={entity.id}
                status={ext.quest.status}
                priority={ext.quest.priority}
                objectives={ext.objectives}
                giver={ext.giver}
                thread={ext.thread}
                rewards={ext.quest.rewards}
                consequences={ext.quest.consequences}
                playerKnowledge={ext.quest.playerKnowledge}
              />
              {ext.clues.length > 0 && <CluesPanel questId={entity.id} clues={ext.clues} knowers={clueKnowers} />}
            </div>
          )}
          {ext?.kind === "thread" && ext.thread && (
            <div className="mb-6">
              <ThreadPanel threadId={entity.id} thread={ext.thread} stages={ext.stages} />
            </div>
          )}
          {ext?.kind === "mystery" && ext.mystery && (
            <div className="mb-6">
              <CluesPanel mysteryId={entity.id} clues={ext.clues} question={ext.mystery.question} truth={ext.mystery.truth} knowers={clueKnowers} />
            </div>
          )}
          {ext?.kind === "rumour" && ext.rumour && (
            <div className="mb-6">
              <RumourPanel claim={ext.rumour.claim} truth={ext.rumour.truth} accuracy={ext.rumour.accuracy} distortion={ext.rumour.distortion} origin={ext.origin} />
            </div>
          )}
          {ext?.kind === "event" && ext.event && (
            <div className="mb-6">
              <EventPanel startAt={ext.event.startAt} endAt={ext.event.endAt} precision={ext.event.precision} kind={ext.event.kind} origin={ext.event.origin} />
            </div>
          )}

          <Tabs defaultValue="article">
            <TabsList className="mb-5 overflow-x-auto">
              <TabsTrigger value="article">
                <BookOpen /> Article
              </TabsTrigger>
              <TabsTrigger value="relationships">
                <GitFork /> Relationships <span className="text-xs text-faint tabular">{d.relationships.length}</span>
              </TabsTrigger>
              <TabsTrigger value="knowledge">
                <Brain /> Knowledge <span className="text-xs text-faint tabular">{d.heldFacts.length + d.aboutFacts.length}</span>
              </TabsTrigger>
              <TabsTrigger value="timeline">
                <History /> Timeline <span className="text-xs text-faint tabular">{d.events.length}</span>
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="article" className="flex flex-col gap-6">
              <LongFields def={def} fields={entity.fields} />
              {entity.body.trim() ? (
                <Markdown refs={refs}>{entity.body}</Markdown>
              ) : (
                <div className="rounded-lg border border-dashed border-line px-5 py-8 text-center">
                  <p className="font-medium">No article yet</p>
                  <p className="mt-1 text-sm text-muted">Write about {entity.name}, or ask the AI to expand it from what's already known.</p>
                  <div className="mt-3 flex justify-center gap-2">
                    <Link href={`${base}/e/${entity.id}/edit`} className="text-sm font-medium text-accent hover:underline">
                      Write the article
                    </Link>
                  </div>
                </div>
              )}
              {entity.dmNotes.trim() && (
                <div className="dm-block">
                  <Markdown refs={refs} variant="compact">
                    {entity.dmNotes}
                  </Markdown>
                </div>
              )}
              {d.contents.length > 0 && (
                <section>
                  <SectionTitle>Here, in {entity.name}</SectionTitle>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {d.contents.map((c) => (
                      <li key={c.id}>
                        <Link href={`${base}/e/${c.id}`} className="flex items-start gap-2.5 rounded-md border border-line px-3 py-2 hover:border-line-strong">
                          <TypeIcon type={c.type} className="mt-0.5" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{c.name}</span>
                            {c.summary && <span className="line-clamp-1 text-xs text-muted">{c.summary}</span>}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {d.subpages.length > 0 && (
                <section>
                  <SectionTitle>Sub-pages</SectionTitle>
                  <ul className="flex flex-wrap gap-2">
                    {d.subpages.map((s) => (
                      <li key={s.id}>
                        <Link href={`${base}/e/${s.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm hover:border-line-strong">
                          <TypeIcon type={s.type} /> {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </TabsContent>

            <TabsContent value="relationships">
              <RelationshipsPanel entity={{ id: entity.id, name: entity.name, type: entity.type }} relationships={d.relationships} derived={derived} />
            </TabsContent>

            <TabsContent value="knowledge">
              <KnowledgePanel
                entity={{ id: entity.id, name: entity.name, type: entity.type }}
                canHold={canHoldKnowledge}
                held={d.heldFacts.map(({ fact, subjectName }) => ({ ...fact, otherName: subjectName }))}
                about={d.aboutFacts.map(({ fact, holderName, holderType }) => ({ ...fact, otherName: holderName, otherType: holderType }))}
              />
            </TabsContent>

            <TabsContent value="timeline">
              {d.events.length ? (
                <ol className="relative flex flex-col gap-4 border-l border-line pl-5">
                  {d.events.map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-surface bg-brass" aria-hidden />
                      <p className="text-sm tabular text-brass">{formatDate(calendar, e.startAt, { precision: e.precision })}</p>
                      <Link href={`${base}/e/${e.id}`} className="font-medium hover:text-accent">
                        {e.name}
                      </Link>
                      {e.summary && <p className="text-sm text-muted">{e.summary}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-faint">No timeline events involve {entity.name} yet.</p>
              )}
            </TabsContent>

            <TabsContent value="history">
              <HistoryPanel revisions={history.map((r) => ({ id: r.id, summary: r.summary, action: r.action, actorType: r.actorType, createdAt: r.createdAt, before: r.before, after: r.after, proposalId: r.proposalId }))} />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          {(def.fields.length > 0 || entity.locationId) && (
            <Panel className="px-4 py-3">
              <SectionTitle>Details</SectionTitle>
              <ShortFields def={def} fields={entity.fields} />
              {d.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {d.tags.map((t) => (
                    <Link key={t.name} href={`${base}/wiki?tag=${encodeURIComponent(t.name)}`} className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted hover:text-fg">
                      #{t.name}
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {campaign && (
            <Panel className="border-brass/30 px-4 py-3">
              <SectionTitle>
                <span className="text-brass">In {campaign.name}</span>
              </SectionTitle>
              <CampaignStatePanel
                entity={{ id: entity.id, name: entity.name, status: entity.status, type: entity.type }}
                overlay={d.overlay ? { status: d.overlay.status, reputation: d.overlay.reputation, attitude: d.overlay.attitude, knowledge: d.overlay.knowledge, location: d.overlay.location } : null}
                statuses={def.statuses ?? []}
              />
            </Panel>
          )}

          <Panel className="px-4 py-3">
            <SectionTitle>World state</SectionTitle>
            <MetricsPanel entityId={entity.id} metrics={d.metrics} />
          </Panel>

          {d.markers.length > 0 && (
            <Panel className="px-4 py-3">
              <SectionTitle>On the map</SectionTitle>
              <ul className="flex flex-col gap-1 text-sm">
                {d.markers.map((m) => (
                  <li key={m.id}>
                    <Link href={`${base}/maps/${m.mapId}?marker=${m.id}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                      <MapIcon className="size-3.5 text-faint" /> {m.mapName}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {d.appearances.length > 0 && (
            <Panel className="px-4 py-3">
              <SectionTitle>Campaign appearances</SectionTitle>
              {d.appearances.map((a) => (
                <div key={a.campaignId} className="mb-2 last:mb-0">
                  <p className="text-xs text-faint">{a.campaignName}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {a.sessions.map((s) => (
                      <Link key={s.id} href={`${base}/campaigns/${a.campaignId}/sessions/${s.id}`} className="rounded bg-surface-3 px-1.5 py-0.5 text-xs tabular hover:text-accent" title={s.title}>
                        #{s.number}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </Panel>
          )}

          <Panel className="px-4 py-3">
            <SectionTitle>Mentioned in</SectionTitle>
            {d.backlinks.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {d.backlinks.map((b) => (
                  <li key={`${b.kind}-${b.id}`}>
                    <Link
                      href={b.kind === "entity" ? `${base}/e/${b.id}` : b.kind === "session" ? `${base}/campaigns/${b.campaignId}/sessions/${b.id}` : b.kind === "note" ? `${base}/campaigns/${b.campaignId}/notes` : `${base}/campaigns/${b.campaignId}/sessions`}
                      className="inline-flex items-center gap-1.5 hover:text-accent"
                    >
                      {b.kind === "entity" ? <TypeIcon type={b.type ?? "lore"} /> : <Pin className="size-3.5 text-faint" />}
                      {b.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-faint">No backlinks yet. Mention {entity.name} with @ in other articles or session notes.</p>
            )}
          </Panel>

          <p className="flex items-center gap-1.5 px-1 text-xs text-faint">
            <Sparkles className="size-3" /> Created {entity.createdAt.toLocaleDateString()} · updated {entity.updatedAt.toLocaleDateString()}
          </p>
        </aside>
      </div>
    </div>
  );
}
