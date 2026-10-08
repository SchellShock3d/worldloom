"use client";

import * as React from "react";
import { AtSign, Bold, EyeOff, Heading2, Italic, Link2, List, Quote } from "lucide-react";
import { Markdown, type RefMap } from "./markdown";
import { useEntitySearch } from "@/components/entity/entity-picker";
import { TypeIcon } from "@/components/entity/type-icon";
import { getEntityType } from "@/lib/entity-types";
import { mentionToken } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/overlays";
import { Segmented } from "@/components/ui/primitives";

/** Pixel coordinates of the caret inside a textarea (mirror-div technique). */
function caretCoords(el: HTMLTextAreaElement, pos: number) {
  const div = document.createElement("div");
  const style = getComputedStyle(el);
  for (const p of ["boxSizing", "width", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderLeftWidth", "whiteSpace", "wordWrap", "tabSize"] as const) {
    (div.style as unknown as Record<string, string>)[p] = style[p] as string;
  }
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";
  div.style.overflow = "hidden";
  div.textContent = el.value.slice(0, pos);
  const span = document.createElement("span");
  span.textContent = el.value.slice(pos) || ".";
  div.appendChild(span);
  document.body.appendChild(div);
  const top = span.offsetTop - el.scrollTop;
  const left = span.offsetLeft;
  document.body.removeChild(div);
  return { top, left, lineHeight: parseFloat(style.lineHeight) || 20 };
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minRows = 10,
  refs,
  id,
  className,
  allowDmBlocks = true,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  refs?: RefMap;
  id?: string;
  className?: string;
  allowDmBlocks?: boolean;
  autoFocus?: boolean;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = React.useState<"write" | "preview">("write");
  const [mention, setMention] = React.useState<{ start: number; query: string; top: number; left: number } | null>(null);
  const [active, setActive] = React.useState(0);
  const { setQ, items } = useEntitySearch(undefined, !!mention);
  const [localRefs, setLocalRefs] = React.useState<RefMap>({});

  React.useEffect(() => {
    if (mention) setQ(mention.query);
  }, [mention, setQ]);
  React.useEffect(() => setActive(0), [items]);

  const detectMention = () => {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos);
    const m = before.match(/(?:^|[\s(])@([\p{L}\p{N}' -]{0,40})$/u);
    if (m && !m[1]!.includes("  ")) {
      const start = pos - m[1]!.length - 1;
      const c = caretCoords(el, start);
      setMention({ start, query: m[1]!.trim(), top: c.top + c.lineHeight + 4, left: Math.min(c.left, el.clientWidth - 260) });
    } else setMention(null);
  };

  const insertMention = (e: { id: string; name: string; type: string }) => {
    const el = ref.current;
    if (!el || !mention) return;
    const token = mentionToken(e.name, e.id);
    const end = el.selectionStart;
    const next = value.slice(0, mention.start) + token + " " + value.slice(end);
    onChange(next);
    setLocalRefs((r) => ({ ...r, [e.id]: { name: e.name, type: e.type } }));
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      const p = mention.start + token.length + 1;
      el.setSelectionRange(p, p);
    });
  };

  const wrap = (before: string, after = before, placeholderText = "text") => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || placeholderText;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const linePrefix = (prefix: string) => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    onChange(value.slice(0, lineStart) + prefix + value.slice(lineStart));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + prefix.length, s + prefix.length);
    });
  };
  const dmBlock = () => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || "Secret for the DM only";
    const pre = s > 0 && value[s - 1] !== "\n" ? "\n\n" : "";
    const block = `${pre}:::dm\n${sel}\n:::\n`;
    onChange(value.slice(0, s) + block + value.slice(e));
    requestAnimationFrame(() => el.focus());
  };
  const startMention = () => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const pre = s > 0 && !/\s/.test(value[s - 1]!) ? " @" : "@";
    onChange(value.slice(0, s) + pre + value.slice(s));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + pre.length, s + pre.length);
      detectMention();
    });
  };

  const tools: { icon: React.ReactNode; label: string; run: () => void; shortcut?: string }[] = [
    { icon: <Bold />, label: "Bold", run: () => wrap("**"), shortcut: "⌘B" },
    { icon: <Italic />, label: "Italic", run: () => wrap("_"), shortcut: "⌘I" },
    { icon: <Heading2 />, label: "Heading", run: () => linePrefix("## ") },
    { icon: <List />, label: "List", run: () => linePrefix("- ") },
    { icon: <Quote />, label: "Quote", run: () => linePrefix("> ") },
    { icon: <Link2 />, label: "Link", run: () => wrap("[", "](https://)", "link text") },
    { icon: <AtSign />, label: "Mention an entity", run: startMention, shortcut: "@" },
  ];

  return (
    <div className={cn("rounded-lg border border-line bg-surface focus-within:border-accent", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1">
        {tools.map((t) => (
          <Tooltip key={t.label} content={t.label} shortcut={t.shortcut}>
            <button type="button" onClick={t.run} disabled={mode === "preview"} className="flex size-7 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 [&_svg]:size-4" aria-label={t.label}>
              {t.icon}
            </button>
          </Tooltip>
        ))}
        {allowDmBlocks && (
          <Tooltip content="DM-only block (hidden from players)">
            <button type="button" onClick={dmBlock} disabled={mode === "preview"} className="flex h-7 items-center gap-1 rounded px-2 text-xs font-medium text-ember hover:bg-ember-soft disabled:opacity-40">
              <EyeOff className="size-3.5" /> DM only
            </button>
          </Tooltip>
        )}
        <div className="flex-1" />
        <Segmented
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "write", label: "Write" },
            { value: "preview", label: "Preview" },
          ]}
        />
      </div>
      <div className="relative">
        {mode === "write" ? (
          <textarea
            ref={ref}
            id={id}
            value={value}
            autoFocus={autoFocus}
            placeholder={placeholder ?? "Write in markdown. Type @ to link people, places and anything else in your world."}
            onChange={(e) => {
              onChange(e.target.value);
              requestAnimationFrame(detectMention);
            }}
            onKeyDown={(e) => {
              if (mention && items.length) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => (a + 1) % items.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => (a - 1 + items.length) % items.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  insertMention(items[active]!);
                  return;
                }
              }
              if (e.key === "Escape" && mention) {
                setMention(null);
                return;
              }
              if ((e.metaKey || e.ctrlKey) && e.key === "b") {
                e.preventDefault();
                wrap("**");
              }
              if ((e.metaKey || e.ctrlKey) && e.key === "i") {
                e.preventDefault();
                wrap("_");
              }
            }}
            onClick={detectMention}
            onBlur={() => setTimeout(() => setMention(null), 150)}
            rows={minRows}
            className="block w-full resize-y bg-transparent px-3 py-2.5 font-serif text-[1.02rem] leading-relaxed text-fg outline-none placeholder:font-sans placeholder:text-sm placeholder:text-faint"
          />
        ) : (
          <div className="min-h-40 px-4 py-3">{value.trim() ? <Markdown refs={{ ...refs, ...localRefs }}>{value}</Markdown> : <p className="text-sm text-faint">Nothing to preview yet.</p>}</div>
        )}
        {mention && mode === "write" && (
          <div className="absolute z-30 w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-pop" style={{ top: mention.top, left: Math.max(8, mention.left) }} role="listbox" aria-label="Mention suggestions">
            {items.length === 0 ? (
              <p className="px-3 py-2 text-sm text-faint">{mention.query ? "No matches" : "Type a name…"}</p>
            ) : (
              items.slice(0, 8).map((it, i) => (
                <button
                  type="button"
                  key={it.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(it);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm", i === active && "bg-surface-2")}
                >
                  <TypeIcon type={it.type} />
                  <span className="min-w-0 flex-1 truncate">{it.name}</span>
                  <span className="text-xs text-faint">{getEntityType(it.type).label}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
