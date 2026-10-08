"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Clapperboard, NotebookPen, Plus, Sparkles, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/common/markdown";
import { PageHeader, Panel, SectionTitle } from "@/components/ui/display";
import { useWorld } from "@/components/shell/world-context";
import { AiWorking } from "@/components/ai/ai-working";
import { prepareSessionAction } from "@/server/actions/ai";
import { createSessionAction, saveSceneAction, updateSessionAction } from "@/server/actions/sessions";
import { saveEncounterAction } from "@/server/actions/tools";
import type { Briefing } from "@/server/ai/tasks/dm-tools";

export function PrepareView({ campaignId, campaignName, nextSession, nextNumber }: { campaignId: string; campaignName: string; nextSession: { id: string; number: number; title: string; prep: string } | null; nextNumber: number }) {
  const w = useWorld();
  const router = useRouter();
  const [focus, setFocus] = React.useState("");
  const [briefing, setBriefing] = React.useState<Briefing | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<Set<string>>(new Set());
  const [sessionId, setSessionId] = React.useState<string | null>(nextSession?.id ?? null);

  const ensureSession = async () => {
    if (sessionId) return sessionId;
    const res = await createSessionAction(w.worldId, campaignId);
    if (!res.ok) throw new Error(res.error);
    setSessionId(res.data.id);
    return res.data.id;
  };

  const generate = async () => {
    setBusy(true);
    const res = await prepareSessionAction(w.worldId, campaignId, focus.trim() || undefined);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setBriefing(res.data);
    setDone(new Set());
  };

  const savePrep = async () => {
    if (!briefing) return;
    try {
      const id = await ensureSession();
      const prep = nextSession?.prep?.trim() ? `${nextSession.prep.trim()}\n\n---\n\n${briefing.markdown}` : briefing.markdown;
      const res = await updateSessionAction(w.worldId, campaignId, id, { prep });
      if (!res.ok) return toast.error(res.error);
      setDone((d) => new Set(d).add("prep"));
      toast.success(`Saved as prep for session ${nextSession?.number ?? nextNumber}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const addScene = async (i: number) => {
    const s = briefing!.scenes[i]!;
    try {
      const id = await ensureSession();
      const res = await saveSceneAction(w.worldId, campaignId, { name: s.name, description: s.description, locationId: s.locationId, presentIds: s.presentIds, sessionId: id });
      if (!res.ok) return toast.error(res.error);
      setDone((d) => new Set(d).add(`scene-${i}`));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const addEncounter = async (i: number) => {
    const e = briefing!.encounters[i]!;
    const res = await saveEncounterAction(w.worldId, { name: e.name, description: e.description, locationId: e.locationId, campaignId });
    if (!res.ok) return toast.error(res.error);
    setDone((d) => new Set(d).add(`enc-${i}`));
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<NotebookPen />}
        title="Prepare next session"
        description={`A DM briefing for ${campaignName}, built from where the party is, what's unresolved, and what the world is doing.`}
        actions={
          <Button asChild variant="secondary">
            <Link href={`/w/${w.worldId}/campaigns/${campaignId}/run`}>
              <Clapperboard /> Run session
            </Link>
          </Button>
        }
      />
      <Panel className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="prep-focus" className="text-sm font-medium text-muted">
            Anything to focus on? (optional)
          </label>
          <Textarea id="prep-focus" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="The party plans to confront Lady Marr; I want a tense social scene and a chase" className="mt-1.5 min-h-14" />
        </div>
        <Button variant="arcane" size="lg" onClick={generate} loading={busy}>
          <Sparkles /> {briefing ? "Regenerate" : "Draft briefing"}
        </Button>
        <AiWorking active={busy} live={w.aiProvider.live} what="Claude is preparing your briefing" />
      </Panel>

      {briefing ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <article className="min-w-0 rounded-lg border border-line bg-surface p-6">
            <Markdown>{briefing.markdown}</Markdown>
          </article>
          <aside className="flex flex-col gap-4">
            <Panel className="p-4">
              <SectionTitle>Make it session prep</SectionTitle>
              <p className="mb-3 text-sm text-muted">Save this briefing to session {nextSession?.number ?? nextNumber}&rsquo;s prep so it&rsquo;s at hand in Run Session.</p>
              <Button variant="primary" onClick={savePrep} disabled={done.has("prep")} className="w-full">
                {done.has("prep") ? <Check /> : <NotebookPen />} {done.has("prep") ? "Saved to prep" : "Save as prep"}
              </Button>
            </Panel>
            {briefing.scenes.length > 0 && (
              <Panel className="p-4">
                <SectionTitle>Suggested scenes</SectionTitle>
                <ul className="flex flex-col gap-3">
                  {briefing.scenes.map((s, i) => (
                    <li key={i}>
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted">{s.description}</p>
                      <Button size="xs" variant="secondary" className="mt-1.5" onClick={() => addScene(i)} disabled={done.has(`scene-${i}`)}>
                        {done.has(`scene-${i}`) ? <Check /> : <Plus />} {done.has(`scene-${i}`) ? "Added" : "Add scene"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            {briefing.encounters.length > 0 && (
              <Panel className="p-4">
                <SectionTitle>Suggested encounters</SectionTitle>
                <ul className="flex flex-col gap-3">
                  {briefing.encounters.map((e, i) => (
                    <li key={i}>
                      <p className="text-sm font-medium">{e.name}</p>
                      <p className="text-xs text-muted">{e.description}</p>
                      <Button size="xs" variant="secondary" className="mt-1.5" onClick={() => addEncounter(i)} disabled={done.has(`enc-${i}`)}>
                        {done.has(`enc-${i}`) ? <Check /> : <Swords />} {done.has(`enc-${i}`) ? "Created" : "Create encounter"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            {briefing.provider === "offline" && <p className="text-xs text-faint">Built by the offline engine from your records. Connect an AI model for a narrative briefing.</p>}
          </aside>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line px-6 py-14 text-center">
          <p className="font-serif text-xl font-semibold">Current location, party status, relevant NPCs, active quests, unresolved mysteries and promises, nearby world threads, faction activity, likely player directions, encounters, scenes, lore and revelations.</p>
          <p className="mt-2 text-sm text-muted">Draft a briefing to see them all in one place.</p>
        </div>
      )}
    </div>
  );
}
