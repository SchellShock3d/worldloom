"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorld } from "@/components/shell/world-context";
import { createSessionAction } from "@/server/actions/sessions";

export function NewSessionButton({ campaignId }: { campaignId: string }) {
  const w = useWorld();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="primary"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const res = await createSessionAction(w.worldId, campaignId);
        setBusy(false);
        if (!res.ok) return toast.error(res.error);
        router.push(`/w/${w.worldId}/campaigns/${campaignId}/sessions/${res.data.id}`);
      }}
    >
      {!busy && <Plus />} Plan a session
    </Button>
  );
}
