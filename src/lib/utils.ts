import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled"
  );
}

export function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

export function plural(n: number, one: string, many?: string) {
  return `${n} ${n === 1 ? one : (many ?? one + "s")}`;
}

/** "3 minutes ago" for real-world timestamps. */
export function timeAgo(date: Date | string | number, now = Date.now()): string {
  const t = typeof date === "object" ? date.getTime() : new Date(date).getTime();
  const s = Math.round((now - t) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: d > 300 ? "numeric" : undefined });
}

export function stripMarkdown(md: string): string {
  return md
    .replace(/:::dm[\s\S]*?:::/g, "")
    .replace(/@\[([^\]]+)\]\(entity:[0-9a-f-]+\)/gi, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function uniqueBy<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}
export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Lower-case a label for use mid-sentence, keeping acronyms like "NPC" intact. */
export function lowerLabel(label: string) {
  return label
    .split(" ")
    .map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase()))
    .join(" ");
}
