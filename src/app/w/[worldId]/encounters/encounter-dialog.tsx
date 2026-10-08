"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/primitives";
import { EntityPicker, type EntityOption } from "@/components/entity/entity-picker";
import { useWorld } from "@/components/shell/world-context";
import { saveEncounterAction } from "@/server/actions/tools";
import { PLACE_TYPES } from "@/lib/entity-types";

export interface EncounterDraft {
  id?: string;
  name: string;
  description: string;
  rewards: string;
  notes: string;
  location: EntityOption | null;
  quest: EntityOption | null;
  campaignId: string | null;
}

export function EncounterDialogButton({ defaultOpen = false, campaign, initial }: { defaultOpen?: boolean; campaign: { id: string; name: string } | null; initial?: EncounterDraft }) {
  const w = useWorld();
  const router = useRouter();
  const blank: EncounterDraft = { name: "", description: "", rewards: "", notes: "", location: null, quest: null, campaignId: campaign?.id ?? null };
  const [open, setOpen] = React.useState(defaultOpen);
  const [d, setD] = React.useState<EncounterDraft>(initial ?? blank);
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => {
    if (open) setD(initial ?? { ...blank });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    if (!d.name.trim()) return toast.error("Name the encounter.");
    setPending(true);
    const res = await saveEncounterAction(
      w.worldId,
      { name: d.name, description: d.description, rewards: d.rewards, notes: d.notes, locationId: d.location?.id ?? null, questId: d.quest?.id ?? null, campaignId: d.campaignId },
      d.id,
    );
    setPending(false);
    if (!res.ok) return void toast.error(res.error);
    setOpen(false);
    if (d.id) router.refresh();
    else router.push(`/w/${w.worldId}/encounters/${res.data.id}`);
  };

  return (
    <>
      {initial ? (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          <Pencil /> Edit details
        </Button>
      ) : (
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus /> New encounter
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={d.id ? "Edit encounter" : "New encounter"} size="md">
          <div className="flex flex-col gap-4">
            <Field label="Name" htmlFor="enc-name">
              <Input id="enc-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Ambush at the ford" autoFocus />
            </Field>
            <Field label="Set-up" htmlFor="enc-desc" hint="Terrain, tactics, what the enemies want.">
              <Textarea id="enc-desc" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className="min-h-24" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Where">
                <EntityPicker value={d.location} onChange={(v) => setD({ ...d, location: v })} types={PLACE_TYPES} placeholder="Optional" allowCreate={false} />
              </Field>
              <Field label="Part of quest">
                <EntityPicker value={d.quest} onChange={(v) => setD({ ...d, quest: v })} types={["quest"]} placeholder="Optional" allowCreate={false} />
              </Field>
            </div>
            <Field label="Rewards" htmlFor="enc-rew">
              <Input id="enc-rew" value={d.rewards} onChange={(e) => setD({ ...d, rewards: e.target.value })} placeholder="Treasure, XP, information" />
            </Field>
            <Field label="Private notes" htmlFor="enc-notes">
              <Textarea id="enc-notes" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} className="min-h-16" />
            </Field>
            {campaign && (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Only for {campaign.name}
                  <span className="block text-xs text-faint">Off: usable in any campaign in this world.</span>
                </span>
                <Switch checked={d.campaignId === campaign.id} onCheckedChange={(c) => setD({ ...d, campaignId: c ? campaign.id : null })} />
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={pending}>
              {d.id ? "Save" : "Create and add combatants"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
