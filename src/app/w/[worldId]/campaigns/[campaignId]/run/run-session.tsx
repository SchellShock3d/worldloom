"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleDashed, Clapperboard, CloudSun, Dices, Flag, MapPin, Music, Pencil, Play, Plus, ScrollText, ShieldUser, Sparkles, Swords, Timer, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger, Checkbox } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter, Tooltip } from "@/components/ui/overlays";
import { Switch } from "@/components/ui/primitives";
import { MarkdownEditor } from "@/components/common/markdown-editor";
import { Markdown } from "@/components/common/markdown";
import { TypeIcon } from "@/components/entity/type-icon";
import { useWorld, useNow } from "@/components/shell/world-context";
import { InitiativeTracker } from "@/components/play/initiative-tracker";
import { MusicPlayer } from "@/components/play/music-player";
import { DiceRoller, NeedSomethingNow, TableRoller } from "@/components/play/quick-tools";
import { SceneEditor, emptyScene, type SceneDraft } from "@/components/play/scene-editor";
import { ChatComposer, ChatThread, useAssistant } from "@/components/ai/assistant-drawer";
import { activateSceneAction, endSessionAction, logToSessionAction, quickAdvanceAction, updateSessionAction } from "@/server/actions/sessions";
import { setClueDiscoveredAction, toggleObjectiveAction } from "@/server/actions/play";
import { formatDate, formatTime, timeOfDay, type AdvanceUnit } from "@/lib/calendar";
import type { RunData } from "@/server/services/run-data";
import { cn } from "@/lib/utils";

