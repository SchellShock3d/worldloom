"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EntityPicker, type EntityOption } from "@/components/entity/entity-picker";
import { useWorld } from "@/components/shell/world-context";
import { deleteMapAction, saveMapAction } from "@/server/actions/maps";
import { PLACE_TYPES } from "@/lib/entity-types";

interface MapRecord {
  id: string;
  name: string;
  description: string;
  parentMapId: string | null;
  imageFileId: string | null;
  scaleDistance: number | null;
  scaleUnit: string;
  width: number | null;
  height: number | null;
}

export function MapSettingsButton({ map, place, maps }: { map: MapRecord; place: EntityOption | null; maps: { id: string; name: string }[] }) {
  const w = useWorld();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [d, setD] = React.useState(map);
  const [depicts, setDepicts] = React.useState(place);
  const [preview, setPreview] = React.useState<string | null>(map.imageFileId ? `/api/files/${map.imageFileId}` : null);
  const [uploading, setUploading] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setD(map);
      setDepicts(place);
      setPreview(map.imageFileId ? `/api/files/${map.imageFileId}` : null);
    }
  }, [open, map, place]);

  const upload = async (f: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("kind", "map");
    const res = await fetch(`/api/w/${w.worldId}/upload`, { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) return toast.error(data.error ?? "Upload failed");
    setD((x) => ({ ...x, imageFileId: data.id, width: data.width, height: data.height }));
    setPreview(data.url);
  };

  const save = async () => {
    if (!d.name.trim()) return toast.error("Name the map.");
    setPending(true);
    const res = await saveMapAction(
      w.worldId,
      { name: d.name, description: d.description, imageFileId: d.imageFileId, parentMapId: d.parentMapId, entityId: depicts?.id ?? null, width: d.width, height: d.height, scaleDistance: d.scaleDistance, scaleUnit: d.scaleUnit },
      map.id,
    );
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Map saved");
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Settings2 /> Map settings
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Map settings" size="md">
          <div className="flex flex-col gap-4">
            <label className="relative flex aspect-[16/9] cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-line-strong bg-surface-2 hover:border-accent">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="size-full object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-sm text-muted">
                  <ImagePlus className="size-6" />
                  {uploading ? "Uploading…" : "Choose a map image"}
                </span>
              )}
              {preview && <span className="absolute bottom-2 right-2 rounded bg-surface/90 px-2 py-0.5 text-xs text-muted">{uploading ? "Uploading…" : "Replace image"}</span>}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            <p className="-mt-2 text-xs text-faint">Markers and regions are stored relative to the image, so they stay in place when you swap in a redrawn version.</p>
            <Field label="Name" htmlFor="ms-name">
              <Input id="ms-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
            </Field>
            <Field label="Description" htmlFor="ms-desc">
              <Textarea id="ms-desc" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className="min-h-16" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Inside map" htmlFor="ms-parent">
                <NativeSelect id="ms-parent" value={d.parentMapId ?? ""} onChange={(e) => setD({ ...d, parentMapId: e.target.value || null })}>
                  <option value="">None (top level)</option>
                  {maps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Depicts">
                <EntityPicker value={depicts} onChange={setDepicts} types={PLACE_TYPES} placeholder="Optional place" allowCreate={false} />
              </Field>
            </div>
            <Field label="Scale" hint="The distance across the full width of the map. Used for travel estimates.">
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  value={d.scaleDistance ?? ""}
                  onChange={(e) => setD({ ...d, scaleDistance: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="e.g. 400"
                  aria-label="Width distance"
                />
                <NativeSelect value={d.scaleUnit} onChange={(e) => setD({ ...d, scaleUnit: e.target.value })} aria-label="Unit" className="w-32">
                  <option value="miles">miles</option>
                  <option value="km">km</option>
                  <option value="leagues">leagues</option>
                  <option value="feet">feet</option>
                </NativeSelect>
              </div>
            </Field>
          </div>
          <DialogFooter className="justify-between">
            <Button variant="danger-ghost" onClick={() => setConfirm(true)}>
              Delete map
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} loading={pending} disabled={uploading}>
                Save map
              </Button>
            </div>
          </DialogFooter>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title={`Delete "${map.name}"?`}
            description="Its markers and regions are deleted too. Nested maps move to the top level. The entities they point to are not affected."
            confirmLabel="Delete map"
            onConfirm={async () => {
              const res = await deleteMapAction(w.worldId, map.id);
              if (!res.ok) return void toast.error(res.error);
              router.push(`/w/${w.worldId}/maps`);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
