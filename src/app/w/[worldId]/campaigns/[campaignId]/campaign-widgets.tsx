"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CloudSun, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/primitives";
import { EntityPicker, type EntityOption } from "@/components/entity/entity-picker";
import { WorldDateInput } from "@/components/common/world-date-input";
import { useWorld } from "@/components/shell/world-context";
import { deleteCampaignAction, updateCampaignAction } from "@/server/actions/campaigns";
import { setCampaignTimeAction } from "@/server/actions/play";
import { rollWeatherAction } from "@/server/actions/tools";
import { PLACE_TYPES } from "@/lib/entity-types";

/** A textarea that saves itself after you stop typing. */
export function AutosaveText({
  value,
  onSave,
  placeholder,
  className,
  rows = 6,
  label,
}: {
  value: string;
  onSave: (v: string) => Promise<unknown>;
  placeholder?: string;
  className?: string;
  rows?: number;
  label: string;
}) {
  const [text, setText] = React.useState(value);
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = React.useRef(value);
  React.useEffect(() => {
    if (value !== latest.current) {
      setText(value);
      latest.current = value;
    }
  }, [value]);
  const schedule = (v: string) => {
    setText(v);
    setState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState("saving");
      latest.current = v;
      await onSave(v);
      setState("saved");
    }, 700);
  };
  return (
    <div className="relative">
      <Textarea aria-label={label} value={text} onChange={(e) => schedule(e.target.value)} placeholder={placeholder} rows={rows} className={className} />
      <span className="pointer-events-none absolute bottom-1.5 right-2 text-2xs text-faint" aria-live="polite">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}
      </span>
    </div>
  );
}

export function CampaignNotes({ campaignId, field, value, label, placeholder, rows }: { campaignId: string; field: "dmNotes" | "partyInventory" | "partyNotes"; value: string; label: string; placeholder?: string; rows?: number }) {
  const w = useWorld();
  return (
    <AutosaveText
      label={label}
      value={value}
      rows={rows}
      placeholder={placeholder}
      className="font-sans text-sm"
      onSave={async (v) => {
        const res = await updateCampaignAction(w.worldId, campaignId, { [field]: v });
        if (!res.ok) toast.error(res.error);
      }}
    />
  );
}

export function WeatherControl({ campaignId, weather, locked }: { campaignId: string; weather: string; locked: boolean }) {
  const w = useWorld();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [text, setText] = React.useState(weather);
  React.useEffect(() => setText(weather), [weather]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <CloudSun className="size-4 shrink-0 text-brass" />
        <Input
          aria-label="Current weather"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={async () => {
            if (text === weather) return;
            const res = await updateCampaignAction(w.worldId, campaignId, { currentWeather: text, weatherLocked: true });
            if (!res.ok) toast.error(res.error);
            else router.refresh();
          }}
          placeholder="Not set"
          className="h-7 text-sm"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          loading={busy}
          aria-label="Roll weather for the season and climate"
          title="Roll weather from the season and local climate"
          onClick={async () => {
            setBusy(true);
            const res = await rollWeatherAction(w.worldId, campaignId);
            setBusy(false);
            if (!res.ok) return toast.error(res.error);
            router.refresh();
          }}
        >
          {!busy && <RefreshCw />}
        </Button>
      </div>
      <label className="flex items-center gap-2 text-xs text-faint">
        <Switch
          checked={locked}
          onCheckedChange={async (c) => {
            await updateCampaignAction(w.worldId, campaignId, { weatherLocked: c });
            router.refresh();
          }}
        />
        Keep this weather when time advances
      </label>
    </div>
  );
}

export function EditCampaignButton({
  campaign,
}: {
  campaign: { id: string; name: string; premise: string; partyName: string; status: string; currentAt: number; currentLocation: EntityOption | null };
}) {
  const w = useWorld();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(campaign);
  const [pending, setPending] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  React.useEffect(() => {
    if (open) setV(campaign);
  }, [open, campaign]);
  return (
    <>
      <Button variant="ghost" size="md" onClick={() => setOpen(true)}>
        <Pencil /> Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Campaign settings" size="lg">
          <div className="flex flex-col gap-4">
            <Field label="Name" htmlFor="ec-name">
              <Input id="ec-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <Field label="Premise" htmlFor="ec-premise">
              <Textarea id="ec-premise" value={v.premise} onChange={(e) => setV({ ...v, premise: e.target.value })} className="min-h-20" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Party name" htmlFor="ec-party">
                <Input id="ec-party" value={v.partyName} onChange={(e) => setV({ ...v, partyName: e.target.value })} />
              </Field>
              <Field label="Status" htmlFor="ec-status">
                <NativeSelect id="ec-status" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </NativeSelect>
              </Field>
            </div>
            <Field label="Party's current location">
              <EntityPicker value={v.currentLocation} onChange={(o) => setV({ ...v, currentLocation: o })} types={PLACE_TYPES} placeholder="Where is the party?" />
            </Field>
            <Field label="In-world date" hint="Correct the clock directly. To simulate time passing, use Advance time instead.">
              <WorldDateInput calendar={w.calendar} value={v.currentAt} onChange={(n) => setV({ ...v, currentAt: n })} withTime />
            </Field>
          </div>
          <DialogFooter className="justify-between">
            <Button variant="danger-ghost" onClick={() => setDeleting(true)}>
              <Trash2 /> Delete campaign
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={pending}
                onClick={async () => {
                  setPending(true);
                  const res = await updateCampaignAction(w.worldId, campaign.id, {
                    name: v.name,
                    premise: v.premise,
                    partyName: v.partyName,
                    status: v.status as "active",
                    currentLocationId: v.currentLocation?.id ?? null,
                  });
                  if (res.ok && v.currentAt !== campaign.currentAt) await setCampaignTimeAction(w.worldId, campaign.id, v.currentAt);
                  setPending(false);
                  if (!res.ok) return toast.error(res.error);
                  toast.success("Campaign updated");
                  setOpen(false);
                  router.refresh();
                }}
              >
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${campaign.name}?`}
        description="Its sessions, scenes, player characters, quests and campaign-only records are deleted. World canon is not affected. This can't be undone."
        confirmLabel="Delete campaign"
        onConfirm={async () => {
          const res = await deleteCampaignAction(w.worldId, campaign.id);
          if (!res.ok) return void toast.error(res.error);
          router.push(`/w/${w.worldId}`);
          router.refresh();
        }}
      />
    </>
  );
}
