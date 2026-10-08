"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { ImportWorld } from "@/components/common/import-world";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { Field, Input } from "@/components/ui/input";
import { useWorld } from "@/components/shell/world-context";
import { deleteWorldAction } from "@/server/actions/worlds";

export function DataTools({ worldName, isOwner }: { worldName: string; isOwner: boolean }) {
  const w = useWorld();
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-md font-semibold">Back up this world</h2>
        <p className="text-sm text-muted">
          One JSON file with everything: entries, relationships, campaigns, sessions, timeline, maps, history and AI proposals. Keep it somewhere safe, or import it to make a copy.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="primary">
            <a href={`/api/w/${w.worldId}/export`} download>
              <Download /> Download with images and audio
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a href={`/api/w/${w.worldId}/export?files=0`} download>
              <Download /> Data only
            </a>
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="text-md font-semibold">Import a world</h2>
        <p className="text-sm text-muted">Creates a new world from a backup file. Nothing in {worldName} changes.</p>
        <ImportWorld />
      </section>

      {isOwner && (
        <section className="flex flex-col gap-3 border-t border-line pt-6">
          <h2 className="text-md font-semibold text-ember">Delete this world</h2>
          <p className="text-sm text-muted">Deletes every entry, campaign, session, map and file in {worldName} for everyone. Download a backup first; this can&apos;t be undone.</p>
          <DeleteWorld worldName={worldName} />
        </section>
      )}
    </div>
  );
}

function DeleteWorld({ worldName }: { worldName: string }) {
  const w = useWorld();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [pending, setPending] = React.useState(false);
  return (
    <>
      <Button variant="danger" className="self-start" onClick={() => setOpen(true)}>
        Delete world
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Delete ${worldName}?`} size="sm">
          <Field label={`Type ${worldName} to confirm`} htmlFor="del-name">
            <Input id="del-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              disabled={typed.trim() !== worldName}
              onClick={async () => {
                setPending(true);
                const res = await deleteWorldAction(w.worldId, typed);
                setPending(false);
                if (!res.ok) return void toast.error(res.error);
                router.push("/");
              }}
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
