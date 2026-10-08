"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, Inbox, MessageSquarePlus, Sparkles, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/common/markdown";
import { useWorld } from "@/components/shell/world-context";
import { cn } from "@/lib/utils";
import { TypeIcon } from "@/components/entity/type-icon";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  refs?: { id: string; name: string; type: string }[];
  batch?: { id: string; count: number };
  error?: string;
}

const SUGGESTIONS = [
  "What is happening elsewhere in the world right now?",
  "Which NPCs have unfinished business with the party?",
  "What plot threads have I forgotten?",
  "Create a tavern in the party's current town",
  "What changed while the party was travelling?",
];

/** Streams a copilot turn from the NDJSON endpoint. */
export function useAssistant(opts: { roleplayEntityId?: string | null; initialConversationId?: string | null; initialMessages?: ChatMessage[] } = {}) {
  const w = useWorld();
  const [messages, setMessages] = React.useState<ChatMessage[]>(opts.initialMessages ?? []);
  const [conversationId, setConversationId] = React.useState<string | null>(opts.initialConversationId ?? null);
  const [streaming, setStreaming] = React.useState(false);
  const [provider, setProvider] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const send = React.useCallback(
    async (text: string, focusEntityId?: string | null) => {
      const msg = text.trim();
      if (!msg || streaming) return;
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: msg };
      const asst: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };
      setMessages((m) => [...m, userMsg, asst]);
      setStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/w/${w.worldId}/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, conversationId, campaignId: w.activeCampaign?.id ?? null, focusEntityId: focusEntityId ?? null, roleplayEntityId: opts.roleplayEntityId ?? null }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? "The assistant is unavailable.");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const update = (fn: (m: ChatMessage) => ChatMessage) => setMessages((all) => all.map((m) => (m.id === asst.id ? fn(m) : m)));
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line.trim()) continue;
            const ev = JSON.parse(line);
            if (ev.type === "meta") {
              setConversationId(ev.conversationId);
              setProvider(ev.provider);
              update((m) => ({ ...m, refs: ev.refs }));
            } else if (ev.type === "text") update((m) => ({ ...m, content: m.content + ev.delta }));
            else if (ev.type === "proposals") update((m) => ({ ...m, batch: { id: ev.batchId, count: ev.count } }));
            else if (ev.type === "error") update((m) => ({ ...m, error: ev.message }));
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setMessages((all) => all.map((m) => (m.id === asst.id ? { ...m, error: (err as Error).message } : m)));
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [w.worldId, w.activeCampaign?.id, conversationId, streaming, opts.roleplayEntityId],
  );

  const stop = () => abortRef.current?.abort();
  const reset = () => {
    setMessages([]);
    setConversationId(null);
  };
  return { messages, send, streaming, stop, reset, conversationId, provider };
}

