/**
 * Scene music: the Lyria client (against the documented response shape, with fetch stubbed),
 * the briefs, and composing for a scene end to end.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { audioProfiles, audioTracks, campaigns, scenes } from "@/server/db/schema";
import { createDemoWorld } from "@/server/services/seed";
import { composeForScene } from "@/server/services/music-gen";
import { generateLyria, MusicError } from "@/server/music/lyria";
import { describeScene, templateBriefs, writeBriefs } from "@/server/ai/tasks/score";
import { audibleRange } from "@/components/play/loop-audio";
import { sniffMime } from "@/server/services/files";
import { setupTestDb, createTestUser } from "./helpers";

let handle: Awaited<ReturnType<typeof setupTestDb>>;
let db: DB;
beforeAll(async () => {
  handle = await setupTestDb();
  db = handle.db;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => handle.close());

// A tiny fake MP3: an ID3 header and some bytes.
const fakeMp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(4000, 7)]);
const lyriaResponse = (data = fakeMp3) => ({ id: "int-1", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "[0:00] Low strings" }, { type: "audio", data: data.toString("base64") }] }] });

function stubFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null, headers: init.headers as Record<string, string> });
    const r = handler(url, init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}

describe("Lyria client", () => {
  it("sends the documented request and decodes the audio", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const calls = stubFetch(() => ({ body: lyriaResponse() }));
    const out = await generateLyria({ prompt: "Low strings, 70 BPM, loops.", model: "lyria-3-clip-preview" });
    expect(calls[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(calls[0]!.headers["x-goog-api-key"]).toBe("test-key");
    expect(calls[0]!.body).toEqual({ model: "lyria-3-clip-preview", input: "Low strings, 70 BPM, loops." });
    expect(out.mime).toBe("audio/mpeg");
    expect(out.data.equals(fakeMp3)).toBe(true);
    expect(out.notes).toContain("Low strings");
  });

  it("polls an interaction that's still running", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    let n = 0;
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const calls = stubFetch(() => (n++ === 0 ? { body: { id: "int-9", status: "in_progress" } } : { body: lyriaResponse() }));
    const p = generateLyria({ prompt: "x", model: "lyria-3.5" });
    await vi.advanceTimersByTimeAsync(3100);
    const out = await p;
    vi.useRealTimers();
    expect(calls[1]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions/int-9");
    expect(out.data.length).toBe(fakeMp3.length);
  });

  it("explains failures in plain words", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    stubFetch(() => ({ status: 400, body: { error: { message: "API key not valid. Please pass a valid API key." } } }));
    await expect(generateLyria({ prompt: "x", model: "lyria-3.5" })).rejects.toThrow(/rejected the Gemini API key/);
    stubFetch(() => ({ status: 429, body: { error: { message: "Quota exceeded; billing required" } } }));
    await expect(generateLyria({ prompt: "x", model: "lyria-3.5" })).rejects.toThrow(/billing/);
    stubFetch(() => ({ body: { steps: [{ type: "model_output", content: [{ type: "text", text: "I can't make that." }] }] } }));
    await expect(generateLyria({ prompt: "x", model: "lyria-3.5" })).rejects.toThrow(/didn't return audio: I can't make that/);
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(generateLyria({ prompt: "x", model: "lyria-3.5" })).rejects.toBeInstanceOf(MusicError);
  });
});

describe("scene briefs", () => {
  it("build from the scene and fit the world's technology", async () => {
    const user = await createTestUser(db);
    const { worldId, campaignId } = await createDemoWorld(db, user.id);
    const [sc] = await db.select().from(scenes).where(and(eq(scenes.campaignId, campaignId), eq(scenes.name, "The Drowned Lantern at dusk")));
    const scene = await describeScene(db, { worldId, sceneId: sc!.id });
    expect(scene.info.place).toContain("The Drowned Lantern");
    expect(scene.info.mood).toBe("Tense, crowded");
    const t = templateBriefs(scene, 30);
    expect(t.music.prompt).toMatch(/lute|hurdy-gurdy/);
    expect(t.music.prompt).toMatch(/Instrumental only, no vocals/);
    expect(t.music.prompt).toMatch(/no fade/);
    expect(t.ambience.prompt).toMatch(/crowd murmur/);
    expect(t.ambience.prompt).toMatch(/no music/);
    // Offline (no Claude in tests): the template is used.
    const b = await writeBriefs(scene, { length: "loop" });
    expect(b.provider).toBe("offline");
  });
});

describe("composing for a scene", () => {
  it("saves both tracks, attaches them to the scene, and replaces one channel on a redo", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const calls = stubFetch(() => ({ body: lyriaResponse() }));
    const user = await createTestUser(db);
    const { worldId, campaignId } = await createDemoWorld(db, user.id);
    const [sc] = await db.select().from(scenes).where(and(eq(scenes.campaignId, campaignId), eq(scenes.name, "Bread riot at the Council Hall")));
    const res = await composeForScene(db, { worldId, userId: user.id, sceneId: sc!.id, kinds: ["music", "ambience"], length: "long" });
    expect(res.failed).toEqual([]);
    expect(res.tracks.map((t) => t.kind).sort()).toEqual(["ambience", "music"]);
    // Music uses the full-length model when asked; ambience is always a loop clip.
    const models = calls.map((c) => (c.body as { model: string }).model).sort();
    expect(models).toEqual(["lyria-3-clip-preview", "lyria-3.5"]);

    const [scene] = await db.select().from(scenes).where(eq(scenes.id, sc!.id));
    const [profile] = await db.select().from(audioProfiles).where(eq(audioProfiles.id, scene!.audioProfileId!));
    expect(profile!.name).toBe("Bread riot at the Council Hall");
    const music = res.tracks.find((t) => t.kind === "music")!;
    expect(profile!.musicTrackId).toBe(music.id);
    const [track] = await db.select().from(audioTracks).where(eq(audioTracks.id, music.id));
    expect(track!.loop).toBe(true);
    expect(track!.fileId).not.toBeNull();
    expect(track!.tags).toContain("lyria");

    // Redo just the ambience: the music stays, the profile is reused.
    const again = await composeForScene(db, { worldId, userId: user.id, sceneId: sc!.id, kinds: ["ambience"], length: "loop", note: "more rain" });
    const [p2] = await db.select().from(audioProfiles).where(eq(audioProfiles.id, scene!.audioProfileId!));
    expect(again.profileId).toBe(profile!.id);
    expect(p2!.musicTrackId).toBe(music.id);
    expect(p2!.ambienceTrackId).toBe(again.tracks[0]!.id);
  });

  it("keeps what worked when one track fails, and needs a scene or a description", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    let n = 0;
    stubFetch(() => (n++ === 0 ? { body: lyriaResponse() } : { status: 400, body: { error: { message: "Request blocked by safety filters" } } }));
    const user = await createTestUser(db);
    const { worldId } = await createDemoWorld(db, user.id);
    const res = await composeForScene(db, { worldId, userId: user.id, description: "A storm-lashed lighthouse at midnight", kinds: ["music", "ambience"], length: "loop" });
    expect(res.tracks).toHaveLength(1);
    expect(res.failed[0]!.error).toMatch(/filters blocked/);
    expect(res.profileId).toBeNull();
    await expect(composeForScene(db, { worldId, userId: user.id, kinds: ["music"], length: "loop" })).rejects.toThrow(/Describe the scene/);
    void campaigns;
  });
});

describe("uploads", () => {
  it("accept MP3s that start with an ID3 tag", () => {
    expect(sniffMime(Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]), Buffer.alloc(100)]), "audio/mpeg")).toBe("audio/mpeg");
  });
});

describe("seamless loops", () => {
  it("finds where the sound starts and ends", () => {
    const rate = 1000;
    const data = new Float32Array(5 * rate);
    for (let i = 500; i < 4200; i++) data[i] = Math.sin(i / 3) * 0.5;
    const buffer = { numberOfChannels: 1, length: data.length, sampleRate: rate, duration: data.length / rate, getChannelData: () => data } as unknown as AudioBuffer;
    const r = audibleRange(buffer);
    expect(r.start).toBeCloseTo(0.5, 1);
    expect(r.end).toBeCloseTo(4.2, 1);
  });
});
