import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusPage } from "@/components/common/status-page";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh bg-bg">
      <StatusPage code="404" title="This thread leads nowhere" actions={<Button asChild variant="primary"><Link href="/">Back to your worlds</Link></Button>}>
        The page doesn&apos;t exist, or you don&apos;t have access to it.
      </StatusPage>
    </main>
  );
}
