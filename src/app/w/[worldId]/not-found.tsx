"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusPage } from "@/components/common/status-page";

export default function WorldNotFound() {
  const { worldId } = useParams<{ worldId: string }>();
  return (
    <StatusPage
      code="404"
      title="Nothing here"
      actions={
        <>
          <Button asChild variant="primary">
            <Link href={`/w/${worldId}`}>World dashboard</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/w/${worldId}/wiki`}>Browse the wiki</Link>
          </Button>
        </>
      }
    >
      This entry may have been deleted, or it belongs to another world. Search with ⌘K to find what you were after.
    </StatusPage>
  );
}
