/**
 * Google Lyria through the Gemini API (Interactions endpoint).
 * Docs: https://ai.google.dev/gemini-api/docs/music-generation
 *
 * - lyria-3-clip-preview: always a 30-second clip (good for loops).
 * - lyria-3.5: a full track of a couple of minutes; length is steered by the prompt.
 * Instrumental-only and length are requested in the prompt. Output is MP3 by default and carries
 * Google's inaudible SynthID watermark.
 */

const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
/** LYRIA_ENDPOINT exists only so tests can point at a stand-in server. */
const endpoint = () => process.env.LYRIA_ENDPOINT || DEFAULT_ENDPOINT;
export type LyriaModel = "lyria-3-clip-preview" | "lyria-3.5";

export class MusicError extends Error {}

export function lyriaKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || null;
}

export function lyriaConfigured() {
  return !!lyriaKey();
}

function describe(status: number, message: string): string {
  const m = message.toLowerCase();
  if (status === 400 && /api key not valid|api_key_invalid/.test(m)) return "Google rejected the Gemini API key. Check GEMINI_API_KEY in .env.local.";
  if (status === 400 && /(safety|blocked|prohibited|policy|copyright|artist)/.test(m)) return "Google's filters blocked this request. Try describing the mood and instruments without naming artists or songs.";
  if (status === 401 || status === 403) return /not been used|disabled|enable/.test(m) ? "The Gemini API isn't enabled for this key's Google project. Create a key at aistudio.google.com/apikey, which enables it for you." : "Google rejected the Gemini API key. Check GEMINI_API_KEY in .env.local.";
  if (status === 404) return "This Gemini API key can't use Lyria (the model wasn't found). Lyria may not be available for your account or region yet.";
  if (status === 429) return /quota|billing/.test(m) ? "Your Gemini API quota is used up. Lyria needs billing enabled on the key's Google project (aistudio.google.com)." : "Google is rate-limiting requests. Wait a minute and try again.";
  if (status >= 500) return "Google's music service is having trouble right now. Try again in a minute.";
  return `Google said: ${message.slice(0, 300) || `HTTP ${status}`}`;
}

/** Find base64 audio anywhere in the response (the shape has changed between API versions). */
function findAudio(node: unknown, out: { data?: string; mime?: string; text: string[] }) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const x of node) findAudio(x, out);
    return;
  }
  const o = node as Record<string, unknown>;
  const mime = (o.mime_type ?? o.mimeType) as string | undefined;
  if (!out.data && typeof o.data === "string" && o.data.length > 1000 && (o.type === "audio" || (mime && mime.startsWith("audio/")))) {
    out.data = o.data;
    out.mime = mime;
  }
  if (o.type === "text" && typeof o.text === "string") out.text.push(o.text);
  for (const v of Object.values(o)) if (v && typeof v === "object") findAudio(v, out);
}

function sniff(buf: Buffer, claimed?: string): string {
  const head = buf.toString("ascii", 0, 4);
  if (head.startsWith("ID3") || (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0)) return "audio/mpeg";
  if (head === "RIFF") return "audio/wav";
  if (head === "OggS") return "audio/ogg";
  if (head === "fLaC") return "audio/flac";
  return claimed?.startsWith("audio/") ? claimed : "audio/mpeg";
}

async function call(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(240_000) });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") throw new MusicError("Lyria took too long to answer. Try again, or ask for a 30-second loop.");
    throw new MusicError("Couldn't reach Google's music service. Check your internet connection.");
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw new MusicError(describe(res.status, ((json.error as { message?: string })?.message ?? text).toString()));
  return json;
}

export async function generateLyria(opts: { prompt: string; model: LyriaModel }): Promise<{ data: Buffer; mime: string; notes: string }> {
  const key = lyriaKey();
  if (!key) throw new MusicError("Music generation isn't set up: add GEMINI_API_KEY to .env.local and restart Worldloom.");
  const headers = { "x-goog-api-key": key, "Content-Type": "application/json" };
  const ENDPOINT = endpoint();
  let json = await call(ENDPOINT, { method: "POST", headers, body: JSON.stringify({ model: opts.model, input: opts.prompt }) });

  // The examples return the finished interaction directly; if it comes back still running, poll it.
  const started = Date.now();
  while (!hasAudio(json) && typeof json.id === "string" && /progress|queued|running|pending/i.test(String(json.status ?? "")) && Date.now() - started < 240_000) {
    await new Promise((r) => setTimeout(r, 3000));
    json = await call(`${ENDPOINT}/${encodeURIComponent(json.id)}`, { method: "GET", headers });
  }

  const found: { data?: string; mime?: string; text: string[] } = { text: [] };
  findAudio(json, found);
  if (!found.data) {
    const reason = found.text.join(" ").trim();
    throw new MusicError(reason ? `Lyria didn't return audio: ${reason.slice(0, 300)}` : "Lyria didn't return any audio. Try rewording the description.");
  }
  const data = Buffer.from(found.data, "base64");
  return { data, mime: sniff(data, found.mime), notes: found.text.join("\n").slice(0, 2000) };
}

function hasAudio(json: unknown) {
  const f: { data?: string; text: string[] } = { text: [] };
  findAudio(json, f);
  return !!f.data;
}

/** Cheap key check for `npm run check-ai`: lists models, no generation. */
export async function checkLyriaKey(): Promise<{ ok: true; lyriaListed: boolean } | { ok: false; error: string }> {
  const key = lyriaKey();
  if (!key) return { ok: false, error: "No GEMINI_API_KEY found." };
  try {
    const json = await call("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", { method: "GET", headers: { "x-goog-api-key": key } });
    const names = ((json.models as { name?: string }[]) ?? []).map((m) => m.name ?? "");
    return { ok: true, lyriaListed: names.some((n) => n.includes("lyria")) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
