import type { DB } from "@/server/db/client";
import { extractMentionIds } from "@/lib/mentions";
import { getEntityRefs } from "./entities";

export type RefMap = Record<string, { name: string; type: string; summary?: string }>;

/** Current names/types for every entity mentioned in the given markdown docs. */
export async function collectRefs(db: DB, worldId: string, ...docs: (string | null | undefined)[]): Promise<RefMap> {
  const ids = Array.from(new Set(docs.flatMap((d) => extractMentionIds(d))));
  if (!ids.length) return {};
  const rows = await getEntityRefs(db, worldId, ids);
  return Object.fromEntries(rows.map((r) => [r.id, { name: r.name, type: r.type, summary: r.summary }]));
}
