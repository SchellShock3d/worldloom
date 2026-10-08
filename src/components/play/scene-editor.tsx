"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, ConfirmDialog } from "@/components/ui/overlays";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/common/markdown-editor";
import { EntityMultiPicker, EntityPicker, type EntityOption } from "@/components/entity/entity-picker";
import { useWorld } from "@/components/shell/world-context";
import { deleteSceneAction, saveSceneAction } from "@/server/actions/sessions";
import { PLACE_TYPES } from "@/lib/entity-types";
import { OptionalWorldDate } from "@/components/common/visibility-select";

export interface SceneDraft {
  id?: string;
  name: string;
  description: string;
  location: EntityOption | null;
  present: EntityOption[];
  threads: EntityOption[];
  quest: EntityOption | null;
  mood: string;
  lighting: string;
  weather: string;
  ambience: string;
  encounterId: string | null;
  audioProfileId: string | null;
  sessionId: string | null;
  /** In-world time the scene takes place. */
  atTime: number | null;
}

export function emptyScene(sessionId: string | null, atTime: number | null = null): SceneDraft {
  return { name: "", description: "", location: null, present: [], threads: [], quest: null, mood: "", lighting: "", weather: "", ambience: "", encounterId: null, audioProfileId: null, sessionId, atTime };
}

export function SceneEditor({
  open,
  onOpenChange,
  initial,
  campaignId,
  encounters,
  profiles,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: SceneDraft;
  campaignId: string;
  encounters: { id: string; name: string }[];
  profiles: { id: string; name: string }[];
}) {
  const w = useWorld();
  const router = useRouter();
  const [s, setS] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  React.useEffect(() => {
    if (open) setS(initial);
  }, [open, initial]);
  const set = <K extends keyof SceneDraft>(k: K, v: SceneDraft[K]) => setS((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!s.name.trim()) return toast.error("Name the scene.");
    setPending(true);
    const res = await saveSceneAction(
      w.worldId,
      campaignId,
      {
        name: s.name,
        description: s.description,
        sessionId: s.sessionId,
        locationId: s.location?.id ?? null,
        questId: s.quest?.id ?? null,
        mood: s.mood,
        lighting: s.lighting,
        weather: s.weather,
        ambience: s.ambience,
        encounterId: s.encounterId,
        audioProfileId: s.audioProfileId,
        presentIds: s.present.map((p) => p.id),
        threadIds: s.threads.map((t) => t.id),
        atTime: s.atTime,
      },
      s.id,
    );
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    onOpenChange(false);
    router.refresh();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={s.id ? "Edit scene" : "New scene"} description="The active scene is given to the AI as context." size="xl">
        <div className="grid gap-4 md:grid-cols-[1fr_18rem]">
          <div className="flex flex-col gap-4">
            <Field label="Scene" htmlFor="sc-name">
              <Input id="sc-name" value={s.name} onChange={(e) => set("name", e.target.value)} placeholder="The Drowned Lantern at dusk" autoFocus />
            </Field>
            <Field label="Read-aloud or description">
              <MarkdownEditor value={s.description} onChange={(v) => set("description", v)} minRows={6} />
            </Field>
            <Field label="Who's here">
              <EntityMultiPicker value={s.present} onChange={(v) => set("present", v)} types={["npc", "pc", "creature", "faction"]} placeholder="Add characters…" />
            </Field>
          </div>
          <div className="flex flex-col gap-4">
            <Field label="Location">
              <EntityPicker value={s.location} onChange={(v) => set("location", v)} types={PLACE_TYPES} placeholder="Where?" />
            </Field>
            <OptionalWorldDate label="Happens at a set time" value={s.atTime} onChange={(v) => set("atTime", v)} withTime />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mood" htmlFor="sc-mood">
                <Input id="sc-mood" value={s.mood} onChange={(e) => set("mood", e.target.value)} placeholder="Tense" />
              </Field>
              <Field label="Lighting" htmlFor="sc-light">
                <Input id="sc-light" value={s.lighting} onChange={(e) => set("lighting", e.target.value)} placeholder="Candlelight" />
              </Field>
            </div>
            <Field label="Weather" htmlFor="sc-weather">
              <Input id="sc-weather" value={s.weather} onChange={(e) => set("weather", e.target.value)} placeholder={w.activeCampaign ? "Same as the campaign" : ""} />
            </Field>
            <Field label="Ambience" htmlFor="sc-amb">
              <Input id="sc-amb" value={s.ambience} onChange={(e) => set("ambience", e.target.value)} placeholder="Rain on the windows, dice clatter" />
            </Field>
            <Field label="Active quest">
              <EntityPicker value={s.quest} onChange={(v) => set("quest", v)} types={["quest"]} placeholder="Optional" />
            </Field>
            <Field label="World threads in play">
              <EntityMultiPicker value={s.threads} onChange={(v) => set("threads", v)} types={["world_thread"]} placeholder="Add a thread…" />
            </Field>
            <Field label="Encounter" htmlFor="sc-enc">
              <NativeSelect id="sc-enc" value={s.encounterId ?? ""} onChange={(e) => set("encounterId", e.target.value || null)}>
                <option value="">None</option>
                {encounters.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Audio profile" htmlFor="sc-audio">
              <NativeSelect id="sc-audio" value={s.audioProfileId ?? ""} onChange={(e) => set("audioProfileId", e.target.value || null)}>
                <option value="">None</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </div>
        <DialogFooter className="justify-between">
          {s.id ? (
            <Button variant="danger-ghost" onClick={() => setDeleting(true)}>
              Delete scene
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={pending}>
              Save scene
            </Button>
          </div>
        </DialogFooter>
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title="Delete this scene?"
          onConfirm={async () => {
            if (!s.id) return;
            const res = await deleteSceneAction(w.worldId, campaignId, s.id);
            if (!res.ok) return void toast.error(res.error);
            onOpenChange(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
