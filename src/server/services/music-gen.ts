/**
 * Compose music and ambience for a scene with Google Lyria, save the tracks to the world's
 * library, and (for a scene) attach them as the scene's audio profile.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { audioProfiles, audioTracks, campaigns, scenes } from "@/server/db/schema";
import { saveFile } from "./files";
import { describeScene, writeBriefs, type ScoreKind } from "@/server/ai/tasks/score";
import { generateLyria, MusicError, type LyriaModel } from "@/server/music/lyria";

export interface ComposeInput {
  worldId: string;
  userId: string;
  sceneId?: string | null;
  description?: string;
  kinds: ScoreKind[];
  /** "loop": a 30-second clip; "long": a ~90-second track (music only; ambience is always a loop). */
  length: "loop" | "long";
  note?: string;
}

export interface ComposedTrack {
  id: string;
  name: string;
  kind: ScoreKind;
  prompt: string;
}

export async function composeForScene(db: DB, input: ComposeInput): Promise<{ tracks: ComposedTrack[]; failed: { kind: ScoreKind; error: string }[]; profileId: string | null; briefsBy: string }> {
  if (!input.kinds.length) throw new MusicError("Choose music, ambience, or both.");
  const scene = await describeScene(db, { worldId: input.worldId, sceneId: input.sceneId, description: input.description });
  if (!input.sceneId && !scene.info.text) throw new MusicError("Describe the scene, or pick one.");
  const briefs = await writeBriefs(scene, { note: input.note, length: input.length });

  const results = await Promise.allSettled(
    input.kinds.map(async (kind) => {
      const brief = briefs[kind];
      const model: LyriaModel = kind === "music" && input.length === "long" ? "lyria-3.5" : "lyria-3-clip-preview";
      const audio = await generateLyria({ prompt: brief.prompt, model });
      const ext = audio.mime === "audio/wav" ? "wav" : audio.mime === "audio/ogg" ? "ogg" : "mp3";
      const file = await saveFile(db, { worldId: input.worldId, ownerId: input.userId, filename: `${brief.title}.${ext}`, mimeType: audio.mime, data: audio.data, kind: "audio" });
      const [track] = await db
        .insert(audioTracks)
        .values({ worldId: input.worldId, name: brief.title, kind, fileId: file.id, tags: [...new Set([...brief.tags, "lyria"])].slice(0, 6), loop: true, volume: kind === "ambience" ? 0.7 : 0.8 })
        .returning();
      return { id: track!.id, name: track!.name, kind, prompt: brief.prompt } satisfies ComposedTrack;
    }),
  );
  const tracks = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const failed = results.flatMap((r, i) => (r.status === "rejected" ? [{ kind: input.kinds[i]!, error: r.reason instanceof Error ? r.reason.message : String(r.reason) }] : []));
  if (!tracks.length) throw new MusicError(failed[0]?.error ?? "Lyria didn't return any audio.");

  // Attach to the scene: update its profile, keeping whichever channel wasn't regenerated.
  let profileId: string | null = null;
  if (input.sceneId) {
    const [row] = await db
      .select({ scene: scenes })
      .from(scenes)
      .innerJoin(campaigns, eq(campaigns.id, scenes.campaignId))
      .where(and(eq(scenes.id, input.sceneId), eq(campaigns.worldId, input.worldId)));
    if (row) {
      const music = tracks.find((t) => t.kind === "music")?.id;
      const ambience = tracks.find((t) => t.kind === "ambience")?.id;
      const [existing] = row.scene.audioProfileId ? await db.select().from(audioProfiles).where(and(eq(audioProfiles.id, row.scene.audioProfileId), eq(audioProfiles.worldId, input.worldId))) : [];
      if (existing && existing.tags.includes("scene-score")) {
        await db
          .update(audioProfiles)
          .set({ musicTrackId: music ?? existing.musicTrackId, ambienceTrackId: ambience ?? existing.ambienceTrackId })
          .where(eq(audioProfiles.id, existing.id));
        profileId = existing.id;
      } else {
        const [p] = await db
          .insert(audioProfiles)
          .values({ worldId: input.worldId, name: row.scene.name, musicTrackId: music ?? existing?.musicTrackId ?? null, ambienceTrackId: ambience ?? existing?.ambienceTrackId ?? null, tags: ["scene-score"] })
          .returning();
        profileId = p!.id;
        await db.update(scenes).set({ audioProfileId: profileId }).where(eq(scenes.id, row.scene.id));
      }
    }
  }
  return { tracks, failed, profileId, briefsBy: briefs.provider };
}
