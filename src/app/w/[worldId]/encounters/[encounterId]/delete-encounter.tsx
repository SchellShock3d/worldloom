"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlays";
import { useWorld } from "@/components/shell/world-context";
import { deleteEncounterAction } from "@/server/actions/tools";

export function DeleteEncounterButton({ encounterId, name }: { encounterId: string; name: string }) {
  const w = useWorld();
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger-ghost" aria-label="Delete encounter">
          <Trash2 />
        </Button>
      }
      title={`Delete "${name}"?`}
      description="The encounter and its combatant list are removed. Creatures and NPCs in your world are not affected."
      confirmLabel="Delete encounter"
      onConfirm={async () => {
        const res = await deleteEncounterAction(w.worldId, encounterId);
        if (!res.ok) return void toast.error(res.error);
        router.push(`/w/${w.worldId}/encounters`);
      }}
    />
  );
}
