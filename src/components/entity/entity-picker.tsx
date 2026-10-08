"use client";

import * as React from "react";
import { Command } from "cmdk";
import { ChevronDown, Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { TypeIcon } from "./type-icon";
import { getEntityType } from "@/lib/entity-types";
import { cn } from "@/lib/utils";
import { useWorld } from "@/components/shell/world-context";

export interface EntityOption {
  id: string;
  name: string;
  type: string;
  summary?: string;
}

export function useEntitySearch(types?: string[], enabled = true) {
  const w = useWorld();
  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<EntityOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const typeKey = types?.join(",") ?? "";
  React.useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (q.trim()) params.set("q", q.trim());
        if (typeKey) params.set("types", typeKey);
        if (w.activeCampaign) params.set("campaign", w.activeCampaign.id);
        const res = await fetch(`/api/w/${w.worldId}/entities?${params}`, { signal: ctrl.signal });
        if (res.ok) setItems(await res.json());
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, typeKey, enabled, w.worldId, w.activeCampaign]);
  return { q, setQ, items, loading };
}

export function EntityPicker({
  value,
  onChange,
  types,
  placeholder = "Choose…",
  allowCreate = true,
  createType,
  className,
  excludeIds,
  size = "md",
  id,
  ariaLabel,
}: {
  value: EntityOption | null;
  onChange: (v: EntityOption | null) => void;
  types?: string[];
  placeholder?: string;
  allowCreate?: boolean;
  createType?: string;
  className?: string;
  excludeIds?: string[];
  size?: "sm" | "md";
  id?: string;
  ariaLabel?: string;
}) {
  const w = useWorld();
  const [open, setOpen] = React.useState(false);
  const { q, setQ, items, loading } = useEntitySearch(types, open);
  const filtered = items.filter((i) => !excludeIds?.includes(i.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative flex", className)}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-label={ariaLabel}
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-left hover:border-line-strong focus:border-accent focus:outline-none",
              size === "sm" ? "h-7 text-sm" : "h-8 text-base",
            )}
          >
            {value ? (
              <>
                <TypeIcon type={value.type} />
                <span className="min-w-0 flex-1 truncate">{value.name}</span>
              </>
            ) : (
              <span className="flex-1 truncate text-faint">{placeholder}</span>
            )}
            {!value && <ChevronDown className="size-4 shrink-0 text-faint" />}
          </button>
        </PopoverTrigger>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-faint hover:bg-surface-2 hover:text-fg"
            aria-label="Clear"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0" align="start">
        <Command shouldFilter={false} loop>
          <Command.Input
            value={q}
            onValueChange={setQ}
            placeholder={types?.length === 1 ? `Search ${getEntityType(types[0]!).plural.toLowerCase()}…` : "Search…"}
            className="h-10 w-full border-b border-line bg-transparent px-3 text-base outline-none placeholder:text-faint"
            autoFocus
          />
          <Command.List className="max-h-72 overflow-y-auto p-1">
            {!loading && filtered.length === 0 && <Command.Empty className="px-3 py-4 text-center text-sm text-muted">No matches</Command.Empty>}
            {filtered.map((it) => (
              <Command.Item
                key={it.id}
                value={it.id}
                onSelect={() => {
                  onChange(it);
                  setOpen(false);
                }}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 data-[selected=true]:bg-surface-2"
              >
                <TypeIcon type={it.type} />
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
                <span className="shrink-0 text-xs text-faint">{getEntityType(it.type).label}</span>
              </Command.Item>
            ))}
            {allowCreate && q.trim().length > 0 && (
              <Command.Item
                value="__create"
                onSelect={() => {
                  setOpen(false);
                  w.openQuickCreate({
                    type: createType ?? types?.[0],
                    defaults: { name: q.trim() },
                    onCreated: (e) => onChange({ id: e.id, name: e.name, type: e.type }),
                  });
                }}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-accent data-[selected=true]:bg-surface-2"
              >
                <Plus className="size-4" />
                Create “{q.trim()}”
              </Command.Item>
            )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Multi-select variant: chips plus a picker. */
export function EntityMultiPicker({
  value,
  onChange,
  types,
  placeholder = "Add…",
}: {
  value: EntityOption[];
  onChange: (v: EntityOption[]) => void;
  types?: string[];
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span key={v.id} className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface-2 pl-2 pr-1 text-sm">
              <TypeIcon type={v.type} className="size-3.5" />
              {v.name}
              <button type="button" onClick={() => onChange(value.filter((x) => x.id !== v.id))} className="rounded-full p-0.5 text-faint hover:text-fg" aria-label={`Remove ${v.name}`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <EntityPicker value={null} onChange={(v) => v && !value.some((x) => x.id === v.id) && onChange([...value, v])} types={types} placeholder={placeholder} excludeIds={value.map((v) => v.id)} size="sm" />
    </div>
  );
}
