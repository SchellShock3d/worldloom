import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { Wordmark } from "@/components/shell/logo";
import { ThreadsIllustration } from "@/components/shell/threads-illustration";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,30rem)_1fr]">
      <main className="flex flex-col px-6 py-8 sm:px-12">
        <Wordmark />
        <div className="flex flex-1 items-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-xs text-faint">Your worlds are stored in your own database.</p>
      </main>
      <aside className="relative hidden overflow-hidden border-l border-line bg-bg-subtle lg:block" aria-hidden>
        <ThreadsIllustration />
      </aside>
    </div>
  );
}
