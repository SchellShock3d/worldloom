"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/primitives";
import { ENTITY_GROUPS, ENTITY_TYPES, getEntityType } from "@/lib/entity-types";
import { createEntityAction } from "@/server/actions/entities";
import type { EntityInput } from "@/lib/validation";
import { useWorld, useNow } from "@/components/shell/world-context";
import { EntityPicker, type EntityOption } from "./entity-picker";
import { WorldDateInput } from "@/components/common/world-date-input";
import { TypeGlyph } from "./type-icon";

export interface QuickCreateRequest {
  type?: string;
  defaults?: Partial<EntityInput>;
  onCreated?: (e: { id: string; name: string; type: string }) => void;
}

export function QuickCreateDialog({ request, onClose }: { request: QuickCreateRequest | null; onClose: () => void }) {
  const w = useWorld();
  const now = useNow();
  const router = useRouter();
  const open = !!request;
  const [type, setType] = React.useState("npc");
  const [name, setName] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [location, setLocation] = React.useState<EntityOption | null>(null);
  const [visible, setVisible] = React.useState(false);
  const [eventAt, setEventAt] = React.useState(now);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (request) {
      setType(request.type ?? (request.defaults?.type as string | undefined) ?? "npc");
      setName((request.defaults?.name as string) ?? "");
      setSummary((request.defaults?.summary as string) ?? "");
      setLocation(null);
      setVisible(request.defaults?.visibility === "public");
      setEventAt((request.defaults?.event as { startAt?: number } | undefined)?.startAt ?? now);
      setError(null);
    }
  }, [request, now]);

  const def = getEntityType(type, w.customTypes);
  const campaignScoped = def.campaignScoped;
  const types = [...ENTITY_TYPES.filter((t) => !t.campaignScoped || w.activeCampaign), ...w.customTypes.map((c) => getEntityType(c.key, w.customTypes))];

  async function submit(openAfter: boolean) {
    if (!name.trim()) {
      setError("Give it a name.");
      return;
    }
    setPending(true);
    setError(null);
    const input: EntityInput = {
      ...request?.defaults,
      type,
      name: name.trim(),
      summary: summary.trim(),
      locationId: location?.id ?? (request?.defaults?.locationId as string | undefined) ?? null,
      visibility: visible ? "public" : "secret",
      campaignId: campaignScoped || def.key === "quest" || def.key === "mystery" ? (w.activeCampaign?.id ?? null) : ((request?.defaults?.campaignId as string | undefined) ?? null),
      ...(def.extension === "event" ? { event: { startAt: eventAt, kind: w.activeCampaign ? "campaign" : "historical", precision: "day", origin: "manual" } } : {}),
      ...(def.extension === "rumour" ? { rumour: { claim: summary.trim() || name.trim(), accuracy: 50 } } : {}),
    };
    const res = await createEntityAction(w.worldId, input);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(`Created ${res.data.name}`);
    request?.onCreated?.(res.data);
    onClose();
    if (openAfter && !request?.onCreated) router.push(`/w/${w.worldId}/e/${res.data.id}`);
    else router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Create" description="Add something to your world. You can fill in the details afterwards." size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(true);
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex items-end gap-3">
            <TypeGlyph type={type} size="lg" />
            <Field label="Type" htmlFor="qc-type" className="flex-1">
              <NativeSelect id="qc-type" value={type} onChange={(e) => setType(e.target.value)}>
                {ENTITY_GROUPS.map((g) => {
                  const ts = types.filter((t) => t.group === g.key);
                  if (!ts.length) return null;
                  return (
                    <optgroup key={g.key} label={g.label}>
                      {ts.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Name" htmlFor="qc-name">
            <Input id="qc-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={placeholderFor(type)} />
          </Field>
          <Field label="Summary" htmlFor="qc-summary" hint="One or two sentences. Shown in lists and given to the AI.">
            <Textarea id="qc-summary" value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-16" />
          </Field>
          {def.extension === "event" ? (
            <Field label="When">
              <WorldDateInput calendar={w.calendar} value={eventAt} onChange={setEventAt} />
            </Field>
          ) : (
            !["continent"].includes(type) && (
              <Field label={def.isPlace ? "Located in" : "Where"}>
                <EntityPicker value={location} onChange={setLocation} types={ENTITY_TYPES.filter((t) => t.isPlace).map((t) => t.key)} placeholder="Choose a place (optional)" allowCreate={false} />
              </Field>
            )
          )}
          <label className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium">Players know about this</span>
              <span className="block text-xs text-faint">Off keeps it secret until the players discover it.</span>
            </span>
            <Switch checked={visible} onCheckedChange={setVisible} />
          </label>
          {campaignScoped && !w.activeCampaign && <p className="text-sm text-ember">Select a campaign first: {def.plural.toLowerCase()} belong to a campaign.</p>}
          {error && (
            <p role="alert" className="text-sm text-ember">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => submit(false)} disabled={pending}>
              Create and stay here
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Create and open
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function placeholderFor(type: string) {
  const map: Record<string, string> = {
    npc: "Captain Varo",
    settlement: "Stonehaven",
    faction: "The Black Hand",
    quest: "Recover the Sun Crown",
    tavern: "The Drowned Lantern",
    shop: "Marrow & Sons, Smiths",
    world_thread: "The plague spreads north",
    event: "The Siege of Fort Greywatch",
    rumour: "The king has been poisoned",
  };
  return map[type] ?? "Name";
}
