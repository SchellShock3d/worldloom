"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Eye, EyeOff, GitBranch, Link2, MessageSquareQuote, MoreHorizontal, Pencil, ScrollText, Sparkles, Star, Trash2, UserRound, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/overlays";
import { Field, Textarea } from "@/components/ui/input";
import { deleteEntityAction, updateEntityAction } from "@/server/actions/entities";
import { consequencesAction, loreAction_ } from "@/server/actions/ai";
import { useWorld } from "@/components/shell/world-context";
import { AiWorking } from "@/components/ai/ai-working";
import type { LoreAction } from "@/server/ai/tasks/world-tasks";

export function EntityActions({
  entity,
}: {
  entity: { id: string; name: string; type: string; canonStatus: string; visibility: string; importance: number };
}) {
  const w = useWorld();
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);
  const [lore, setLore] = React.useState<LoreAction | null>(null);
  const [guidance, setGuidance] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [consOpen, setConsOpen] = React.useState(false);
  const [action, setAction] = React.useState("");
  const base = `/w/${w.worldId}`;

  const patch = async (p: Parameters<typeof updateEntityAction>[2], msg: string) => {
    const res = await updateEntityAction(w.worldId, entity.id, p);
    if (!res.ok) return toast.error(res.error);
    toast.success(msg);
    router.refresh();
  };

  const runLore = async () => {
    if (!lore) return;
    setBusy(true);
    const res = await loreAction_(w.worldId, { entityId: entity.id, action: lore, guidance: guidance.trim() || undefined, campaignId: w.activeCampaign?.id ?? null });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setLore(null);
    setGuidance("");
    router.push(`${base}/proposals/${res.data.batchId}`);
  };

  const LORE_LABELS: Record<LoreAction, { title: string; description: string }> = {
    expand: { title: "Expand this article", description: "Adds detail consistent with everything already recorded. You'll review the text before it's added." },
    summarize: { title: "Write a summary", description: "A one or two sentence summary from what's recorded." },
    connect: { title: "Suggest connections", description: "Proposes relationships to existing entities in your world." },
    motivations: { title: "Generate motivations", description: "Goals, fears and wants that fit this character's situation." },
    secrets: { title: "Invent secrets", description: "Secrets that tie into your existing threads and factions (DM only)." },
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {entity.type === "npc" && (
        <Button asChild variant="secondary" size="md">
          <Link href={`${base}/ai?roleplay=${entity.id}`}>
            <MessageSquareQuote /> Roleplay
          </Link>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="arcane" size="md">
            <Sparkles /> AI tools
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Everything arrives as a proposal</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setLore("expand")}>
            <Wand2 /> Expand article
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLore("summarize")}>
            <ScrollText /> Summarize
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLore("connect")}>
            <Link2 /> Suggest connections
          </DropdownMenuItem>
          {["npc", "pc", "faction", "deity", "organization"].includes(entity.type) && (
            <DropdownMenuItem onSelect={() => setLore("motivations")}>
              <UserRound /> Generate motivations
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setLore("secrets")}>
            <EyeOff /> Invent secrets
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConsOpen(true)}>
            <GitBranch /> What if the party…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => w.openAssistant({ focusEntityId: entity.id })}>
            <Sparkles /> Ask the copilot about this
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button asChild variant="primary" size="md">
        <Link href={`${base}/e/${entity.id}/edit`}>
          <Pencil /> Edit
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => patch({ importance: entity.importance >= 1 ? 0 : 1 }, entity.importance >= 1 ? "Unmarked as important" : "Marked as important")}>
            <Star /> {entity.importance >= 1 ? "Unmark important" : "Mark as important"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => patch({ visibility: entity.visibility === "public" ? "secret" : "public" }, entity.visibility === "public" ? "Now secret" : "Players can now see this")}>
            {entity.visibility === "public" ? <EyeOff /> : <Eye />} {entity.visibility === "public" ? "Make secret" : "Reveal to players"}
          </DropdownMenuItem>
          {entity.canonStatus !== "canon" && entity.canonStatus !== "archived" && (
            <DropdownMenuItem onSelect={() => patch({ canonStatus: "canon" }, "Marked as canon")}>
              <ScrollText /> Mark as canon
            </DropdownMenuItem>
          )}
          {entity.canonStatus === "archived" ? (
            <DropdownMenuItem onSelect={() => patch({ canonStatus: "canon" }, "Restored")}>
              <ArchiveRestore /> Restore from archive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => patch({ canonStatus: "archived" }, "Archived")}>
              <Archive /> Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem danger onSelect={() => setDeleting(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${entity.name}?`}
        description="Its relationships and map pins are removed too. You can restore it later from World settings › History."
        confirmLabel="Delete"
        onConfirm={async () => {
          const res = await deleteEntityAction(w.worldId, entity.id);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(`Deleted ${res.data.name}`);
          router.push(`${base}/wiki`);
        }}
      />

      <Dialog open={!!lore} onOpenChange={(o) => !o && setLore(null)}>
        {lore && (
          <DialogContent title={LORE_LABELS[lore].title} description={LORE_LABELS[lore].description}>
            <Field label="Guidance (optional)" htmlFor="lore-guidance" hint="E.g. “make her morally grey” or “tie it to the plague”.">
              <Textarea id="lore-guidance" value={guidance} onChange={(e) => setGuidance(e.target.value)} className="min-h-16" />
            </Field>
            <AiWorking active={busy} live={w.aiProvider.live} typical="20–40 seconds" />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setLore(null)}>
                Cancel
              </Button>
              <Button variant="arcane" onClick={runLore} loading={busy}>
                <Sparkles /> Propose
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={consOpen} onOpenChange={setConsOpen}>
        <DialogContent title="Cause and effect" description={`Describe what the party did involving ${entity.name}. Worldloom suggests logical consequences from your world's current state.`}>
          <Field label="What did the party do?" htmlFor="cons-action">
            <Textarea id="cons-action" value={action} onChange={(e) => setAction(e.target.value)} placeholder={`The party publicly humiliated ${entity.name}…`} className="min-h-20" />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConsOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="arcane"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const res = await consequencesAction(w.worldId, { action, campaignId: w.activeCampaign?.id ?? null, focusIds: [entity.id] });
                setBusy(false);
                if (!res.ok) return toast.error(res.error);
                setConsOpen(false);
                router.push(`${base}/proposals/${res.data.batchId}`);
              }}
            >
              <GitBranch /> Suggest consequences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
