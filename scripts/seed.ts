/**
 * Create the demo world ("The Shattered Crown") for an account.
 *
 *   npm run db:seed -- you@example.com            # add it to an existing account
 *   npm run db:seed -- demo@example.com secret123  # create that account first if it doesn't exist
 *
 * Production accounts never get demo data unless someone runs this.
 */
import { eq } from "drizzle-orm";
import { createDb } from "../src/server/db/client";
import { users } from "../src/server/db/schema";
import { hashPassword } from "../src/server/auth/password";
import { createDemoWorld } from "../src/server/services/seed";

const [email, password] = process.argv.slice(2);
if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error("Usage: npm run db:seed -- <email> [password-for-a-new-account]");
  process.exit(1);
}

const handle = await createDb({ migrate: true });
const db = handle.db;
let [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
if (!user) {
  if (!password || password.length < 8) {
    console.error(`No account for ${email}. Pass a password (8+ characters) to create one.`);
    await handle.close();
    process.exit(1);
  }
  [user] = await db
    .insert(users)
    .values({ email: email.toLowerCase(), name: email.split("@")[0]!, passwordHash: await hashPassword(password) })
    .returning();
  console.log(`Created account ${email}.`);
}
const { worldId, campaignId } = await createDemoWorld(db, user!.id);
console.log(`Demo world ready: /w/${worldId} (campaign ${campaignId}).`);
await handle.close();
