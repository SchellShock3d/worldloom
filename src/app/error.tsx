"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { StatusPage } from "@/components/common/status-page";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh bg-bg">
      <StatusPage
        title="Something snapped"
        code={error.digest ? `Error ${error.digest}` : undefined}
        actions={
          <>
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>
            <Button variant="secondary" onClick={() => (window.location.href = "/")}>
              Back to your worlds
            </Button>
          </>
        }
      >
        This page failed to load. Nothing was changed.
      </StatusPage>
    </main>
  );
}
