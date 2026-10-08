import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listWorldsForUser } from "@/server/services/worlds";
import { Wordmark } from "@/components/shell/logo";
import { OnboardingWizard } from "./wizard";
import { getAIProvider } from "@/server/ai/provider";

export const metadata = { title: "Create a world" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const db = await getDb();
  // No redirect for people who already have worlds: this page is also the "New world" flow, and the
  // wizard's own server actions re-render it mid-flow (after the first world exists).
  const worlds = await listWorldsForUser(db, user.id);
  const ai = await getAIProvider();
  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center border-b border-line px-4 sm:px-8">
        <Wordmark />
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <OnboardingWizard firstWorld={!worlds.length} userName={user.name} aiLive={ai.live} />
      </main>
    </div>
  );
}
