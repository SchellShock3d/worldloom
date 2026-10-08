"use client";

import * as React from "react";
import Link from "next/link";
import { MessageSquarePlus, MessageSquareQuote, MessagesSquare, Sparkles } from "lucide-react";
import { useWorld } from "@/components/shell/world-context";
import { ChatComposer, ChatThread, useAssistant, type ChatMessage } from "@/components/ai/assistant-drawer";
import { EntityPicker, type EntityOption } from "@/components/entity/entity-picker";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/overlays";
import { cn, timeAgo } from "@/lib/utils";

const PROMPTS = [
  "What is happening elsewhere in the world right now?",
  "Which NPCs have unfinished business with the party?",
  "What consequences should result from what happened last session?",
  "What plot threads have I forgotten?",
  "What changed while the party spent three weeks travelling?",
  "What should I prepare for next session?",
  "Create three rumours circulating in the current town",
  "Create a dungeon concept tied to an active world thread",
];

export function AssistantPage({
  conversations,
  currentId,
  initialMessages,
  initialPrompt,
  roleplay,
}: {
  conversations: { id: string; title: string; updatedAt: string; roleplay: boolean }[];
  currentId: string | null;
  initialMessages: ChatMessage[];
  initialPrompt?: string;
  roleplay: { id: string; name: string; type: string } | null;
}) {
  const w = useWorld();
  const { messages, send, streaming, stop, provider } = useAssistant({ initialConversationId: currentId, initialMessages, roleplayEntityId: roleplay?.id ?? null });
  const [rp, setRp] = React.useState<EntityOption | null>(null);
  const sent = React.useRef(false);
  React.useEffect(() => {
    if (initialPrompt && !sent.current && messages.length === 0) {
      sent.current = true;
      send(initialPrompt);
    }
  }, [initialPrompt, send, messages.length]);
  const base = `/w/${w.worldId}/ai`;
  const [listOpen, setListOpen] = React.useState(false);
  const sidebar = (
    <>
        <div className="flex flex-col gap-2 p-3">
          <Button asChild variant="secondary" size="sm">
            <Link href={base}>
              <MessageSquarePlus /> New conversation
            </Link>
          </Button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversations">
          {conversations.map((c) => (
            <Link key={c.id} href={`${base}?c=${c.id}`} className={cn("flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2", c.id === currentId && "bg-surface-2 font-medium")}>
              {c.roleplay ? <MessageSquareQuote className="mt-0.5 size-3.5 shrink-0 text-brass" /> : <Sparkles className="mt-0.5 size-3.5 shrink-0 text-arcane" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{c.title}</span>
                <span className="text-xs text-faint">{timeAgo(c.updatedAt)}</span>
              </span>
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <p className="mb-1.5 text-xs font-medium text-faint">Roleplay a character</p>
          <EntityPicker value={rp} onChange={(v) => { setRp(v); if (v) window.location.href = `${base}?roleplay=${v.id}`; }} types={["npc"]} placeholder="Choose an NPC" allowCreate={false} size="sm" />
          <p className="mt-1.5 text-2xs text-faint">The AI only knows what that character knows.</p>
        </div>
    </>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line md:flex">
        {sidebar}
      </aside>
      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="left" width="sm" title="Conversations" className="md:hidden">
          <div className="flex h-full flex-col">{sidebar}</div>
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            <Button variant="ghost" size="sm" className="-ml-2 mb-3 md:hidden" onClick={() => setListOpen(true)}>
              <MessagesSquare /> Conversations and roleplay
            </Button>
            {roleplay && (
              <div className="mb-5 rounded-lg border border-brass/30 bg-brass-soft px-4 py-3">
                <p className="font-serif text-lg font-semibold">Speaking as {roleplay.name}</p>
                <p className="text-sm text-muted">
                  Answers stay within {roleplay.name}&rsquo;s knowledge: their own facts, their circles, and common knowledge. Write [in brackets] to step out of character.
                </p>
              </div>
            )}
            {messages.length === 0 ? (
              <div className="flex flex-col gap-5 pt-6">
                <div>
                  <h1 className="font-serif text-3xl font-semibold">{roleplay ? `Talk to ${roleplay.name}` : "Ask your world"}</h1>
                  <p className="mt-1 text-muted">{roleplay ? "Say something in character." : "Answers are grounded in your records. Requests to create things become proposals you approve."}</p>
                </div>
                {!roleplay && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PROMPTS.map((p) => (
                      <button key={p} onClick={() => send(p)} className="rounded-lg border border-line px-3 py-2.5 text-left text-sm text-muted hover:border-line-strong hover:text-fg">
                        {p}
                      </button>
                    ))}
                  </div>
                )}
                {w.aiProvider.problem && (
                  <p className="rounded-md border border-ember/30 bg-ember-soft px-3 py-2 text-xs text-fg">
                    Claude is set up but isn&rsquo;t answering: {w.aiProvider.problem} Until that&rsquo;s fixed, answers come from your records and proposals from the built-in engine.
                  </p>
                )}
                {(provider ?? w.aiProvider.name) === "offline" && !w.aiProvider.problem && (
                  <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                    Offline mode: answers come straight from your records, and proposals use Worldloom&rsquo;s rule-based engine. Add <code>ANTHROPIC_API_KEY</code> to the server environment for free-form AI.
                  </p>
                )}
              </div>
            ) : (
              <ChatThread messages={messages} streaming={streaming} />
            )}
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto max-w-3xl px-4 py-3">
            <ChatComposer onSend={(t) => send(t)} streaming={streaming} onStop={stop} placeholder={roleplay ? `Say something to ${roleplay.name}…` : undefined} autoFocus />
          </div>
        </div>
      </div>
    </div>
  );
}