export function RunSession({ campaign, data }: { campaign: { id: string; name: string; currentWeather: string; partyInventory: string }; data: RunData }) {
  const w = useWorld();
  const router = useRouter();
  const now = useNow();
  const session = data.live!;
  const [notes, setNotes] = React.useState(session.notes);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved">("idle");
  const [log, setLog] = React.useState("");
  const [title, setTitle] = React.useState(session.title);
  const [sceneDraft, setSceneDraft] = React.useState<SceneDraft | null>(null);
  const [ending, setEnding] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestNotes = React.useRef(notes);
  const base = `/w/${w.worldId}`;

  const saveNotes = React.useCallback(
    async (v: string) => {
      setSaveState("saving");
      const res = await updateSessionAction(w.worldId, campaign.id, session.id, { notes: v });
      setSaveState(res.ok ? "saved" : "idle");
      if (!res.ok) toast.error(res.error);
    },
    [w.worldId, campaign.id, session.id],
  );
  const onNotes = (v: string) => {
    setNotes(v);
    latestNotes.current = v;
    setSaveState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNotes(v), 900);
  };
  React.useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void saveNotes(latestNotes.current);
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [saveNotes]);

  const stamp = () => `${formatTime(w.calendar, now)}`;
  const addLog = async (line: string) => {
    if (!line.trim()) return;
    if (timer.current) {
      clearTimeout(timer.current);
      await saveNotes(latestNotes.current);
    }
    const res = await logToSessionAction(w.worldId, campaign.id, session.id, line, stamp());
    if (!res.ok) return toast.error(res.error);
    setNotes(res.data.notes);
    latestNotes.current = res.data.notes;
    setLog("");
  };

  const advance = async (amount: number, unit: AdvanceUnit, label: string) => {
    const res = await quickAdvanceAction(w.worldId, campaign.id, amount, unit);
    if (!res.ok) return toast.error(res.error);
    toast(`${label} pass`, { description: formatDate(w.calendar, res.data.toAt, { precision: "minute" }) });
    router.refresh();
  };

  const scene = data.activeScene;
  const toDraft = (s: RunData["scenes"][number]): SceneDraft => ({
    id: s.id,
    name: s.name,
    description: s.description,
    location: s.locationId ? { id: s.locationId, name: data.chain.find((c) => c.id === s.locationId)?.name ?? "Location", type: "location" } : null,
    present: s.entities.filter((e) => e.role === "present").map((e) => ({ id: e.id, name: e.name, type: e.type })),
    threads: s.entities.filter((e) => e.role === "thread").map((e) => ({ id: e.id, name: e.name, type: e.type })),
    quest: s.questId ? (data.quests.find((q) => q.id === s.questId) ? { id: s.questId, name: data.quests.find((q) => q.id === s.questId)!.name, type: "quest" } : null) : null,
    mood: s.mood,
    lighting: s.lighting,
    weather: s.weather,
    ambience: s.ambience,
    encounterId: s.encounterId,
    audioProfileId: s.audioProfileId,
    sessionId: s.sessionId,
  });
  const sessionScenes = data.scenes.filter((s) => s.sessionId === session.id || (!s.sessionId && s.status !== "done"));

  return (
    <div className="flex h-full flex-col">
      {/* Session bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge tone="ember">
            <span className="size-1.5 animate-pulse rounded-full bg-ember" /> Live
          </Badge>
          <span className="text-sm text-faint">Session {session.number}</span>
          <input
            aria-label="Session title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== session.title && updateSessionAction(w.worldId, campaign.id, session.id, { title })}
            placeholder="Untitled"
            className="min-w-0 max-w-64 rounded bg-transparent px-1 font-serif text-lg font-semibold outline-none hover:bg-surface-2 focus:bg-surface-2"
          />
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Timer className="size-4 text-brass" />
          <span className="font-medium tabular">{formatTime(w.calendar, now)}</span>
          <span className="text-faint">
            {timeOfDay(w.calendar, now)}, {formatDate(w.calendar, now)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(
            [
              [10, "minutes", "+10m", "10 minutes"],
              [1, "hours", "+1h", "An hour"],
              [8, "hours", "Rest", "8 hours"],
              [1, "days", "+1d", "A day"],
            ] as [number, AdvanceUnit, string, string][]
          ).map(([a, u, l, label]) => (
            <Tooltip key={l} content={`Advance ${label.toLowerCase()}`}>
              <button onClick={() => advance(a, u, label)} className="h-7 rounded border border-line px-2 text-xs font-medium tabular text-muted hover:border-line-strong hover:text-fg">
                {l}
              </button>
            </Tooltip>
          ))}
        </div>
        {campaign.currentWeather && (
          <span className="hidden items-center gap-1.5 text-sm text-muted xl:flex">
            <CloudSun className="size-4 text-brass" /> {campaign.currentWeather}
          </span>
        )}
        <div className="flex-1" />
        <Button variant="danger" size="sm" onClick={() => setEnding(true)}>
          <Flag /> End session
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)_25rem]">
        {/* Scenes */}
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-line lg:flex">
          <div className="flex items-center justify-between px-3 pb-1 pt-3">
            <h2 className="text-sm font-semibold text-muted">Scenes</h2>
            <Button variant="ghost" size="icon-sm" onClick={() => setSceneDraft(emptyScene(session.id))} aria-label="New scene">
              <Plus />
            </Button>
          </div>
          <ul className="flex flex-col gap-1 px-2">
            {sessionScenes.map((s) => (
              <li key={s.id}>
                <div className={cn("group rounded-md border px-2.5 py-2", s.id === scene?.id ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-2")}>
                  <div className="flex items-start gap-2">
                    <button
                      onClick={async () => {
                        const res = await activateSceneAction(w.worldId, campaign.id, s.id === scene?.id ? null : s.id);
                        if (!res.ok) toast.error(res.error);
                        router.refresh();
                      }}
                      className="mt-0.5 shrink-0 text-faint hover:text-accent"
                      aria-label={s.id === scene?.id ? "Deactivate scene" : "Make active scene"}
                      title={s.id === scene?.id ? "Active" : "Play this scene"}
                    >
                      {s.id === scene?.id ? <Clapperboard className="size-4 text-accent" /> : s.status === "done" ? <Check className="size-4" /> : <Play className="size-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      {(s.mood || s.entities.length > 0) && (
                        <p className="truncate text-xs text-faint">
                          {[s.mood, s.entities.filter((e) => e.role === "present").map((e) => e.name).join(", ")].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <button onClick={() => setSceneDraft(toDraft(s))} className="shrink-0 rounded p-0.5 text-faint opacity-0 hover:text-fg group-hover:opacity-100" aria-label="Edit scene">
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
            {sessionScenes.length === 0 && <li className="px-2 py-3 text-sm text-faint">No scenes planned. Add one to give the AI context.</li>}
          </ul>
          {scene && (
            <div className="mt-3 border-t border-line px-3 py-3">
              <p className="text-xs text-faint">Active scene</p>
              <p className="font-serif text-lg font-semibold leading-snug">{scene.name}</p>
              <dl className="mt-1 space-y-0.5 text-xs text-muted">
                {scene.mood && <div>Mood: {scene.mood}</div>}
                {scene.lighting && <div>Lighting: {scene.lighting}</div>}
                {scene.weather && <div>Weather: {scene.weather}</div>}
                {scene.ambience && <div>Ambience: {scene.ambience}</div>}
              </dl>
              {scene.description && (
                <div className="mt-2">
                  <Markdown refs={data.refs} variant="compact">
                    {scene.description}
                  </Markdown>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Notes */}
        <section className="flex min-h-0 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addLog(log);
              }}
              className="flex gap-2"
            >
              <Input value={log} onChange={(e) => setLog(e.target.value)} placeholder="Quick log: “Bram punched the duke” (stamped with the in-world time)" className="h-9" aria-label="Quick log" />
              <Button type="submit" variant="secondary" disabled={!log.trim()}>
                Log
              </Button>
            </form>
            <div className="flex items-center justify-between text-xs text-faint">
              <span>Session notes. Messy is fine. Use @ to link people and places so the end-of-session analysis can find them.</span>
              <span aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}</span>
            </div>
            <MarkdownEditor value={notes} onChange={onNotes} refs={data.refs} minRows={22} className="flex-1" />
            {session.prep && (
              <details className="rounded-lg border border-line bg-surface">
                <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-muted">Your prep for this session</summary>
                <div className="px-4 pb-4">
                  <Markdown refs={data.refs} variant="compact">
                    {session.prep}
                  </Markdown>
                </div>
              </details>
            )}
          </div>
        </section>

        {/* Tools */}
        <aside className="flex min-h-0 flex-col border-l border-line">
          <Tabs defaultValue={data.activeEncounter?.status === "active" ? "combat" : "here"} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="shrink-0 overflow-x-auto px-2">
              <TabsTrigger value="here">
                <Users /> Here
              </TabsTrigger>
              <TabsTrigger value="party">
                <ShieldUser /> Party
              </TabsTrigger>
              <TabsTrigger value="story">
                <ScrollText /> Story
              </TabsTrigger>
              <TabsTrigger value="combat">
                <Swords /> Combat
              </TabsTrigger>
              <TabsTrigger value="tools">
                <Dices /> Tools
              </TabsTrigger>
              <TabsTrigger value="music">
                <Music />
              </TabsTrigger>
              <TabsTrigger value="ai">
                <Sparkles />
              </TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <TabsContent value="here" className="flex flex-col gap-3">
                {data.chain.length > 0 && (
                  <p className="flex flex-wrap items-center gap-1 text-sm text-muted">
                    <MapPin className="size-3.5 text-places" />
                    {data.chain.map((c, i) => (
                      <React.Fragment key={c.id}>
                        {i > 0 && <span className="text-faint">›</span>}
                        <Link href={`${base}/e/${c.id}`} className="hover:text-fg">
                          {c.name}
                        </Link>
                      </React.Fragment>
                    ))}
                  </p>
                )}
                {data.present.length === 0 ? (
                  <p className="text-sm text-faint">{scene ? "Nobody listed in this scene. Edit the scene to add characters." : "Activate a scene to see who's here."}</p>
                ) : (
                  data.present.map((e) => {
                    const f = e.fields as Record<string, string | undefined>;
                    return (
                      <div key={e.id} className="rounded-lg border border-line bg-surface p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Link href={`${base}/e/${e.id}`} className="flex items-center gap-2 font-medium hover:text-accent">
                            <TypeIcon type={e.type} /> {e.name}
                          </Link>
                          {e.type === "npc" && (
                            <Link href={`${base}/ai?roleplay=${e.id}`} className="text-xs text-brass hover:underline">
                              Roleplay
                            </Link>
                          )}
                        </div>
                        {e.summary && <p className="mt-1 text-sm text-muted">{e.summary}</p>}
                        <dl className="mt-1.5 space-y-0.5 text-xs">
                          {f.voice && (
                            <div>
                              <dt className="inline text-faint">Voice: </dt>
                              <dd className="inline">{f.voice}</dd>
                            </div>
                          )}
                          {f.mannerisms && (
                            <div>
                              <dt className="inline text-faint">Mannerisms: </dt>
                              <dd className="inline">{f.mannerisms}</dd>
                            </div>
                          )}
                          {f.motivations && (
                            <div>
                              <dt className="inline text-faint">Wants: </dt>
                              <dd className="inline">{f.motivations}</dd>
                            </div>
                          )}
                          {f.secrets && (
                            <div className="text-ember">
                              <dt className="inline">Secret: </dt>
                              <dd className="inline">{f.secrets}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    );
                  })
                )}
              </TabsContent>

              <TabsContent value="party" className="flex flex-col gap-2">
                {data.party.map((p) => {
                  const f = p.fields as Record<string, string | number | undefined>;
                  return (
                    <Link key={p.id} href={`${base}/e/${p.id}`} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 hover:border-line-strong">
                      <TypeIcon type="pc" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-muted">{[f.className, f.level ? `lvl ${f.level}` : null, f.playerName].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="text-right text-xs tabular text-muted">
                        {f.ac ? <span className="block">AC {f.ac}</span> : null}
                        {f.passivePerception ? <span className="block">PP {f.passivePerception}</span> : null}
                      </span>
                    </Link>
                  );
                })}
                {campaign.partyInventory && (
                  <div className="mt-2 rounded-lg border border-line bg-surface p-3">
                    <p className="mb-1 text-xs text-faint">Party inventory</p>
                    <p className="whitespace-pre-line text-sm">{campaign.partyInventory}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="story" className="flex flex-col gap-4">
                <div>
                  <h3 className="mb-1.5 text-sm font-semibold">Quests</h3>
                  {data.quests.length === 0 && <p className="text-sm text-faint">No active quests.</p>}
                  {data.quests.map((q) => (
                    <div key={q.id} className="mb-2">
                      <Link href={`${base}/e/${q.id}`} className="text-sm font-medium hover:text-accent">
                        {q.name}
                      </Link>
                      <ul className="mt-0.5">
                        {q.objectives.map((o) => (
                          <li key={o.id}>
                            <button
                              className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-surface-2"
                              onClick={async () => {
                                const res = await toggleObjectiveAction(w.worldId, o.id, o.status === "done" ? "open" : "done");
                                if (!res.ok) toast.error(res.error);
                                router.refresh();
                              }}
                            >
                              {o.status === "done" ? <Check className="size-3.5 text-accent" /> : o.status === "failed" ? <X className="size-3.5 text-ember" /> : <CircleDashed className="size-3.5 text-faint" />}
                              <span className={cn(o.status !== "open" && "text-muted line-through")}>{o.text}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="mb-1.5 text-sm font-semibold">Clues</h3>
                  {data.mysteries.length === 0 && <p className="text-sm text-faint">No open mysteries.</p>}
                  {data.mysteries.map((m) => (
                    <div key={m.id} className="mb-2">
                      <Link href={`${base}/e/${m.id}`} className="text-sm font-medium hover:text-accent">
                        {m.name}
                      </Link>
                      <ul className="mt-0.5">
                        {m.clues.map((c) => (
                          <li key={c.id} className="flex items-start gap-2 px-1 py-0.5 text-sm">
                            <Checkbox
                              checked={c.discovered}
                              className="mt-0.5"
                              aria-label={c.discovered ? "Mark undiscovered" : "Mark discovered"}
                              onCheckedChange={async (v) => {
                                const res = await setClueDiscoveredAction(w.worldId, c.id, !!v, { sessionId: session.id });
                                if (!res.ok) toast.error(res.error);
                                else if (v) addLog(`Clue found: ${c.description}`);
                                router.refresh();
                              }}
                            />
                            <span className={cn(c.discovered && "text-muted")}>
                              {c.description}
                              {c.isRedHerring && <span className="ml-1 text-xs text-ember">(red herring)</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="combat" className="flex flex-col gap-3">
                {data.activeEncounter ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`${base}/encounters/${data.activeEncounter.id}`} className="font-medium hover:text-accent">
                        {data.activeEncounter.name}
                      </Link>
                    </div>
                    <InitiativeTracker
                      encounter={data.activeEncounter}
                      combatants={data.combatants}
                      partyLevels={data.party.map((p) => Number((p.fields as { level?: number }).level ?? 1))}
                      compact
                    />
                  </>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted">Launch a prepared encounter:</p>
                    {data.encounters.map((e) => (
                      <LaunchEncounter key={e.id} encounter={e} />
                    ))}
                    {data.encounters.length === 0 && <p className="text-sm text-faint">No encounters prepared.</p>}
                    <Button asChild variant="ghost" size="sm" className="self-start">
                      <Link href={`${base}/encounters?new=1`}>
                        <Plus /> New encounter
                      </Link>
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="tools" className="flex flex-col gap-5">
                <section>
                  <h3 className="mb-2 text-sm font-semibold">I need something now</h3>
                  <NeedSomethingNow onLog={addLog} columns={3} />
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Random tables</h3>
                  <TableRoller tables={data.tables} onLog={addLog} />
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Dice</h3>
                  <DiceRoller onLog={addLog} />
                </section>
              </TabsContent>

              <TabsContent value="music">
                <MusicPlayer tracks={data.tracks} profiles={data.profiles} compact initialProfileId={scene?.audioProfileId ?? null} />
              </TabsContent>

              <TabsContent value="ai" className="flex h-full flex-col">
                <SceneCopilot />
              </TabsContent>
            </div>
          </Tabs>
        </aside>
      </div>

      {sceneDraft && (
        <SceneEditor
          open={!!sceneDraft}
          onOpenChange={(o) => !o && setSceneDraft(null)}
          initial={sceneDraft}
          campaignId={campaign.id}
          encounters={data.encounters.map((e) => ({ id: e.id, name: e.name }))}
          profiles={data.profiles.map((p) => ({ id: p.id, name: p.name }))}
        />
      )}
      <EndSessionDialog open={ending} onOpenChange={setEnding} campaignId={campaign.id} sessionId={session.id} sessionNumber={session.number} hasNotes={!!notes.trim()} flush={() => saveNotes(latestNotes.current)} />
    </div>
  );
}

function LaunchEncounter({ encounter }: { encounter: { id: string; name: string; status: string } }) {
  const w = useWorld();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
      <span className="truncate text-sm">{encounter.name}</span>
      <Button
        size="xs"
        variant="secondary"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const { startEncounterAction } = await import("@/server/actions/tools");
          const res = await startEncounterAction(w.worldId, encounter.id);
          setBusy(false);
          if (!res.ok) return toast.error(res.error);
          router.refresh();
        }}
      >
        <Swords /> Start
      </Button>
    </div>
  );
}

function SceneCopilot() {
  const { messages, send, streaming, stop } = useAssistant();
  return (
    <div className="flex min-h-80 flex-col gap-3">
      {messages.length === 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-muted">Ask about the current scene. The copilot sees the active scene, who&rsquo;s present and what they know.</p>
          {["What would the people here do next?", "Describe this place in three vivid sentences", "Give me a twist for this scene"].map((p) => (
            <button key={p} onClick={() => send(p)} className="rounded-md border border-line px-2.5 py-1.5 text-left text-xs text-muted hover:text-fg">
              {p}
            </button>
          ))}
        </div>
      ) : (
        <ChatThread messages={messages} streaming={streaming} />
      )}
      <ChatComposer onSend={(t) => send(t)} streaming={streaming} onStop={stop} placeholder="Ask about this scene…" />
    </div>
  );
}

function EndSessionDialog({ open, onOpenChange, campaignId, sessionId, sessionNumber, hasNotes, flush }: { open: boolean; onOpenChange: (o: boolean) => void; campaignId: string; sessionId: string; sessionNumber: number; hasNotes: boolean; flush: () => Promise<void> }) {
  const w = useWorld();
  const router = useRouter();
  const [process, setProcess] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`End session ${sessionNumber}?`} description="The session is marked complete with today's date and the current in-world time.">
        <label className="flex items-start justify-between gap-4 rounded-lg border border-arcane/30 bg-arcane-soft/40 px-4 py-3">
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkles className="size-4 text-arcane" /> Analyse my notes
            </span>
            <span className="mt-0.5 block text-sm text-muted">Propose a recap, timeline events, NPC and quest updates, relationship and faction changes, new promises and consequences. You review everything before it becomes canon.</span>
          </span>
          <Switch checked={process && hasNotes} onCheckedChange={setProcess} disabled={!hasNotes} />
        </label>
        {!hasNotes && <p className="mt-2 text-sm text-faint">There are no notes to analyse.</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep playing
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await flush();
              const res = await endSessionAction(w.worldId, campaignId, sessionId, { process: process && hasNotes });
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              onOpenChange(false);
              if (res.data.batchId) {
                toast.success(`${res.data.accepted} updates proposed from your notes`);
                router.push(`/w/${w.worldId}/proposals/${res.data.batchId}`);
              } else {
                toast.success("Session ended");
                router.push(`/w/${w.worldId}/campaigns/${campaignId}/sessions/${sessionId}`);
              }
            }}
          >
            <Flag /> End session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

