/**
 * Entity mentions in markdown.
 *
 * Stored form: `@[Display Name](entity:<uuid>)`. The id is the source of truth,
 * so references survive renames; the display name is refreshed at render time.
 * Writers can also type `@Name` freely; `resolvePlainMentions` converts known
 * names/aliases into the stored form when a document is saved.
 */

export const MENTION_RE = /@\[([^\]\n]{1,200})\]\(entity:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export function mentionToken(name: string, id: string) {
  return `@[${name.replace(/[\[\]]/g, "")}](entity:${id})`;
}

export function extractMentionIds(md: string | null | undefined): string[] {
  if (!md) return [];
  const ids = new Set<string>();
  for (const m of md.matchAll(MENTION_RE)) ids.add(m[2]!.toLowerCase());
  return [...ids];
}

export interface NameIndexEntry {
  id: string;
  name: string;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Replace `@Name` occurrences that match a known entity name or alias with the
 * stored token. Longest names win ("@Lord Vael" beats "@Lord"). Text inside
 * existing tokens, code spans and URLs is left alone.
 */
export function resolvePlainMentions(md: string, index: NameIndexEntry[]): string {
  if (!md.includes("@") || index.length === 0) return md;
  const sorted = [...index].filter((e) => e.name.trim().length > 1).sort((a, b) => b.name.length - a.name.length);
  // Protect existing tokens and code spans.
  const protectedRanges: [number, number][] = [];
  for (const m of md.matchAll(MENTION_RE)) protectedRanges.push([m.index!, m.index! + m[0].length]);
  for (const m of md.matchAll(/`[^`\n]*`/g)) protectedRanges.push([m.index!, m.index! + m[0].length]);
  const isProtected = (i: number) => protectedRanges.some(([a, b]) => i >= a && i < b);

  let out = "";
  let i = 0;
  while (i < md.length) {
    const ch = md[i]!;
    if (ch === "@" && !isProtected(i) && (i === 0 || !WORD_CHAR.test(md[i - 1]!)) && md[i + 1] !== "[") {
      const rest = md.slice(i + 1);
      const restLower = rest.toLowerCase();
      const hit = sorted.find((e) => {
        const n = e.name.toLowerCase();
        if (!restLower.startsWith(n)) return false;
        const after = rest[n.length];
        return after === undefined || !WORD_CHAR.test(after);
      });
      if (hit) {
        const matched = rest.slice(0, hit.name.length);
        out += mentionToken(matched, hit.id);
        i += 1 + hit.name.length;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

/** Update display names inside tokens to match current entity names. */
export function refreshMentionNames(md: string, names: Map<string, string>): string {
  return md.replace(MENTION_RE, (full, _name: string, id: string) => {
    const current = names.get(id.toLowerCase());
    return current ? mentionToken(current, id) : full;
  });
}

// ---------------------------------------------------------------------------
// DM-only blocks
// ---------------------------------------------------------------------------

const DM_BLOCK_RE = /^:::dm[ \t]*\n([\s\S]*?)\n:::[ \t]*$/gm;

export interface MarkdownSegment {
  kind: "public" | "dm";
  text: string;
}

/** Split markdown into public and DM-only segments (`:::dm` … `:::`). */
export function splitDmBlocks(md: string): MarkdownSegment[] {
  const segs: MarkdownSegment[] = [];
  let last = 0;
  for (const m of md.matchAll(DM_BLOCK_RE)) {
    if (m.index! > last) segs.push({ kind: "public", text: md.slice(last, m.index) });
    segs.push({ kind: "dm", text: m[1]! });
    last = m.index! + m[0].length;
  }
  if (last < md.length) segs.push({ kind: "public", text: md.slice(last) });
  return segs.filter((s) => s.text.trim().length > 0);
}

/** The player-safe projection of a markdown document. */
export function toPlayerMarkdown(md: string): string {
  return splitDmBlocks(md)
    .filter((s) => s.kind === "public")
    .map((s) => s.text.trim())
    .join("\n\n");
}

/** Plain text for AI context and search snippets: mentions become names. */
export function mentionsToPlain(md: string): string {
  return md.replace(MENTION_RE, (_f, name: string) => name);
}
