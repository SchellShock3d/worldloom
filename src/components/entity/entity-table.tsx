import Link from "next/link";
import { Star } from "lucide-react";
import { getEntityType, fieldToText, type CustomTypeLike } from "@/lib/entity-types";
import { TypeGlyph } from "./type-icon";
import { Badge } from "@/components/ui/display";
import { timeAgo } from "@/lib/utils";
import type { EntityListItem } from "@/server/services/entities";

export function EntityTable({
  worldId,
  rows,
  locations,
  showType = true,
  custom,
  overlays,
}: {
  worldId: string;
  rows: EntityListItem[];
  locations: Record<string, string>;
  showType?: boolean;
  custom?: CustomTypeLike[];
  overlays?: Record<string, { status: string | null; reputation: number | null; knowledge: string }>;
}) {
  // Columns: type-specific list fields only when every row shares a type.
  const types = Array.from(new Set(rows.map((r) => r.type)));
  const single = types.length === 1 ? getEntityType(types[0]!, custom) : null;
  const listFields = single?.fields.filter((f) => f.inList).slice(0, 3) ?? [];
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-surface-2 text-left text-xs text-faint">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            {showType && !single && <th className="px-3 py-2 font-medium">Type</th>}
            {listFields.map((f) => (
              <th key={f.key} className="px-3 py-2 font-medium">
                {f.label}
              </th>
            ))}
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Where</th>
            <th className="px-3 py-2 text-right font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const def = getEntityType(r.type, custom);
            const ov = overlays?.[r.id];
            const status = ov?.status ?? r.status;
            return (
              <tr key={r.id} className="group bg-surface hover:bg-surface-2/60">
                <td className="max-w-[28rem] px-3 py-2">
                  <Link href={`/w/${worldId}/e/${r.id}`} className="flex items-center gap-2.5">
                    <TypeGlyph type={r.type} size="sm" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium group-hover:text-accent">{r.name}</span>
                        {r.importance > 0 && <Star className="size-3 shrink-0 fill-brass text-brass" aria-label="Important" />}
                        {r.canonStatus !== "canon" && <Badge tone={r.canonStatus === "proposed" ? "arcane" : "neutral"}>{r.canonStatus}</Badge>}
                        {r.visibility === "public" && <span className="sr-only">public</span>}
                      </span>
                      {r.summary && <span className="block truncate text-xs text-muted">{r.summary}</span>}
                    </span>
                  </Link>
                </td>
                {showType && !single && <td className="whitespace-nowrap px-3 py-2 text-muted">{def.label}</td>}
                {listFields.map((f) => (
                  <td key={f.key} className="max-w-48 truncate px-3 py-2 text-muted">
                    {fieldToText(f, (r.fields as Record<string, unknown>)[f.key])}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2">
                  {status && (
                    <Badge tone={["dead", "destroyed", "ruined", "lost", "extinct"].includes(status) ? "ember" : ov?.status ? "brass" : "neutral"}>
                      {status}
                      {ov?.status && " *"}
                    </Badge>
                  )}
                </td>
                <td className="max-w-40 truncate px-3 py-2 text-muted">{r.locationId ? locations[r.locationId] : ""}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-faint">{timeAgo(r.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
