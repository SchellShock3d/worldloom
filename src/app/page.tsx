import Link from "next/link";
import { redirect } from "next/navigation";
import { Clapperboard, Compass, Plus } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getLastSessionForUser, listWorldsForUser } from "@/server/services/worlds";
import { Wordmark } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { HomeAccountMenu } from "./home-account-menu";
import { DemoWorldButton } from "./demo-world-button";
import { ImportWorld } from "@/components/common/import-world";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const db = await getDb();
  const [worlds, last] = await Promise.all([listWorldsForUser(db, user.id), getLastSessionForUser(db, user.id)]);
  if (!worlds.length) redirect("/onboarding");

  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center justify-between border-b border-line px-4 sm:px-8">
        <Wordmark />
        <HomeAccountMenu name={user.name} email={user.email} />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl font-semibold tracking-[-0.01em]">Your worlds</h1>
            <p className="mt-1.5 text-md text-muted">Pick up where you left off, or start something new.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ImportWorld compact />
            <DemoWorldButton />
            <Button asChild variant="primary">
              <Link href="/onboarding?new=1">
                <Plus /> New world
              </Link>
            </Button>
          </div>
        </div>

        {last && (
          <Link
            href={`/w/${last.worldId}/campaigns/${last.campaignId}/${last.status === "in_progress" ? "run" : `sessions/${last.sessionId}`}`}
            className="group mt-8 flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-4 hover:border-line-strong"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Clapperboard className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-faint">{last.status === "in_progress" ? "Session in progress" : "Continue last session"}</span>
              <span className="block truncate font-serif text-xl font-semibold">
                Session {last.number}
                {last.title ? `: ${last.title}` : ""}
              </span>
              <span className="block truncate text-sm text-muted">
                {last.campaignName} · {last.worldName} · {timeAgo(last.updatedAt)}
              </span>
            </span>
            <span className="text-sm font-medium text-accent group-hover:underline">{last.status === "in_progress" ? "Resume" : "Open"}</span>
          </Link>
        )}

        <ul className="mt-8 divide-y divide-line border-y border-line">
          {worlds.map((w) => (
            <li key={w.id}>
              <Link href={`/w/${w.id}`} className="group grid gap-x-6 gap-y-2 py-5 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <h2 className="font-serif text-2xl font-semibold group-hover:text-accent">{w.name}</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    {[w.genre, w.tone].filter(Boolean).join(", ")}
                    {w.role !== "owner" && ` · shared with you (${w.role})`}
                  </p>
                  {w.description && <p className="mt-2 line-clamp-2 max-w-[70ch] text-base text-muted">{w.description}</p>}
                  {w.campaigns.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {w.campaigns.slice(0, 4).map((c) => (
                        <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
                          <Compass className="size-3 text-brass" /> {c.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-6 text-sm text-faint sm:flex-col sm:items-end sm:gap-1">
                  <span className="tabular">{w.entityCount} entries</span>
                  <span>edited {timeAgo(w.updatedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
