"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusPage } from "@/components/common/status-page";

export default function WorldError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { worldId } = useParams<{ worldId: string }>();
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusPage
      title="Something snapped"
      code={error.digest ? `Error ${error.digest}` : undefined}
      actions={
        <>
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/w/${worldId}`}>World dashboard</Link>
          </Button>
        </>
      }
    >
      This page failed to load. Your world is safe: nothing was changed. If it keeps happening, the server log has the details.
    </StatusPage>
  );
}
