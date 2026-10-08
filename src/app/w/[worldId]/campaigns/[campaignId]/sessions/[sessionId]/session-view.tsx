"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clapperboard, Inbox, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Panel, SectionTitle } from "@/components/ui/display";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Markdown, type RefMap } from "@/components/common/markdown";
import { MarkdownEditor } from "@/components/common/markdown-editor";
import { TypeIcon } from "@/components/entity/type-icon";
import { useWorld } from "@/components/shell/world-context";
import { AiWorking } from "@/components/ai/ai-working";
import { deleteSessionAction, updateSessionAction } from "@/server/actions/sessions";
import { processSessionAction } from "@/server/actions/ai";
import { formatDate } from "@/lib/calendar";
import type { GameSession } from "@/server/db/schema";
import { timeAgo } from "@/lib/utils";

type Field = "recap" | "notes" | "prep";

export function SessionView({
  campaignId,
  session,
  scenes,
  batches,
  mentioned,
  events,
  refs,
}: {
  campaignId: string;
  session: GameSession;
  scenes: { id: string; name: string; status: string; mood: string }[];
  batches: { id: string; title: string; status: string; createdAt: string }[];
  mentioned: { id: string; name: string; type: string }[];
  events: { id: string; name: string; startAt: number }[];
  refs: RefMap;
}) {
  const w = useWorld();
  const router = useRouter();
  const [editing, setEditing] = React.useState<Field | null>(null);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [analysing, setAnalysing] = React.useState(false);
  const [title, setTitle] = React.useState(session.title);
  const cb = `/w/${w.worldId}/campaigns/${campaignId}`;

  const save = async (field: Field) => {
    setBusy(true);
    const res = await updateSessionAction(w.worldId, campaignId, session.id, { [field]: draft });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setEditing(null);
    router.refresh();
  };
  const process = async () => {
    setBusy(true);
    setAnalysing(true);
    const res = await processSessionAction(w.worldId, campaignId, session.id);
    setBusy(false);
    setAnalysing(false);
    if (!res.ok) return toast.error(res.error);
    router.push(`/w/${w.worldId}/proposals/${res.data.batchId}`);
  };

  const section = (field: Field, label: string, empty: string) => (
    <TabsContent value={field}>
      {editing === field ? (
        <div className="flex flex-col gap-2">
          <MarkdownEditor value={draft} onChange={setDraft} refs={refs} minRows={16} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => save(field)} loading={busy}>
              Save {label.toLowerCase()}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDraft(session[field]);
                setEditing(field);
              }}
            >
              <Pencil /> Edit {label.toLowerCase()}
            </Button>
          </div>
          {session[field].trim() ? <Markdown refs={refs}>{session[field]}</Markdown> : <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{empty}</p>}
        </div>
      )}
    </TabsContent>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <header className="mb-5">
          <p className="text-sm text-faint">Session {session.number}</p>
          <input
            aria-label="Session title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={async () => {
              if (title === session.title) return;
              const res = await updateSessionAction(w.worldId, campaignId, session.id, { title });
              if (!res.ok) toast.error(res.error);
            }}
            placeholder="Untitled session"
            className="w-full rounded bg-transparent font-serif text-4xl font-semibold tracking-[-0.015em] outline-none placeholder:text-faint hover:bg-surface-2/50 focus:bg-surface-2/50"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone={session.status === "processed" ? "accent" : session.status === "in_progress" ? "ember" : session.status === "completed" ? "brass" : "outline"}>{session.status.replace("_", " ")}</Badge>
            {session.inWorldStartAt !== null && (
              <span className="text-brass">
                {formatDate(w.calendar, session.inWorldStartAt)}
                {session.inWorldEndAt !== null && session.inWorldEndAt !== session.inWorldStartAt && ` → ${formatDate(w.calendar, session.inWorldEndAt)}`}
              </span>
            )}
            {session.startedAt && <span>played {new Date(session.startedAt).toLocaleDateString()}</span>}
          </div>
        </header>
        <Tabs defaultValue={session.status === "planned" ? "prep" : session.recap ? "recap" : "notes"}>
          <TabsList className="mb-5">
            <TabsTrigger value="recap">Recap</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="prep">Prep</TabsTrigger>
          </TabsList>
          {section("recap", "Recap", "No recap yet. Process the notes to have one proposed, or write your own.")}
          {section("notes", "Notes", "No notes. Notes are taken in Run Session mode, or you can add them here afterwards.")}
          {section("prep", "Prep", "No prep yet. Prepare Next Session can draft a briefing.")}
        </Tabs>
      </div>
      <aside className="flex flex-col gap-4">
        <Panel className="flex flex-col gap-2 p-4">
          {(session.status === "planned" || session.status === "in_progress") && (
            <Button asChild variant="primary">
              <Link href={`${cb}/run`}>
                <Clapperboard /> {session.status === "in_progress" ? "Resume in Run Session" : "Run this session"}
              </Link>
            </Button>
          )}
          {session.notes.trim() && session.status !== "planned" && (
            <Button variant="arcane" onClick={process} loading={busy}>
              <Sparkles /> {session.status === "processed" ? "Analyse notes again" : "Analyse notes"}
            </Button>
          )}
          <AiWorking active={analysing} live={w.aiProvider.live} what="Claude is reading your notes" />
          <ConfirmDialog
            trigger={
              <Button variant="danger-ghost" size="sm">
                <Trash2 /> Delete session
              </Button>
            }
            title={`Delete session ${session.number}?`}
            description="Notes, recap and prep are deleted. Approved changes to the world stay."
            onConfirm={async () => {
              const res = await deleteSessionAction(w.worldId, campaignId, session.id);
              if (!res.ok) return void toast.error(res.error);
              router.push(`${cb}/sessions`);
            }}
          />
        </Panel>
        {batches.length > 0 && (
          <Panel className="p-4">
            <SectionTitle>Proposals from this session</SectionTitle>
            <ul className="flex flex-col gap-1 text-sm">
              {batches.map((b) => (
                <li key={b.id}>
                  <Link href={`/w/${w.worldId}/proposals/${b.id}`} className="flex items-center gap-2 hover:text-accent">
                    <Inbox className="size-3.5 text-arcane" /> <span className="truncate">{b.status === "pending" ? "Waiting for review" : b.status}</span>
                    <span className="ml-auto text-xs text-faint">{timeAgo(b.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {scenes.length > 0 && (
          <Panel className="p-4">
            <SectionTitle>Scenes</SectionTitle>
            <ul className="flex flex-col gap-1 text-sm">
              {scenes.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{s.name}</span>
                  <span className="text-xs text-faint">{s.status}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {events.length > 0 && (
          <Panel className="p-4">
            <SectionTitle>What happened</SectionTitle>
            <ul className="flex flex-col gap-1 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  <Link href={`/w/${w.worldId}/e/${e.id}`} className="hover:text-accent">
                    {e.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {mentioned.length > 0 && (
          <Panel className="p-4">
            <SectionTitle>Appeared</SectionTitle>
            <ul className="flex flex-wrap gap-1.5">
              {mentioned.map((m) => (
                <li key={m.id}>
                  <Link href={`/w/${w.worldId}/e/${m.id}`} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted hover:text-fg">
                    <TypeIcon type={m.type} className="size-3" /> {m.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </aside>
    </div>
  );
}
