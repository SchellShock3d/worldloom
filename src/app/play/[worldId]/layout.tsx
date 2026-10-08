import Link from "next/link";
import { Eye } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { Wordmark } from "@/components/shell/logo";

/** The player portal: a read-only view of what the party knows. DMs can open it to preview. */
export default async function PlayLayout({ children, params }: { children: React.ReactNode; params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { world, role } = await requireWorld(worldId, "player");
  const isDm = role === "owner" || role === "editor" || role === "viewer";
  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center justify-between gap-4 border-b border-line px-4 sm:px-8">
        <Link href="/" aria-label="Your worlds">
          <Wordmark />
        </Link>
        <span className="truncate font-serif text-lg font-semibold">{world.name}</span>
      </header>
      {isDm && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-brass-soft px-4 py-2 text-center text-sm text-brass">
          <Eye className="size-4" /> You&apos;re previewing what your players can see.
          <Link href={`/w/${worldId}`} className="font-medium underline underline-offset-2">
            Back to the DM view
          </Link>
        </div>
      )}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
