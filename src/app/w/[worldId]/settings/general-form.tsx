"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/primitives";
import { useWorld } from "@/components/shell/world-context";
import { updateWorldAction } from "@/server/actions/worlds";

interface GeneralValues {
  name: string;
  genre: string;
  tone: string;
  magicLevel: string;
  techLevel: string;
  description: string;
  aiCreativity: "grounded" | "balanced" | "inventive";
  houseRules: string;
}

export function GeneralForm({ world }: { world: GeneralValues }) {
  const w = useWorld();
  const router = useRouter();
  const [v, setV] = React.useState(world);
  const [pending, setPending] = React.useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(world);
  const set = <K extends keyof GeneralValues>(k: K, val: GeneralValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const res = await updateWorldAction(w.worldId, {
      name: v.name,
      genre: v.genre,
      tone: v.tone,
      magicLevel: v.magicLevel,
      techLevel: v.techLevel,
      description: v.description,
      settings: { aiCreativity: v.aiCreativity, houseRules: v.houseRules },
    });
    setPending(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("World updated");
    router.refresh();
  };
  return (
    <form onSubmit={save} className="flex max-w-3xl flex-col gap-5">
      <Field label="Name" htmlFor="g-name">
        <Input id="g-name" value={v.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Genre" htmlFor="g-genre">
          <Input id="g-genre" value={v.genre} onChange={(e) => set("genre", e.target.value)} maxLength={80} />
        </Field>
        <Field label="Tone" htmlFor="g-tone" hint="Guides the AI's voice: “grim and political”, “whimsical”…">
          <Input id="g-tone" value={v.tone} onChange={(e) => set("tone", e.target.value)} maxLength={200} />
        </Field>
        <Field label="Magic" htmlFor="g-magic">
          <Input id="g-magic" value={v.magicLevel} onChange={(e) => set("magicLevel", e.target.value)} maxLength={60} />
        </Field>
        <Field label="Technology" htmlFor="g-tech">
          <Input id="g-tech" value={v.techLevel} onChange={(e) => set("techLevel", e.target.value)} maxLength={60} />
        </Field>
      </div>
      <Field label="Premise" htmlFor="g-desc" hint="A paragraph or two. It is part of every AI request about this world.">
        <Textarea id="g-desc" value={v.description} onChange={(e) => set("description", e.target.value)} className="min-h-32" maxLength={5000} />
      </Field>
      <section className="flex flex-col gap-4 border-t border-line pt-5">
        <h2 className="text-md font-semibold">AI</h2>
        <Field label="How inventive should drafts be?">
          <Segmented
            value={v.aiCreativity}
            onChange={(x) => set("aiCreativity", x)}
            options={[
              { value: "grounded", label: "Grounded" },
              { value: "balanced", label: "Balanced" },
              { value: "inventive", label: "Inventive" },
            ]}
          />
        </Field>
        <Field label="House rules and style notes" htmlFor="g-rules" hint="Anything the AI should always respect: banned tropes, naming conventions, content lines.">
          <Textarea id="g-rules" value={v.houseRules} onChange={(e) => set("houseRules", e.target.value)} className="min-h-24" maxLength={4000} placeholder="No resurrection magic. Elves are rare and distrusted. Keep gore off-screen." />
        </Field>
      </section>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={pending} disabled={!dirty}>
          Save changes
        </Button>
        {dirty && (
          <Button type="button" variant="ghost" onClick={() => setV(world)}>
            Discard
          </Button>
        )}
      </div>
    </form>
  );
}
