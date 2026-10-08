"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AtSign, ExternalLink, Link2, Pencil, Sparkles, SquareArrowOutUpRight, Trash2, Waypoints } from "lucide-react";
import { ConfirmDialog, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/overlays";
import { useWorld } from "@/components/shell/world-context";
import { deleteEntityAction } from "@/server/actions/entities";
import { mentionToken } from "@/lib/mentions";

/** Right-click actions for an entry anywhere it's listed. */
export function EntityContextMenu({ entity, canEdit = true, children }: { entity: { id: string; name: string }; canEdit?: boolean; children: React.ReactElement }) {
  const w = useWorld();
  const router = useRouter();
  const [confirm, setConfirm] = React.useState(false);
  const href = `/w/${w.worldId}/e/${entity.id}`;
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't reach the clipboard.");
    }
  };
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onSelect={() => router.push(href)}>
            <ExternalLink /> Open
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => window.open(href, "_blank", "noopener")}>
            <SquareArrowOutUpRight /> Open in new tab
          </ContextMenuItem>
          {canEdit && (
            <ContextMenuItem onSelect={() => router.push(`${href}/edit`)}>
              <Pencil /> Edit
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => copy(mentionToken(entity.name, entity.id), "Mention")}>
            <AtSign /> Copy @mention
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => copy(new URL(href, window.location.origin).toString(), "Link")}>
            <Link2 /> Copy link
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => router.push(`/w/${w.worldId}/graph?focus=${entity.id}`)}>
            <Waypoints /> Show in graph
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => w.openAssistant({ prompt: `Tell me about ${entity.name}: what matters most right now, and what I might be forgetting.`, focusEntityId: entity.id })}>
            <Sparkles className="!text-arcane" /> Ask the AI about it
          </ContextMenuItem>
          {canEdit && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem danger onSelect={() => setConfirm(true)}>
                <Trash2 /> Delete
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${entity.name}?`}
        description="Mentions of it elsewhere stay as plain text. You can restore it from the world's history."
        onConfirm={async () => {
          const res = await deleteEntityAction(w.worldId, entity.id);
          if (!res.ok) return void toast.error(res.error);
          toast.success(`Deleted ${entity.name}`);
          router.refresh();
        }}
      />
    </>
  );
}
