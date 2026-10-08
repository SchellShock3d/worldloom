import { createDb } from "../src/server/db/client";

const handle = await createDb({ migrate: true });
console.log(`Migrations applied (${handle.driver}).`);
await handle.close();
