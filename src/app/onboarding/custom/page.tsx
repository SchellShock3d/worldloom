import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listWorldsForUser } from "@/server/services/worlds";
import { getAIProvider } from "@/server/ai/provider";
import { Wordmark } from "@/components/shell/logo";
import { WorldCreator } from "../creator/creator";

export const metadata = { title: "Create a world" };

/** The fill-it-in-yourself creator, for DMs who want full control. */
export default async function CustomCreatorPage() {
  const user = await requireUser();
  const db = await getDb();
  const worlds = await listWorldsForUser(db, user.id);
  const ai = await getAIProvider();
  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center justify-between border-b border-line px-4 sm:px-8">
        <Wordmark />
        <Link href="/onboarding" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Let Claude write it
        </Link>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
        <WorldCreator firstWorld={!worlds.length} userName={user.name} aiLive={ai.live} />
      </main>
    </div>
  );
}
