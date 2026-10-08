"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NotebookPen, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Markdown, type RefMap } from "@/components/common/markdown";
import { MarkdownEditor } from "@/components/common/markdown-editor";
import { useWorld } from "@/components/shell/world-context";
import { deleteNoteAction, saveNoteAction } from "@/server/actions/play";
import { cn, timeAgo } from "@/lib/utils";

interface NoteView {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  updatedAt: string;
}

export function NotesView({ campaignId, notes, refs }: { campaignId: string; notes: NoteView[]; refs: RefMap }) {
  const w = useWorld();
  const router = useRouter();
  const [selected, setSelected] = React.useState<string | null>(notes[0]?.id ?? null);
  const [draft, setDraft] = React.useState<{ id?: string; title: string; body: string; pinned: boolean } | null>(null);
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && notes.some((n) => n.id === hash)) setSelected(hash);
  }, [notes]);
  const current = notes.find((n) => n.id === selected) ?? null;
  const save = async () => {
    if (!draft) return;
    setPending(true);
    const res = await saveNoteAction(w.worldId, campaignId, draft);
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    setSelected(res.data.id);
    setDraft(null);
    router.refresh();
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<NotebookPen />}
        title="Notes"
        description="Campaign notes: hooks, plans, reminders. @mentions link into the wiki and count as appearances."
        actions={
          <Button variant="primary" onClick={() => setDraft({ title: "", body: "", pinned: false })}>
            <Plus /> New note
          </Button>
        }
      />
      {notes.length === 0 && !draft ? (
        <EmptyState icon={<NotebookPen />} title="No notes yet" />
      ) : (
        <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
          <ul className="flex flex-col gap-1">
            {notes.map((n) => (
              <li key={n.id}>
                <button onClick={() => (setSelected(n.id), setDraft(null))} className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-surface-2", selected === n.id && !draft && "bg-surface-2")}>
                  {n.pinned && <Pin className="size-3.5 shrink-0 text-brass" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{n.title || "Untitled"}</span>
                    <span className="text-xs text-faint">{timeAgo(n.updatedAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0">
            {draft ? (
              <div className="flex flex-col gap-3">
                <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" className="h-10 font-serif text-xl" aria-label="Note title" autoFocus />
                <MarkdownEditor value={draft.body} onChange={(body) => setDraft({ ...draft, body })} refs={refs} minRows={16} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={save} loading={pending}>
                    Save note
                  </Button>
                </div>
              </div>
            ) : current ? (
              <article>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h2 className="font-serif text-3xl font-semibold">{current.title || "Untitled"}</h2>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={current.pinned ? "Unpin" : "Pin"}
                      onClick={async () => {
                        await saveNoteAction(w.worldId, campaignId, { id: current.id, title: current.title, body: current.body, pinned: !current.pinned });
                        router.refresh();
                      }}
                    >
                      {current.pinned ? <PinOff /> : <Pin />}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setDraft({ id: current.id, title: current.title, body: current.body, pinned: current.pinned })}>
                      Edit
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label="Delete note">
                          <Trash2 />
                        </Button>
                      }
                      title="Delete this note?"
                      onConfirm={async () => {
                        const res = await deleteNoteAction(w.worldId, current.id);
                        if (!res.ok) return void toast.error(res.error);
                        setSelected(null);
                        router.refresh();
                      }}
                    />
                  </div>
                </div>
                <Markdown refs={refs}>{current.body || "_Empty note._"}</Markdown>
              </article>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