export function ChatThread({ messages, streaming }: { messages: ChatMessage[]; streaming: boolean }) {
  const w = useWorld();
  const endRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);
  return (
    <div className="flex flex-col gap-5">
      {messages.map((m, i) =>
        m.role === "user" ? (
          <div key={m.id} className="ml-8 self-end rounded-lg rounded-br-sm bg-surface-3 px-3 py-2 text-base text-fg">
            {m.content}
          </div>
        ) : (
          <div key={m.id} className="flex flex-col gap-2">
            {m.content ? (
              <Markdown variant="sans" className="max-w-none">
                {m.content}
              </Markdown>
            ) : streaming && i === messages.length - 1 ? (
              <p className="flex items-center gap-2 text-sm text-faint">
                <Sparkles className="size-3.5 animate-pulse text-arcane" /> Reading your world…
              </p>
            ) : null}
            {m.error && <p className="rounded-md bg-ember-soft px-3 py-2 text-sm text-ember">{m.error}</p>}
            {m.batch && (
              <Link
                href={`/w/${w.worldId}/proposals/${m.batch.id}`}
                className="flex items-center gap-2 self-start rounded-md border border-arcane/30 bg-arcane-soft px-3 py-2 text-sm font-medium text-arcane hover:bg-arcane/20"
              >
                <Inbox className="size-4" /> Review {m.batch.count} proposal{m.batch.count === 1 ? "" : "s"}
              </Link>
            )}
            {m.refs && m.refs.length > 0 && m.content && (
              <details className="text-xs text-faint">
                <summary className="cursor-pointer select-none hover:text-muted">Used {m.refs.length} record{m.refs.length === 1 ? "" : "s"}</summary>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {m.refs.map((r) => (
                    <Link key={r.id} href={`/w/${w.worldId}/e/${r.id}`} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 hover:text-fg">
                      <TypeIcon type={r.type} className="size-3" /> {r.name}
                    </Link>
                  ))}
                </div>
              </details>
            )}
          </div>
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}

export function ChatComposer({ onSend, streaming, onStop, placeholder, autoFocus }: { onSend: (t: string) => void; streaming: boolean; onStop: () => void; placeholder?: string; autoFocus?: boolean }) {
  const [text, setText] = React.useState("");
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const submit = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };
  return (
    <div className="flex items-end gap-2 rounded-lg border border-line bg-surface p-2 focus-within:border-accent">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder={placeholder ?? "Ask about your world, or ask it to create something…"}
        className="max-h-40 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1 text-base outline-none placeholder:text-faint"
        style={{ fieldSizing: "content" } as React.CSSProperties}
      />
      {streaming ? (
        <Button variant="secondary" size="icon-sm" onClick={onStop} aria-label="Stop">
          <Square />
        </Button>
      ) : (
        <Button variant="primary" size="icon-sm" onClick={submit} disabled={!text.trim()} aria-label="Send">
          <ArrowUp />
        </Button>
      )}
    </div>
  );
}

export function AssistantDrawer({ open, onOpenChange, initialPrompt, focusEntityId }: { open: boolean; onOpenChange: (o: boolean) => void; initialPrompt?: string; focusEntityId?: string }) {
  const w = useWorld();
  const pathname = usePathname();
  const { messages, send, streaming, stop, reset, provider } = useAssistant();
  // Focus the entity whose page is open, so questions like "who are their allies?" work.
  const pageEntity = pathname.match(/\/e\/([0-9a-f-]{36})/)?.[1] ?? null;
  const focus = focusEntityId ?? pageEntity;
  const sentInitial = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (open && initialPrompt && sentInitial.current !== initialPrompt) {
      sentInitial.current = initialPrompt;
      send(initialPrompt, focus);
    }
  }, [open, initialPrompt, send, focus]);

  if (!open) return null;
  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-surface shadow-pop animate-drawer sm:w-[26rem] lg:static lg:z-auto lg:shadow-none" aria-label="AI copilot">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <Sparkles className="size-4 text-arcane" />
        <span className="font-serif text-lg font-semibold">Copilot</span>
        {(provider ?? w.aiProvider.name) === "offline" && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-2xs font-medium text-muted">Offline</span>}
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={reset} aria-label="New conversation" disabled={streaming}>
          <MessageSquarePlus />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Close copilot">
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-serif text-xl font-semibold">Ask your world.</p>
              <p className="mt-1 text-sm text-muted">
                Answers come from your records{w.activeCampaign ? ` and the ${w.activeCampaign.name} campaign` : ""}. Anything it creates arrives as proposals for you to approve.
              </p>
              {focus && <p className="mt-2 text-xs text-faint">Focused on the page you have open.</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s, focus)} className="rounded-md border border-line px-3 py-2 text-left text-sm text-muted hover:border-line-strong hover:text-fg">
                  {s}
                </button>
              ))}
            </div>
            {w.aiProvider.problem && (
              <p className="rounded-md border border-ember/30 bg-ember-soft px-3 py-2 text-xs text-fg">
                Claude is set up but isn&rsquo;t answering: {w.aiProvider.problem} Until that&rsquo;s fixed, answers come from your records and proposals from the built-in engine.
              </p>
            )}
            {!w.aiProvider.live && (
              <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                No AI model is connected, so the copilot answers from your records and uses Worldloom&rsquo;s rule-based engine for proposals. Add <code>ANTHROPIC_API_KEY</code> to enable free-form reasoning.
              </p>
            )}
          </div>
        ) : (
          <ChatThread messages={messages} streaming={streaming} />
        )}
      </div>
      <div className={cn("shrink-0 border-t border-line p-3")}>
        <ChatComposer onSend={(t) => send(t, focus)} streaming={streaming} onStop={stop} autoFocus />
        <p className="mt-1.5 text-2xs text-faint">Enter to send · Shift+Enter for a new line · ⌘J to toggle</p>
      </div>
    </aside>
  );
}
