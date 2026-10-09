"use client";

import { DIALS, type Dials } from "@/lib/spark";
import { cn } from "@/lib/utils";

const STOP_LABEL = (v: number, left: string, right: string) => (v === -2 ? `Very ${left.toLowerCase()}` : v === -1 ? left : v === 0 ? "Balanced" : v === 1 ? right : `Very ${right.toLowerCase()}`);

/** Four five-stop dials. Claude reads them before every pitch and section. */
export function VibeDials({ value, onChange, compact = false }: { value: Dials; onChange: (d: Dials) => void; compact?: boolean }) {
  return (
    <div className={cn("grid gap-x-8", compact ? "gap-y-2 sm:grid-cols-2" : "gap-y-3 sm:grid-cols-2")}>
      {DIALS.map((d) => (
        <div key={d.key} role="radiogroup" aria-label={`${d.left} to ${d.right}`} className="grid grid-cols-[5.5rem_1fr_5.5rem] items-center gap-2 text-sm">
          <span className={cn("text-right", value[d.key] < 0 ? "text-fg" : "text-faint")}>{d.left}</span>
          <div className="relative flex items-center justify-between px-1">
            <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-line" aria-hidden />
            {[-2, -1, 0, 1, 2].map((v) => {
              const on = value[d.key] === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={STOP_LABEL(v, d.left, d.right)}
                  title={STOP_LABEL(v, d.left, d.right)}
                  onClick={() => onChange({ ...value, [d.key]: v })}
                  className={cn(
                    "relative z-10 flex size-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                  )}
                >
                  <span className={cn("block rounded-full transition-all", on ? "size-4 bg-accent ring-4 ring-accent-soft" : v === 0 ? "size-2 bg-line-strong" : "size-1.5 bg-line-strong hover:size-2.5")} />
                </button>
              );
            })}
          </div>
          <span className={cn(value[d.key] > 0 ? "text-fg" : "text-faint")}>{d.right}</span>
        </div>
      ))}
    </div>
  );
}
