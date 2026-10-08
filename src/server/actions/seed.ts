"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getDb } from "@/server/db/client";
import { requireUser } from "@/server/auth/session";
import { createDemoWorld } from "@/server/services/seed";
import { run } from "./_util";

export async function createDemoWorldAction() {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const res = await db.transaction((tx) => createDemoWorld(tx, user.id));
    (await cookies()).set(`wl_campaign_${res.worldId}`, res.campaignId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    revalidatePath("/");
    return res;
  });
}
