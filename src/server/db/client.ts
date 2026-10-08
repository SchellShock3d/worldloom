/**
 * Database client.
 *
 * - DATABASE_URL set   → postgres-js against any PostgreSQL (Supabase, Neon, local).
 * - DATABASE_URL empty → embedded PostgreSQL (PGlite, real Postgres compiled to
 *   WASM) persisted in ./.data/pglite. Zero setup for local use.
 *
 * Migrations run automatically on first access unless AUTO_MIGRATE=false.
 * Both drivers share the same Postgres dialect, so every query in the app is
 * written once.
 */
import path from "node:path";
import fs from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };

interface DbHandle {
  db: DB;
  driver: "pglite" | "postgres";
  close: () => Promise<void>;
}

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

declare global {
  // eslint-disable-next-line no-var
  var __worldloomDb: Promise<DbHandle> | undefined;
}

export async function createDb(opts: { url?: string; dataDir?: string; migrate?: boolean } = {}): Promise<DbHandle> {
  const url = opts.url ?? process.env.DATABASE_URL;
  const shouldMigrate = opts.migrate ?? process.env.AUTO_MIGRATE !== "false";

  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, { max: 10, onnotice: () => {} });
    const db = drizzle(client, { schema, casing: undefined }) as unknown as DB;
    if (shouldMigrate) {
      const { migrate } = await import("drizzle-orm/postgres-js/migrator");
      await migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
    }
    return { db, driver: "postgres", close: () => client.end() };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dataDir = opts.dataDir ?? process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dataDir !== "memory://") fs.mkdirSync(dataDir, { recursive: true });
  const client = await PGlite.create(dataDir === "memory://" ? undefined : dataDir, { extensions: { pg_trgm } });
  const db = drizzle(client, { schema }) as unknown as DB;
  if (shouldMigrate) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  return { db, driver: "pglite", close: () => client.close() };
}

/** Shared app database (one per process; survives dev hot reloads). */
export function getDbHandle(): Promise<DbHandle> {
  if (!globalThis.__worldloomDb) {
    globalThis.__worldloomDb = createDb().catch((err) => {
      globalThis.__worldloomDb = undefined;
      throw err;
    });
  }
  return globalThis.__worldloomDb;
}

export async function getDb(): Promise<DB> {
  return (await getDbHandle()).db;
}

/** Normalise raw `db.execute()` results across drivers. */
export function rowsOf<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) return (result as { rows: T[] }).rows;
  return [];
}
