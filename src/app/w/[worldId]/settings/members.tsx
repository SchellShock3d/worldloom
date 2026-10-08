"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Input, NativeSelect } from "@/components/ui/input";
import { useWorld } from "@/components/shell/world-context";
import { addMemberAction, removeMemberAction, setMemberRoleAction } from "@/server/actions/worlds";

type Role = "owner" | "editor" | "viewer" | "player";
const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including people, backups and deleting the world.",
  editor: "Co-DM: can build, run sessions and approve AI proposals.",
  viewer: "Can read everything, including secrets. Changes nothing.",
  player: "Reserved for the player portal: only what the party has discovered.",
};

export function Members({ members, isOwner, me }: { members: { userId: string; role: Role; name: string; email: string }[]; isOwner: boolean; me: string }) {
  const w = useWorld();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"editor" | "viewer" | "player">("editor");
  const [pending, setPending] = React.useState(false);
  const [removing, setRemoving] = React.useState<{ userId: string; name: string } | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const res = await addMemberAction(w.worldId, email, role);
    setPending(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`${res.data.name} can now ${role === "editor" ? "edit" : "see"} this world`);
    setEmail("");
    router.refresh();
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm font-semibold">{m.name.charAt(0).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {m.name}
                {m.userId === me && <span className="font-normal text-faint"> (you)</span>}
              </p>
              <p className="truncate text-xs text-faint">{m.email || ROLE_HELP[m.role]}</p>
            </div>
            {isOwner ? (
              <NativeSelect
                value={m.role}
                onChange={async (e) => {
                  const res = await setMemberRoleAction(w.worldId, m.userId, e.target.value as Role);
                  if (!res.ok) toast.error(res.error);
                  router.refresh();
                }}
                className="h-8 w-32 text-sm"
                aria-label={`Role for ${m.name}`}
              >
                <option value="owner">Owner</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
                <option value="player">Player</option>
              </NativeSelect>
            ) : (
              <span className="text-sm capitalize text-muted">{m.role}</span>
            )}
            {(isOwner || m.userId === me) && (
              <Button variant="ghost" size="sm" onClick={() => setRemoving({ userId: m.userId, name: m.name })}>
                {m.userId === me ? "Leave" : "Remove"}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <form onSubmit={add} className="flex flex-col gap-2">
          <h2 className="text-md font-semibold">Add someone</h2>
          <p className="text-sm text-muted">They need an account first. Once they&apos;ve signed up, add them by email.</p>
          <div className="flex flex-wrap gap-2">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="co-dm@example.com" className="min-w-56 flex-1" aria-label="Email" required />
            <NativeSelect value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="w-36" aria-label="Role">
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
              <option value="player">Player</option>
            </NativeSelect>
            <Button type="submit" variant="primary" loading={pending}>
              <UserPlus /> Add
            </Button>
          </div>
          <p className="text-xs text-faint">{ROLE_HELP[role]}</p>
        </form>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing?.userId === me ? "Leave this world?" : `Remove ${removing?.name}?`}
        description={removing?.userId === me ? "You'll lose access until an owner adds you back." : "They'll lose access immediately. Their past edits stay in the history."}
        confirmLabel={removing?.userId === me ? "Leave" : "Remove"}
        onConfirm={async () => {
          if (!removing) return;
          const res = await removeMemberAction(w.worldId, removing.userId);
          if (!res.ok) return void toast.error(res.error);
          setRemoving(null);
          if (removing.userId === me) router.push("/");
          else router.refresh();
        }}
      />
    </div>
  );
}
