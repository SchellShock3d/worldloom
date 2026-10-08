"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { EntityPicker, type EntityOption } from "@/components/entity/entity-picker";
import { useWorld } from "@/components/shell/world-context";
import { saveMapAction } from "@/server/actions/maps";
import { PLACE_TYPES } from "@/lib/entity-types";

export function NewMapButton({ maps, parentMapId, label = "Upload a map", variant = "primary" }: { maps: { id: string; name: string }[]; parentMapId?: string; label?: string; variant?: "primary" | "secondary" | "ghost" }) {
  const w = useWorld();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [parent, setParent] = React.useState(parentMapId ?? "");
  const [place, setPlace] = React.useState<EntityOption | null>(null);
  const [file, setFile] = React.useState<{ id: string; width: number | null; height: number | null; url: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const upload = async (f: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("kind", "map");
    const res = await fetch(`/api/w/${w.worldId}/upload`, { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) return toast.error(data.error ?? "Upload failed");
    setFile({ id: data.id, width: data.width, height: data.height, url: data.url });
    if (!name) setName(f.name.replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " "));
  };
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New map" size="md">
          <div className="flex flex-col gap-4">
            <label className="flex aspect-[16/9] cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-line-strong bg-surface-2 hover:border-accent">
              {file ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.url} alt="" className="size-full object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-sm text-muted">
                  <ImagePlus className="size-6" />
                  {uploading ? "Uploading…" : "Choose a map image (PNG, JPEG, WebP, up to 25 MB)"}
                </span>
              )}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            <Field label="Name" htmlFor="map-name">
              <Input id="map-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="The Northern Marches" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Inside map" htmlFor="map-parent" hint="For nested maps: city inside region, etc.">
                <NativeSelect id="map-parent" value={parent} onChange={(e) => setParent(e.target.value)}>
                  <option value="">None (top level)</option>
                  {maps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Depicts">
                <EntityPicker value={place} onChange={setPlace} types={PLACE_TYPES} placeholder="Optional place" allowCreate={false} />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={uploading}
              onClick={async () => {
                if (!name.trim()) return toast.error("Name the map.");
                setPending(true);
                const res = await saveMapAction(w.worldId, { name, imageFileId: file?.id ?? null, parentMapId: parent || null, entityId: place?.id ?? null, width: file?.width ?? null, height: file?.height ?? null });
                setPending(false);
                if (!res.ok) return toast.error(res.error);
                setOpen(false);
                router.push(`/w/${w.worldId}/maps/${res.data.id}`);
              }}
            >
              Create map
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
