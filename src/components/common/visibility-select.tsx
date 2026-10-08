"use client";

import * as React from "react";
import { NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/primitives";
import { WorldDateInput } from "@/components/common/world-date-input";
import { useNow, useWorld } from "@/components/shell/world-context";

export type Visibility = "dm_only" | "secret" | "partially_known" | "discovered" | "public";

export const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "public", label: "Public: common knowledge" },
  { value: "discovered", label: "Discovered by the players" },
  { value: "partially_known", label: "Partially known" },
  { value: "secret", label: "Secret until discovered" },
  { value: "dm_only", label: "DM only, always" },
];

export function VisibilitySelect({ value, onChange, id, className }: { value: Visibility | string; onChange: (v: Visibility) => void; id?: string; className?: string }) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value as Visibility)} className={className} aria-label={id ? undefined : "Who can see this"}>
      {VISIBILITY_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}

/** An in-world date that can be left unset. */
export function OptionalWorldDate({ value, onChange, label, withTime }: { value: number | null; onChange: (v: number | null) => void; label: string; withTime?: boolean }) {
  const w = useWorld();
  const now = useNow();
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <Switch checked={value !== null} onCheckedChange={(c) => onChange(c ? now : null)} aria-label={label} />
      </label>
      {value !== null && <WorldDateInput calendar={w.calendar} value={value} onChange={onChange} withTime={withTime} />}
    </div>
  );
}
