/**
 * File storage. The local-disk driver keeps files under UPLOAD_DIR; swap in an
 * S3/Supabase Storage driver by implementing StorageDriver. Files are always
 * served through an access-checked route, never from a public folder.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { files, type FileRow } from "@/server/db/schema";

export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalDiskStorage implements StorageDriver {
  constructor(private root: string) {}
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  driver ??= new LocalDiskStorage(process.env.UPLOAD_DIR || path.join(process.cwd(), ".data", "uploads"));
  return driver;
}

export const ALLOWED_TYPES: Record<string, { kind: "image" | "audio"; ext: string }> = {
  "image/png": { kind: "image", ext: "png" },
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/webp": { kind: "image", ext: "webp" },
  "image/gif": { kind: "image", ext: "gif" },
  "audio/mpeg": { kind: "audio", ext: "mp3" },
  "audio/ogg": { kind: "audio", ext: "ogg" },
  "audio/wav": { kind: "audio", ext: "wav" },
  "audio/x-wav": { kind: "audio", ext: "wav" },
  "audio/webm": { kind: "audio", ext: "webm" },
  "audio/mp4": { kind: "audio", ext: "m4a" },
  "audio/aac": { kind: "audio", ext: "aac" },
  "audio/flac": { kind: "audio", ext: "flac" },
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Read PNG/JPEG/WebP/GIF dimensions from the header. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1]!;
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/** Magic-byte check so a renamed file can't masquerade as an image. */
export function sniffMime(buf: Buffer, claimed: string): string | null {
  if (buf.readUInt32BE(0) === 0x89504e47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (claimed.startsWith("audio/")) {
    const head = buf.toString("ascii", 0, 4);
    if (head === "ID3" || (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) || head === "OggS" || head === "RIFF" || head === "fLaC" || buf.toString("ascii", 4, 8) === "ftyp" || buf.readUInt32BE(0) === 0x1a45dfa3) return claimed;
  }
  return null;
}

export async function saveFile(db: DB, opts: { worldId: string | null; ownerId: string; filename: string; mimeType: string; data: Buffer; kind?: FileRow["kind"]; trusted?: boolean }): Promise<FileRow> {
  if (opts.data.length > MAX_UPLOAD_BYTES) throw new Error("Files can be up to 25 MB.");
  let mime = opts.mimeType;
  if (!opts.trusted) {
    const sniffed = sniffMime(opts.data, opts.mimeType);
    if (!sniffed || !ALLOWED_TYPES[sniffed]) throw new Error("Upload a PNG, JPEG, WebP or GIF image, or an MP3, OGG, WAV, M4A or FLAC audio file.");
    mime = sniffed;
  }
  const ext = ALLOWED_TYPES[mime]?.ext ?? (mime === "image/svg+xml" ? "svg" : "bin");
  const key = `${opts.worldId ?? "user"}/${crypto.randomUUID()}.${ext}`;
  await storage().put(key, opts.data);
  const dims = mime.startsWith("image/") && mime !== "image/svg+xml" ? imageSize(opts.data) : null;
  const svgDims = mime === "image/svg+xml" ? opts.data.toString("utf8").match(/viewBox="0 0 (\d+) (\d+)"/) : null;
  const [row] = await db
    .insert(files)
    .values({
      worldId: opts.worldId,
      ownerId: opts.ownerId,
      kind: opts.kind ?? (mime.startsWith("audio/") ? "audio" : "image"),
      filename: opts.filename.slice(0, 200),
      mimeType: mime,
      size: opts.data.length,
      width: dims?.width ?? (svgDims ? Number(svgDims[1]) : null),
      height: dims?.height ?? (svgDims ? Number(svgDims[2]) : null),
      storageKey: key,
    })
    .returning();
  return row!;
}

export async function getFileRow(db: DB, fileId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const [f] = await db.select().from(files).where(eq(files.id, fileId));
  return f ?? null;
}

export async function deleteFile(db: DB, worldId: string, fileId: string) {
  const [f] = await db.select().from(files).where(and(eq(files.id, fileId), eq(files.worldId, worldId)));
  if (!f) return;
  await storage().delete(f.storageKey).catch(() => undefined);
  await db.delete(files).where(eq(files.id, fileId));
}
