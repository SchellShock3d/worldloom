"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AudioLines, Music, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect, Textarea, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/primitives";
import { AiWorking } from "@/components/ai/ai-working";
import { useWorld } from "@/components/shell/world-context";
import { composeMusicAction } from "@/server/actions/music";
import { cn } from "@/lib/utils";

type Kind = "music" | "ambience";

export function MusicSetupNote({ compact = false }: { compact?: boolean }) {
  if (compact)
    return (
      <p className="text-sm text-muted">
        Scene music needs a Google Gemini API key. See the <span className="font-medium">Music &amp; ambience</span> page to set it up.
      </p>
    );
  return (
    <div className="text-sm text-muted">
      <p className="font-medium text-fg">Turn on music generation</p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-5">
        <li>
          Create a Gemini API key at{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-accent underline-offset-4 hover:underline">
            aistudio.google.com/apikey
          </a>
          . Lyria needs billing turned on for the key&apos;s Google project.
        </li>
        <li>
          Add a line to <code className="rounded bg-surface-3 px-1">.env.local</code> in your worldloom folder: <code className="rounded bg-surface-3 px-1">GEMINI_API_KEY=your-key</code>
        </li>
        <li>
          Stop Worldloom (Ctrl+C) and run <code className="rounded bg-surface-3 px-1">npm start</code> again. <code className="rounded bg-surface-3 px-1">npm run check-ai</code> tests the key.
        </li>
      </ol>
    </div>
  );
}

/**
 * Compose music and/or ambience for a scene (or a described moment) with Google Lyria.
 * Claude writes the brief from the scene; the tracks land in the library and on the scene.
 */
export function ComposeMusic({
  configured,
  scenes,
  sceneId: fixedScene,
  sceneName,
  compact = false,
  onComposed,
}: {
  configured: boolean;
  /** Scenes to choose from (Music page). */
  scenes?: { id: string; label: string }[];
  /** A fixed scene (Run Session). */
  sceneId?: string | null;
  sceneName?: string;
  compact?: boolean;
  onComposed?: (r: { profileId: string | null }) => void;
}) {
  const w = useWorld();
  const router = useRouter();
  const [sceneId, setSceneId] = React.useState<string>(fixedScene ?? "");
  const [description, setDescription] = React.useState("");
  const [kinds, setKinds] = React.useState<Kind[]>(["music", "ambience"]);
  const [length, setLength] = React.useState<"loop" | "long">("loop");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const scene = fixedScene ?? (sceneId || null);

  if (!configured) return <MusicSetupNote compact={compact} />;

  const toggle = (k: Kind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  async function compose() {
    if (!kinds.length) return toast.error("Choose music, ambience, or both.");
    if (!scene && !description.trim()) return toast.error("Pick a scene or describe the moment.");
    setBusy(true);
    const res = await composeMusicAction(w.worldId, { sceneId: scene, description: scene ? undefined : description, kinds, length, note: note.trim() || undefined });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    const made = res.data.tracks.map((t) => t.name).join(" and ");
    toast.success(`Added ${made}`, { description: res.data.failed.length ? `The ${res.data.failed[0]!.kind} didn't work: ${res.data.failed[0]!.error}` : scene ? "Saved to your library and attached to the scene." : "Saved to your library." });
    setNote("");
    onComposed?.({ profileId: res.data.profileId });
    router.refresh();
  }

  const kindButtons = (
    <div className="flex gap-1.5" role="group" aria-label="What to compose">
      {(["music", "ambience"] as Kind[]).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={kinds.includes(k)}
          onClick={() => toggle(k)}
          className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm", kinds.includes(k) ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg")}
        >
          {k === "music" ? <Music className="size-3.5" /> : <Waves className="size-3.5" />}
          {k === "music" ? "Music" : "Ambience"}
        </button>
      ))}
    </div>
  );
  const lengthPicker = (
    <Segmented
      size="sm"
      value={length}
      onChange={setLength}
      options={[
        { value: "loop", label: "30-second loop" },
        { value: "long", label: "90-second music" },
      ]}
    />
  );

  if (compact)
    return (
      <div className="flex flex-col gap-2 rounded-md border border-line px-3 py-2.5">
        <p className="text-sm">
          <span className="font-medium">Score {sceneName ? `“${sceneName}”` : "this scene"}</span>
          <span className="text-faint"> with Lyria</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {kindButtons}
          {lengthPicker}
        </div>
        <div className="flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: more tension, a lone cello…" aria-label="Note for the composer" className="h-8 text-sm" />
          <Button size="sm" variant="arcane" onClick={compose} loading={busy}>
            <AudioLines /> Compose
          </Button>
        </div>
        <AiWorking active={busy} live what="Lyria is composing" typical="20–60 seconds" />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <Field label="For which scene?" htmlFor="cm-scene">
        <NativeSelect id="cm-scene" value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
          <option value="">No scene: I&apos;ll describe it</option>
          {scenes?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {!sceneId && (
        <Field label="Describe the moment" htmlFor="cm-desc">
          <Textarea id="cm-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" placeholder="A smugglers' tavern at midnight, a storm outside, everyone on edge" />
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {kindButtons}
        {lengthPicker}
      </div>
      <Field label="Anything specific? (optional)" htmlFor="cm-note">
        <Input id="cm-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Slower, a lone cello, distant bells…" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="arcane" onClick={compose} loading={busy}>
          <AudioLines /> Compose
        </Button>
        <span className="text-xs text-faint">{w.aiProvider.live ? "Claude writes the brief from the scene; Lyria makes the audio." : "Lyria makes the audio from a brief built from the scene."}</span>
      </div>
      <AiWorking active={busy} live what="Lyria is composing" typical="20–60 seconds" />
      {sceneId && (
        <p className="text-xs text-faint">
          The tracks are attached to the scene as its audio profile, so they&apos;re ready in{" "}
          <Link href={`/w/${w.worldId}/campaigns`} className="underline-offset-4 hover:underline">
            Run Session
          </Link>
          .
        </p>
      )}
    </div>
  );
}
