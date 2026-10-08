"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Music, Pencil, Plus, Trash2, Upload, Waves, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/display";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Segmented, Switch } from "@/components/ui/primitives";
import { useWorld } from "@/components/shell/world-context";
import { deleteAudioProfileAction, deleteTrackAction, saveAudioProfileAction, saveTrackAction } from "@/server/actions/tools";

interface Track {
  id: string;
  name: string;
  kind: "music" | "ambience" | "sfx";
  tags: string[];
  loop: boolean;
  volume: number;
  fileId: string | null;
  url: string | null;
}
interface Profile {
  id: string;
  name: string;
  musicTrackId: string | null;
  ambienceTrackId: string | null;
  tags: string[];
}

const KIND = {
  music: { label: "Music", icon: Music },
  ambience: { label: "Ambience", icon: Waves },
  sfx: { label: "Sound effects", icon: Zap },
} as const;

export function MusicLibrary({ tracks, profiles, canEdit }: { tracks: Track[]; profiles: Profile[]; canEdit: boolean }) {
  const [editing, setEditing] = React.useState<Track | "new" | null>(null);
  const [editingProfile, setEditingProfile] = React.useState<Profile | "new" | null>(null);
  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-md font-semibold">
            Tracks <span className="font-normal text-faint">{tracks.length}</span>
          </h2>
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={() => setEditing("new")}>
              <Plus /> Add track
            </Button>
          )}
        </div>
        {tracks.length === 0 ? (
          <EmptyState icon={<Music />} title="No tracks yet" action={canEdit ? <Button onClick={() => setEditing("new")}>Add a track</Button> : undefined}>
            Upload MP3, OGG, WAV or M4A files up to 25 MB, or link to an https audio file. Only use audio you have the rights to play.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-5">
            {(Object.keys(KIND) as Track["kind"][]).map((k) => {
              const list = tracks.filter((t) => t.kind === k);
              if (!list.length) return null;
              const K = KIND[k];
              return (
                <div key={k}>
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-sm text-muted">
                    <K.icon className="size-3.5" /> {K.label}
                  </h3>
                  <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                    {list.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{t.name}</p>
                          <p className="flex flex-wrap gap-x-2 text-xs text-faint">
                            <span>{t.fileId ? "Uploaded file" : "Linked"}</span>
                            {t.loop && <span>loops</span>}
                            {t.tags.length > 0 && <span>{t.tags.join(", ")}</span>}
                          </p>
                        </div>
                        {canEdit && (
                          <Button variant="ghost" size="icon-sm" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>
                            <Pencil />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-md font-semibold">
              Profiles <span className="font-normal text-faint">{profiles.length}</span>
            </h2>
            <p className="text-sm text-muted">A mood for a scene: one music track plus one ambience loop, started together.</p>
          </div>
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={() => setEditingProfile("new")} disabled={!tracks.length}>
              <Plus /> New profile
            </Button>
          )}
        </div>
        {profiles.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {profiles.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-2 rounded-lg border border-line bg-surface p-3">
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted">
                    {[tracks.find((t) => t.id === p.musicTrackId)?.name, tracks.find((t) => t.id === p.ambienceTrackId)?.name].filter(Boolean).join(" + ") || "No tracks"}
                  </p>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditingProfile(p)} aria-label={`Edit ${p.name}`}>
                    <Pencil />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && <TrackDialog track={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {editingProfile && <ProfileDialog profile={editingProfile === "new" ? null : editingProfile} tracks={tracks} onClose={() => setEditingProfile(null)} />}
    </div>
  );
}

function TrackDialog({ track, onClose }: { track: Track | null; onClose: () => void }) {
  const w = useWorld();
  const router = useRouter();
  const [source, setSource] = React.useState<"file" | "url">(track?.url ? "url" : "file");
  const [name, setName] = React.useState(track?.name ?? "");
  const [kind, setKind] = React.useState<Track["kind"]>(track?.kind ?? "music");
  const [fileId, setFileId] = React.useState<string | null>(track?.fileId ?? null);
  const [fileName, setFileName] = React.useState<string | null>(track?.fileId ? "Current file" : null);
  const [url, setUrl] = React.useState(track?.url ?? "");
  const [tags, setTags] = React.useState(track?.tags.join(", ") ?? "");
  const [loop, setLoop] = React.useState(track?.loop ?? true);
  const [uploading, setUploading] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);

  const upload = async (f: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch(`/api/w/${w.worldId}/upload`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) return toast.error(data.error ?? "Upload failed");
    if (!String(data.mimeType ?? "").startsWith("audio/")) return toast.error("That isn't an audio file.");
    setFileId(data.id);
    setFileName(f.name);
    if (!name) setName(f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
  };
  const save = async () => {
    setPending(true);
    const res = await saveTrackAction(
      w.worldId,
      {
        name,
        kind,
        fileId: source === "file" ? fileId : null,
        url: source === "url" ? url.trim() || null : null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        loop: kind === "sfx" ? false : loop,
      },
      track?.id,
    );
    setPending(false);
    if (!res.ok) return void toast.error(res.error);
    onClose();
    router.refresh();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={track ? "Edit track" : "Add a track"} size="md">
        <div className="flex flex-col gap-4">
          <Segmented
            value={source}
            onChange={setSource}
            options={[
              { value: "file", label: "Upload a file" },
              { value: "url", label: "Link to a file" },
            ]}
          />
          {source === "file" ? (
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface-2 px-4 py-4 hover:border-accent">
              <Upload className="size-5 text-faint" />
              <span className="text-sm">{uploading ? "Uploading…" : (fileName ?? "Choose an audio file (MP3, OGG, WAV, M4A, FLAC; up to 25 MB)")}</span>
              <input type="file" accept="audio/*" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          ) : (
            <Field label="Audio URL" htmlFor="tr-url" hint="A direct https link to an audio file you're allowed to use.">
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <Input id="tr-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/tavern-loop.ogg" className="pl-8" />
              </div>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <Field label="Name" htmlFor="tr-name">
              <Input id="tr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rainy tavern" />
            </Field>
            <Field label="Kind" htmlFor="tr-kind">
              <NativeSelect id="tr-kind" value={kind} onChange={(e) => setKind(e.target.value as Track["kind"])}>
                <option value="music">Music</option>
                <option value="ambience">Ambience</option>
                <option value="sfx">Sound effect</option>
              </NativeSelect>
            </Field>
          </div>
          <Field label="Tags" htmlFor="tr-tags" hint="Comma-separated: combat, tavern, forest, tense…">
            <Input id="tr-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          {kind !== "sfx" && (
            <label className="flex items-center justify-between text-sm">
              Loop when it ends
              <Switch checked={loop} onCheckedChange={setLoop} />
            </label>
          )}
        </div>
        <DialogFooter className="justify-between">
          {track ? (
            <Button variant="danger-ghost" onClick={() => setConfirm(true)}>
              <Trash2 /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={pending} disabled={uploading}>
              Save track
            </Button>
          </div>
        </DialogFooter>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={`Delete "${track?.name}"?`}
          description="Profiles using it will lose this track."
          confirmLabel="Delete track"
          onConfirm={async () => {
            if (!track) return;
            const res = await deleteTrackAction(w.worldId, track.id);
            if (!res.ok) return void toast.error(res.error);
            onClose();
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ProfileDialog({ profile, tracks, onClose }: { profile: Profile | null; tracks: Track[]; onClose: () => void }) {
  const w = useWorld();
  const router = useRouter();
  const [name, setName] = React.useState(profile?.name ?? "");
  const [music, setMusic] = React.useState(profile?.musicTrackId ?? "");
  const [ambience, setAmbience] = React.useState(profile?.ambienceTrackId ?? "");
  const [pending, setPending] = React.useState(false);
  const save = async () => {
    setPending(true);
    const res = await saveAudioProfileAction(w.worldId, { name, musicTrackId: music || null, ambienceTrackId: ambience || null, tags: profile?.tags ?? [] }, profile?.id);
    setPending(false);
    if (!res.ok) return void toast.error(res.error);
    onClose();
    router.refresh();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={profile ? "Edit profile" : "New audio profile"} size="sm">
        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="pr-name">
            <Input id="pr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tense negotiation" autoFocus />
          </Field>
          <Field label="Music" htmlFor="pr-music">
            <NativeSelect id="pr-music" value={music} onChange={(e) => setMusic(e.target.value)}>
              <option value="">None</option>
              {tracks
                .filter((t) => t.kind === "music")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Ambience" htmlFor="pr-amb">
            <NativeSelect id="pr-amb" value={ambience} onChange={(e) => setAmbience(e.target.value)}>
              <option value="">None</option>
              {tracks
                .filter((t) => t.kind === "ambience")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
        </div>
        <DialogFooter className="justify-between">
          {profile ? (
            <Button
              variant="danger-ghost"
              onClick={async () => {
                const res = await deleteAudioProfileAction(w.worldId, profile.id);
                if (!res.ok) return void toast.error(res.error);
                onClose();
                router.refresh();
              }}
            >
              <Trash2 /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={pending}>
              Save profile
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
