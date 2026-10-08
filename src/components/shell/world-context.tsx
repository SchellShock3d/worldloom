"use client";

import * as React from "react";
import type { CalendarDefinition } from "@/lib/calendar";
import type { CustomTypeLike } from "@/lib/entity-types";
import type { EntityInput } from "@/lib/validation";

export interface ShellCampaign {
  id: string;
  name: string;
  status: string;
  currentAt: number;
}

export interface WorldShellValue {
  worldId: string;
  worldName: string;
  role: string;
  calendar: CalendarDefinition;
  worldNow: number;
  campaigns: ShellCampaign[];
  activeCampaign: ShellCampaign | null;
  customTypes: CustomTypeLike[];
  /** `problem`: Claude is configured but recently failed (e.g. no API credits). */
  aiProvider: { name: string; live: boolean; problem?: string | null };
  openQuickCreate: (opts?: { type?: string; defaults?: Partial<EntityInput>; onCreated?: (e: { id: string; name: string; type: string }) => void }) => void;
  openPalette: () => void;
  openAssistant: (opts?: { prompt?: string; focusEntityId?: string }) => void;
  openAdvance: () => void;
}

const Ctx = React.createContext<WorldShellValue | null>(null);

export function WorldShellProvider({ value, children }: { value: WorldShellValue; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorld(): WorldShellValue {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useWorld must be used inside a world");
  return v;
}

export function useOptionalWorld(): WorldShellValue | null {
  return React.useContext(Ctx);
}

/** The in-world "now" for the active context: the campaign clock if a campaign is active. */
export function useNow() {
  const w = useWorld();
  return w.activeCampaign?.currentAt ?? w.worldNow;
}
