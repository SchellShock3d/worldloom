import type { EntityTypeDef, FieldDef } from "@/lib/entity-types";
import { abilityMod } from "@/lib/game-systems/dnd5e";
import { cn } from "@/lib/utils";

function hasValue(v: unknown) {
  return !(v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));
}

/** Short fields as a definition list (sidebar). */
export function ShortFields({ def, fields, includeDm = true }: { def: EntityTypeDef; fields: Record<string, unknown>; includeDm?: boolean }) {
  const short = def.fields.filter((f) => ["text", "number", "select", "tags", "boolean"].includes(f.kind) && f.section !== "stats" && (includeDm || f.section !== "dm") && hasValue(fields[f.key]));
  if (!short.length) return null;
  return (
    <dl className="flex flex-col">
      {short.map((f) => (
        <div key={f.key} className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-sm">
          <dt className="text-faint">{f.label}</dt>
          <dd className={cn("min-w-0", f.section === "dm" && "text-ember")}>{renderShort(f, fields[f.key])}</dd>
        </div>
      ))}
    </dl>
  );
}

function renderShort(f: FieldDef, v: unknown) {
  if (f.kind === "tags" && Array.isArray(v))
    return (
      <span className="flex flex-wrap gap-1">
        {v.map((t) => (
          <span key={String(t)} className="rounded-full bg-surface-3 px-2 py-0.5 text-xs">
            {String(t)}
          </span>
        ))}
      </span>
    );
  if (f.kind === "boolean") return v ? "Yes" : "No";
  return String(v);
}

/** Long-form fields (descriptions, inventories, stat blocks) for the main column. */
export function LongFields({ def, fields, playerView = false }: { def: EntityTypeDef; fields: Record<string, unknown>; playerView?: boolean }) {
  const stats = def.fields.filter((f) => f.section === "stats" && hasValue(fields[f.key]));
  const long = def.fields.filter((f) => ["textarea", "inventory"].includes(f.kind) && f.section !== "stats" && hasValue(fields[f.key]) && !(playerView && f.section === "dm"));
  if (!stats.length && !long.length) return null;
  return (
    <div className="flex flex-col gap-5">
      {stats.length > 0 && <StatBlock fields={fields} defs={stats} />}
      {long.length > 0 && (
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {long.map((f) => (
            <div key={f.key} className={cn(f.kind === "inventory" && "sm:col-span-2", f.section === "dm" && "dm-block")}>
              <dt className="text-xs font-medium text-faint">{f.label}</dt>
              <dd className="mt-1">
                {f.kind === "inventory" ? (
                  <InventoryTable rows={fields[f.key] as { name: string; price?: string; qty?: string; notes?: string }[]} />
                ) : (
                  <p className="whitespace-pre-line font-serif text-[1.02rem] leading-relaxed">{String(fields[f.key])}</p>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function InventoryTable({ rows }: { rows: { name: string; price?: string; qty?: string; notes?: string }[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs text-faint">
          <th className="py-1.5 pr-3 font-medium">Item</th>
          <th className="py-1.5 pr-3 font-medium">Price</th>
          <th className="py-1.5 pr-3 font-medium">Qty</th>
          <th className="py-1.5 font-medium">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-line/60">
            <td className="py-1.5 pr-3">{r.name}</td>
            <td className="py-1.5 pr-3 tabular text-brass">{r.price}</td>
            <td className="py-1.5 pr-3 tabular">{r.qty}</td>
            <td className="py-1.5 text-muted">{r.notes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StatBlock({ fields, defs }: { fields: Record<string, unknown>; defs: FieldDef[] }) {
  const abilities = fields.abilities as Record<string, number> | undefined;
  const top = defs.filter((d) => ["armorClass", "hitPoints", "speed", "hpMax", "ac", "passivePerception", "initiativeBonus"].includes(d.key));
  const rest = defs.filter((d) => !top.includes(d) && d.kind !== "abilities");
  return (
    <section className="rounded-lg border border-line bg-surface-2 p-4" aria-label="Stat block">
      {top.length > 0 && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {top.map((d) => (
            <div key={d.key} className="flex gap-1.5">
              <dt className="font-semibold">{d.label}</dt>
              <dd className="tabular">{String(fields[d.key])}</dd>
            </div>
          ))}
        </dl>
      )}
      {abilities && (
        <div className="mt-3 grid grid-cols-6 gap-1 border-y border-line py-2 text-center">
          {(["str", "dex", "con", "int", "wis", "cha"] as const).map((k) => (
            <div key={k}>
              <p className="text-2xs font-semibold uppercase text-faint">{k}</p>
              <p className="text-sm tabular">
                {abilities[k] ?? "–"} <span className="text-muted">({abilities[k] !== undefined ? fmtMod(abilityMod(abilities[k]!)) : "–"})</span>
              </p>
            </div>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          {rest.map((d) => (
            <div key={d.key}>
              <dt className="font-semibold">{d.label}</dt>
              <dd className="whitespace-pre-line text-muted">{String(fields[d.key])}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function fmtMod(n: number) {
  return n >= 0 ? `+${n}` : String(n);
}
