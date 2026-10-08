import { createDb, type DB } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { createWorld } from "@/server/services/worlds";
import { userActor, type Actor } from "@/server/services/history";

export async function setupTestDb() {
  const handle = await createDb({ dataDir: "memory://", migrate: true });
  return handle;
}

export async function createTestUser(db: DB, email = `dm${Math.random().toString(36).slice(2, 8)}@example.com`) {
  const [u] = await db.insert(users).values({ email, name: "Test DM", passwordHash: "x" }).returning();
  return u!;
}

export async function setupWorld(db: DB) {
  const user = await createTestUser(db);
  const actor: Actor & { userId: string } = { ...userActor(user.id), userId: user.id };
  const world = await createWorld(db, actor, { name: "Test World", genre: "High fantasy", tone: "", magicLevel: "Moderate", techLevel: "Medieval", description: "" });
  return { user, actor, world };
}
