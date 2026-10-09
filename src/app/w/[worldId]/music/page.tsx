import { asc, eq } from "drizzle-orm";
import { AudioLines, Music } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { audioProfiles, audioTracks, campaigns, scenes } from "@/server/db/schema";
import { lyriaConfigured } from "@/server/music/lyria";
import { ComposeMusic } from "@/components/play/compose-music";
import { PageHeader, Panel, PanelHeader } from "@/components/ui/display";
import { MusicPlayer } from "@/components/play/music-player";
import { MusicLibrary } from "./music-library";

export const metadata = { title: "Music & ambience" };

export default async function MusicPage({ params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { role } = await requireWorld(worldId);
  const db = await getDb();
  const [tracks, profiles, sceneRows] = await Promise.all([
    db.select().from(audioTracks).where(eq(audioTracks.worldId, worldId)).orderBy(asc(audioTracks.kind), asc(audioTracks.name)),
    db.select().from(audioProfiles).where(eq(audioProfiles.worldId, worldId)).orderBy(asc(audioProfiles.name)),
    db
      .select({ id: scenes.id, name: scenes.name, campaign: campaigns.name })
      .from(scenes)
      .innerJoin(campaigns, eq(campaigns.id, scenes.campaignId))
      .where(eq(campaigns.worldId, worldId))
      .orderBy(asc(campaigns.name), asc(scenes.position), asc(scenes.name)),
  ]);
  const trackViews = tracks.filter((t) => t.fileId || t.url).map((t) => ({ id: t.id, name: t.name, kind: t.kind, src: t.fileId ? `/api/files/${t.fileId}` : t.url!, tags: t.tags, loop: t.loop, volume: t.volume }));
  const profileViews = profiles.map((p) => ({ id: p.id, name: p.name, musicTrackId: p.musicTrackId, ambienceTrackId: p.ambienceTrackId, tags: p.tags }));
  const canEdit = role === "owner" || role === "editor";
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<Music />}
        title="Music & ambience"
        description="Compose music and ambience for your scenes with Google Lyria, or upload files you have the rights to. Group a music track and an ambience loop into a profile, then attach profiles to scenes. Looping tracks crossfade seamlessly."
      />
      {canEdit && (
        <Panel className="mb-6">
          <PanelHeader icon={<AudioLines className="text-arcane" />} title="Compose for a scene" description="Music to play under the scene, and an ambient soundscape for the place. Both loop cleanly." />
          <div className="px-4 pb-4">
            <ComposeMusic configured={lyriaConfigured()} scenes={sceneRows.map((r) => ({ id: r.id, label: `${r.campaign}: ${r.name}` }))} />
          </div>
        </Panel>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <MusicLibrary tracks={tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, tags: t.tags, loop: t.loop, volume: t.volume, fileId: t.fileId, url: t.url }))} profiles={profileViews} canEdit={canEdit} />
        <Panel className="self-start lg:sticky lg:top-4">
          <PanelHeader title="Player" description="Crossfades between tracks. Try it before the session." />
          <div className="px-4 pb-4">
            {trackViews.length ? <MusicPlayer tracks={trackViews} profiles={profileViews} /> : <p className="text-sm text-faint">Add a track to try the player.</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
