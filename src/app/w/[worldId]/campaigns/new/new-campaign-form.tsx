"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EntityPicker, type EntityOption } from "@/components/entity/entity-picker";
import { createCampaignAction } from "@/server/actions/campaigns";
import { PLACE_TYPES } from "@/lib/entity-types";

interface PcDraft {
  name: string;
  playerName: string;
  className: string;
  level: string;
  species: string;
}

export function NewCampaignForm({ worldId }: { worldId: string }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [premise, setPremise] = React.useState("");
  const [partyName, setPartyName] = React.useState("");
  const [location, setLocation] = React.useState<EntityOption | null>(null);
  const [pcs, setPcs] = React.useState<PcDraft[]>([{ name: "", playerName: "", className: "", level: "1", species: "" }]);
  const [pending, setPending] = React.useState(false);
  const setPc = (i: number, k: keyof PcDraft, v: string) => setPcs((list) => list.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Give the campaign a name.");
    setPending(true);
    const res = await createCampaignAction(worldId, {
      name,
      premise,
      partyName: partyName || undefined,
      startingLocationId: location?.id ?? null,
      characters: pcs
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name, playerName: p.playerName || undefined, className: p.className || undefined, level: p.level ? Number(p.level) : undefined, species: p.species || undefined })),
    });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Campaign created");
    router.push(`/w/${worldId}/campaigns/${res.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
      <Field label="Campaign name" htmlFor="c-name">
        <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="The Crown and the Ash" className="h-10 text-md" autoFocus />
      </Field>
      <Field label="Premise" htmlFor="c-premise" hint="What's the campaign about? The AI uses this for context.">
        <Textarea id="c-premise" value={premise} onChange={(e) => setPremise(e.target.value)} className="min-h-24" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starting location" hint="Create a place on the fly if your world is empty.">
          <EntityPicker value={location} onChange={setLocation} types={PLACE_TYPES} createType="settlement" placeholder="Where does it begin?" />
        </Field>
        <Field label="Party name" htmlFor="c-party">
          <Input id="c-party" value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="The party" />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Characters</legend>
        <div className="flex flex-col gap-2">
          {pcs.map((p, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-line p-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_4rem_auto]">
              <Input aria-label="Character name" value={p.name} onChange={(e) => setPc(i, "name", e.target.value)} placeholder="Character" className="h-8" />
              <Input aria-label="Player" value={p.playerName} onChange={(e) => setPc(i, "playerName", e.target.value)} placeholder="Player" className="h-8" />
              <Input aria-label="Species" value={p.species} onChange={(e) => setPc(i, "species", e.target.value)} placeholder="Species" className="h-8" />
              <Input aria-label="Class" value={p.className} onChange={(e) => setPc(i, "className", e.target.value)} placeholder="Class" className="h-8" />
              <Input aria-label="Level" type="number" min={1} max={30} value={p.level} onChange={(e) => setPc(i, "level", e.target.value)} className="h-8" />
              <Button type="button" variant="ghost" size="icon" onClick={() => setPcs((l) => l.filter((_, j) => j !== i))} aria-label="Remove character">
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setPcs((l) => [...l, { name: "", playerName: "", className: "", level: l[l.length - 1]?.level ?? "1", species: "" }])}>
            <Plus /> Add character
          </Button>
        </div>
      </fieldset>
      <div className="flex justify-end border-t border-line pt-5">
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          Create campaign
        </Button>
      </div>
    </form>
  );
}
