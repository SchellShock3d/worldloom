"use client";

import * as React from "react";
import { Music, Pause, Play, Repeat, Square, Volume2, VolumeX, Waves, Zap } from "lucide-react";
import { Slider } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/button";
import { startVoice, type Voice } from "./loop-audio";
import { cn } from "@/lib/utils";

export interface TrackView {
  id: string;
  name: string;
  kind: "music" | "ambience" | "sfx";
  src: string;
  tags: string[];
  loop: boolean;
  volume: number;
}

export interface ProfileView {
  id: string;
  name: string;
  musicTrackId: string | null;
  ambienceTrackId: string | null;
}

type Channel = "music" | "ambience";

/**
 * Two looping channels (music + ambience) with crossfades between tracks, plus one-shot sound
 * effects. Looping tracks loop seamlessly (see loop-audio.ts).
 */
export function MusicPlayer({
  tracks,
  profiles,
  compact = false,
  initialProfileId,
  autoPlayProfileId,
}: {
  tracks: TrackView[];
  profiles: ProfileView[];
  compact?: boolean;
  initialProfileId?: string | null;
  /** When this changes to a profile in the list, start playing it (e.g. right after composing it). */
  autoPlayProfileId?: string | null;
}) {
  const audio = React.useRef<Record<Channel, Voice | null>>({ music: null, ambience: null });
  const tokens = React.useRef<Record<Channel, number>>({ music: 0, ambience: 0 });
  const [playing, setPlaying] = React.useState<Record<Channel, string | null>>({ music: null, ambience: null });
  const [paused, setPaused] = React.useState<Record<Channel, boolean>>({ music: false, ambience: false });
  const [loading, setLoading] = React.useState<Record<Channel, boolean>>({ music: false, ambience: false });
  const [volume, setVolume] = React.useState<Record<Channel | "sfx", number>>({ music: 0.7, ambience: 0.5, sfx: 0.8 });
  const [muted, setMuted] = React.useState(false);
  const [tag, setTag] = React.useState<string | null>(null);
  const tags = Array.from(new Set(tracks.flatMap((t) => t.tags))).sort();
  const level = (ch: Channel, t: TrackView) => (muted ? 0 : volume[ch] * t.volume);

  const play = async (channel: Channel, track: TrackView | null) => {
    const token = ++tokens.current[channel];
    audio.current[channel]?.stop(0.6);
    audio.current[channel] = null;
    if (!track) {
      setPlaying((p) => ({ ...p, [channel]: null }));
      return;
    }
    setPlaying((p) => ({ ...p, [channel]: track.id }));
    setPaused((p) => ({ ...p, [channel]: false }));
    setLoading((l) => ({ ...l, [channel]: true }));
    try {
      const voice = await startVoice(track.src, track.loop);
      if (token !== tokens.current[channel]) return voice.stop(0); // superseded while loading
      audio.current[channel] = voice;
      voice.setVolume(level(channel, track), 0.8);
    } catch {
      if (token === tokens.current[channel]) setPlaying((p) => ({ ...p, [channel]: null }));
    } finally {
      if (token === tokens.current[channel]) setLoading((l) => ({ ...l, [channel]: false }));
    }
  };

  const sfx = (track: TrackView) => {
    const el = new Audio(track.src);
    el.volume = muted ? 0 : volume.sfx * track.volume;
    el.play().catch(() => undefined);
  };

  React.useEffect(() => {
    for (const ch of ["music", "ambience"] as Channel[]) {
      const v = audio.current[ch];
      const t = tracks.find((x) => x.id === playing[ch]);
      if (v && t) v.setVolume(level(ch, t));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, muted, playing, tracks]);

  React.useEffect(() => {
    const ref = audio.current;
    return () => {
      ref.music?.stop(0.2);
      ref.ambience?.stop(0.2);
    };
  }, []);

  const appliedInitial = React.useRef<string | null>(null);
  React.useEffect(() => {
    // Scene audio profiles are suggested, not auto-played (browsers block autoplay anyway).
    appliedInitial.current = initialProfileId ?? null;
  }, [initialProfileId]);

  const applyProfile = (p: ProfileView) => {
    play("music", tracks.find((t) => t.id === p.musicTrackId) ?? null);
    play("ambience", tracks.find((t) => t.id === p.ambienceTrackId) ?? null);
  };

  const autoPlayed = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!autoPlayProfileId || autoPlayed.current === autoPlayProfileId) return;
    const p = profiles.find((x) => x.id === autoPlayProfileId);
    if (!p) return; // wait for the refreshed list
    autoPlayed.current = autoPlayProfileId;
    applyProfile(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayProfileId, profiles, tracks]);

  const filtered = tracks.filter((t) => !tag || t.tags.includes(tag));
  const nowMusic = tracks.find((t) => t.id === playing.music);
  const nowAmb = tracks.find((t) => t.id === playing.ambience);

  if (!tracks.length)
    return <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-sm text-faint">No tracks yet. Upload music, ambience and sound effects on the Music page.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2">
        {(["music", "ambience"] as Channel[]).map((ch) => {
          const now = ch === "music" ? nowMusic : nowAmb;
          return (
            <div key={ch} className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-2">
              {ch === "music" ? <Music className="size-4 shrink-0 text-arcane" /> : <Waves className="size-4 shrink-0 text-places" />}
              <span className="min-w-0 flex-1 truncate text-sm">{now ? now.name : <span className="text-faint">{ch === "music" ? "No music" : "No ambience"}</span>}</span>
              {now && (
                <>
                  {loading[ch] && <Spinner className="size-3.5 text-faint" />}
                  <button
                    onClick={() => {
                      const v = audio.current[ch];
                      if (!v) return;
                      if (v.paused) v.resume();
                      else v.pause();
                      setPaused((p) => ({ ...p, [ch]: v.paused }));
                    }}
                    className="rounded p-1 text-muted hover:text-fg"
                    aria-label={paused[ch] ? "Resume" : "Pause"}
                  >
                    {paused[ch] ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                  </button>
                  <button onClick={() => play(ch, null)} className="rounded p-1 text-muted hover:text-fg" aria-label="Stop">
                    <Square className="size-3.5" />
                  </button>
                </>
              )}
              <Slider className="w-20" value={[volume[ch]]} min={0} max={1} step={0.05} onValueChange={([v]) => setVolume((s) => ({ ...s, [ch]: v ?? 0 }))} aria-label={`${ch} volume`} />
            </div>
          );
        })}
        <div className="flex items-center gap-2 px-1">
          <button onClick={() => setMuted((m) => !m)} className="rounded p-1 text-muted hover:text-fg" aria-label={muted ? "Unmute" : "Mute all"}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <span className="text-xs text-faint">Effects</span>
          <Slider className="w-24" value={[volume.sfx]} min={0} max={1} step={0.05} onValueChange={([v]) => setVolume((s) => ({ ...s, sfx: v ?? 0 }))} aria-label="Effects volume" />
        </div>
      </div>
      {profiles.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-faint">Profiles</p>
          <div className="flex flex-wrap gap-1.5">
            {profiles.map((p) => (
              <button key={p.id} onClick={() => applyProfile(p)} className={cn("rounded-full border px-2.5 py-1 text-xs hover:border-line-strong", p.id === initialProfileId ? "border-accent text-accent" : "border-line")}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {tags.length > 0 && !compact && (
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setTag(null)} className={cn("rounded px-2 py-0.5 text-xs", !tag ? "bg-surface-3 text-fg" : "text-muted")}>
            all
          </button>
          {tags.map((t) => (
            <button key={t} onClick={() => setTag(tag === t ? null : t)} className={cn("rounded px-2 py-0.5 text-xs", tag === t ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>
              {t}
            </button>
          ))}
        </div>
      )}
      <ul className={cn("grid gap-1", compact ? "max-h-56 overflow-y-auto" : "sm:grid-cols-2")}>
        {filtered.map((t) => {
          const isOn = playing.music === t.id || playing.ambience === t.id;
          return (
            <li key={t.id}>
              <button
                onClick={() => (t.kind === "sfx" ? sfx(t) : play(t.kind, isOn ? null : t))}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2", isOn && "bg-accent-soft text-accent")}
              >
                {t.kind === "sfx" ? <Zap className="size-3.5 shrink-0 text-ember" /> : t.kind === "ambience" ? <Waves className="size-3.5 shrink-0 text-places" /> : <Music className="size-3.5 shrink-0 text-arcane" />}
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {t.loop && t.kind !== "sfx" && <Repeat className="size-3 text-faint" aria-label="Loops" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
