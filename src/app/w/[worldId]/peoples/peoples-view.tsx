"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookPlus, Check, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { AiWorking } from "@/components/ai/ai-working";
import { useWorld } from "@/components/shell/world-context";
import { addCorePeoplesAction, addHomebrewPeoplesAction, suggestWorldPeoplesAction } from "@/server/actions/creator";
import type { WorldPeople } from "@/server/services/peoples";
import { PREVALENCE, PREVALENCE_CHOICES, type PeopleSuggestion, type Prevalence, type PrevalenceChoice } from "@/lib/peoples";
import { cn } from "@/lib/utils";

const TONE: Record<string, "accent" | "brass" | "neutral" | "outline"> = { Common: "accent", Uncommon: "brass", Rare: "neutral", "Very rare": "outline", Legendary: "outline" };

function PeopleList({ title, items, kind, worldId, canEdit }: { title: string; items: WorldPeople[]; kind: "race" | "class"; worldId: string; canEdit: boolean }) {
  const w = useWorld();
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {title} <span className="text-sm font-normal text-faint">{items.length}</span>
        </h2>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => w.openQuickCreate({ type: kind, defaults: { visibility: "public", fields: { source: "Homebrew", prevalence: "Uncommon" } } })}>
            <Plus /> New {kind}
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No {title.toLowerCase()} yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {items.map((p) => (
            <li key={p.id}>
              <Link href={`/w/${worldId}/e/${p.id}`} className="flex items-start gap-3 px-3 py-2.5 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{p.name}</span>
                  {p.source === "Homebrew" && <span className="ml-2 text-xs text-arcane">homebrew</span>}
                  {p.summary && <p className="line-clamp-2 text-sm text-muted">{p.summary}</p>}
                </div>
                {p.prevalence && (
                  <Badge tone={TONE[p.prevalence] ?? "neutral"} className="mt-0.5">
                    {p.prevalence}
                  </Badge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PeoplesView({
  worldId,
  canEdit,
  races,
  classes,
  missingRaces,
  missingClasses,
}: {
  worldId: string;
  canEdit: boolean;
  races: WorldPeople[];
  classes: WorldPeople[];
  missingRaces: { name: string; summary: string; suggested: PrevalenceChoice }[];
  missingClasses: { name: string; summary: string; suggested: PrevalenceChoice }[];
}) {
  const w = useWorld();
  const router = useRouter();
  const [coreOpen, setCoreOpen] = React.useState(false);
  const [choice, setChoice] = React.useState(() => ({
    races: Object.fromEntries(missingRaces.map((r) => [r.name, r.suggested])) as Record<string, PrevalenceChoice>,
    classes: Object.fromEntries(missingClasses.map((c) => [c.name, c.suggested])) as Record<string, PrevalenceChoice>,
  }));
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [ideas, setIdeas] = React.useState<PeopleSuggestion[]>([]);
  const [added, setAdded] = React.useState<Record<string, string>>({});
  const missing = missingRaces.length + missingClasses.length;

  async function addCore() {
    setSaving(true);
    const res = await addCorePeoplesAction(worldId, choice);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Added ${res.data.created} races and classes`);
    setCoreOpen(false);
    router.refresh();
  }
  async function suggest() {
    setBusy(true);
    const res = await suggestWorldPeoplesAction(worldId);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setIdeas(res.data.items);
  }
  async function add(s: PeopleSuggestion) {
    const res = await addHomebrewPeoplesAction(worldId, [s]);
    if (!res.ok) return toast.error(res.error);
    const made = res.data.created[0];
    if (made) setAdded((a) => ({ ...a, [`${s.kind}:${s.name}`]: made.id }));
    router.refresh();
  }

  const row = (kind: "races" | "classes", item: { name: string; summary: string }) => (
    <li key={item.name} className="flex items-center gap-3 py-1.5">
      <label htmlFor={`core-${item.name}`} className="min-w-0 flex-1">
        <span className="font-medium">{item.name}</span>
        <span className="block truncate text-xs text-muted">{item.summary}</span>
      </label>
      <NativeSelect id={`core-${item.name}`} value={choice[kind][item.name]} onChange={(e) => setChoice((c) => ({ ...c, [kind]: { ...c[kind], [item.name]: e.target.value as PrevalenceChoice } }))} className={cn("h-8 w-40 text-sm", choice[kind][item.name] === "Absent" && "text-faint")}>
        {PREVALENCE_CHOICES.map((p) => (
          <option key={p} value={p}>
            {p === "Absent" ? "Leave out" : p}
          </option>
        ))}
      </NativeSelect>
    </li>
  );

  return (
    <div className="flex flex-col gap-8">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {missing > 0 && (
            <Button variant={races.length + classes.length ? "secondary" : "primary"} onClick={() => setCoreOpen(true)}>
              <BookPlus /> Add D&amp;D 5e races &amp; classes
            </Button>
          )}
          <Button variant="arcane" onClick={suggest} loading={busy}>
            <Sparkles /> {ideas.length ? "Suggest more homebrew" : "Suggest homebrew for this world"}
          </Button>
        </div>
      )}
      <AiWorking active={busy} live={w.aiProvider.live} what="Claude is designing peoples for your world" typical="10–20 seconds" />

      {ideas.length > 0 && (
        <section aria-label="Homebrew ideas" className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Homebrew ideas for {w.worldName}</h2>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ideas.map((s) => {
              const id = added[`${s.kind}:${s.name}`];
              return (
                <li key={`${s.kind}:${s.name}`} className={cn("flex flex-col gap-2 rounded-lg border p-3", id ? "border-accent bg-accent-soft/40" : "border-line")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-serif text-lg font-semibold">{s.name}</span> <Badge tone={s.kind === "race" ? "brass" : "arcane"}>{s.kind === "race" ? "Race" : "Class"}</Badge>
                    </div>
                    {id ? (
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/w/${worldId}/e/${id}`}>
                          <Check /> Added
                        </Link>
                      </Button>
                    ) : (
                      <Button size="sm" variant="primary" onClick={() => add(s)}>
                        <Plus /> Add
                      </Button>
                    )}
                  </div>
                  <p className="text-sm">{s.summary}</p>
                  {s.reason && <p className="text-sm italic text-muted">{s.reason}</p>}
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <label htmlFor={`idea-${s.name}`}>How common</label>
                    <NativeSelect id={`idea-${s.name}`} value={s.prevalence} disabled={!!id} onChange={(e) => setIdeas((xs) => xs.map((x) => (x === s ? { ...x, prevalence: e.target.value as Prevalence } : x)))} className="h-8 w-32 text-sm">
                      {PREVALENCE.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </NativeSelect>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {races.length + classes.length === 0 && !ideas.length ? (
        <EmptyState title="No races or classes yet">Add the D&amp;D 5e set tuned to this world, or ask for homebrew that fits it. Either way, every NPC and town the AI makes will use them.</EmptyState>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <PeopleList title="Races" items={races} kind="race" worldId={worldId} canEdit={canEdit} />
          <PeopleList title="Classes" items={classes} kind="class" worldId={worldId} canEdit={canEdit} />
        </div>
      )}

      <Dialog open={coreOpen} onOpenChange={setCoreOpen}>
        <DialogContent title="Add D&D 5e races & classes" description="Each one is set to how common it would be in a world like yours. Change any, or leave some out." size="lg">
          <div className="grid max-h-[60vh] gap-6 overflow-y-auto pr-1 sm:grid-cols-2">
            {missingRaces.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-muted">Races</h3>
                <ul>{missingRaces.map((r) => row("races", r))}</ul>
              </div>
            )}
            {missingClasses.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-muted">Classes</h3>
                <ul>{missingClasses.map((c) => row("classes", c))}</ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCoreOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={addCore} loading={saving}>
              Add to {w.worldName}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
