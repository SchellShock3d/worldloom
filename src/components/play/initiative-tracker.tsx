"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Dices, EyeOff, Heart, Plus, RotateCcw, Shield, Skull, Square, Swords, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Input, NativeSelect } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger, Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { Field } from "@/components/ui/input";
import { EntityPicker, type EntityOption } from "@/components/entity/entity-picker";
import { useWorld } from "@/components/shell/world-context";
import { addCombatantsAction, addPartyAction, endEncounterAction, removeCombatantAction, resetEncounterAction, startEncounterAction, stepTurnAction, updateCombatantAction } from "@/server/actions/tools";
import { DND5E } from "@/lib/game-systems/dnd5e";
import type { Combatant, Encounter } from "@/server/db/schema";
import { cn } from "@/lib/utils";

export type CombatantView = Pick<Combatant, "id" | "name" | "side" | "initiative" | "initiativeBonus" | "hpCurrent" | "hpMax" | "tempHp" | "ac" | "conditions" | "notes" | "hidden" | "defeated" | "entityId" | "stats">;

export function sortCombatants(list: CombatantView[]) {
  return [...list].sort((a, b) => (b.initiative ?? -999) - (a.initiative ?? -999) || b.initiativeBonus - a.initiativeBonus || a.name.localeCompare(b.name));
}

export function InitiativeTracker({
  encounter,
  combatants,
  partyLevels,
  compact = false,
}: {
  encounter: Pick<Encounter, "id" | "name" | "status" | "round" | "turnIndex" | "campaignId">;
  combatants: CombatantView[];
  partyLevels: number[];
  compact?: boolean;
}) {
  const w = useWorld();
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const sorted = sortCombatants(combatants);
  const active = sorted.filter((c) => !c.defeated);
  const current = encounter.status === "active" ? active[encounter.turnIndex % Math.max(1, active.length)] : undefined;
  const enemies = combatants.filter((c) => c.side === "enemy");
  const rating = DND5E.rateEncounter(partyLevels, enemies.map((e) => String((e.stats as { cr?: string }).cr ?? "")));

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    if (!res.ok) toast.error(res.error ?? "Something went wrong");
    router.refresh();
  };
  const patch = (c: CombatantView, p: Parameters<typeof updateCombatantAction>[3]) => act(updateCombatantAction(w.worldId, encounter.id, c.id, p));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {encounter.status === "active" ? (
          <>
            <Badge tone="ember">
              <Swords /> Round {encounter.round}
            </Badge>
            <Button size="sm" variant="ghost" onClick={() => act(stepTurnAction(w.worldId, encounter.id, -1))} aria-label="Previous turn">
              <ChevronLeft />
            </Button>
            <Button size="sm" variant="primary" onClick={() => act(stepTurnAction(w.worldId, encounter.id, 1))}>
              Next turn <ChevronRight />
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => act(endEncounterAction(w.worldId, encounter.id))}>
              <Square /> End
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="primary" onClick={() => act(startEncounterAction(w.worldId, encounter.id))} disabled={!combatants.length}>
              <Dices /> Roll initiative & start
            </Button>
            {encounter.status === "completed" && (
              <Button size="sm" variant="ghost" onClick={() => act(resetEncounterAction(w.worldId, encounter.id))}>
                <RotateCcw /> Reset
              </Button>
            )}
            <div className="flex-1" />
          </>
        )}
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <Plus /> Add
        </Button>
        {encounter.campaignId && (
          <Button size="sm" variant="ghost" onClick={() => act(addPartyAction(w.worldId, encounter.id, encounter.campaignId!))} title="Add the party">
            <UserPlus />
          </Button>
        )}
      </div>
      {!compact && enemies.length > 0 && (
        <p className="text-xs text-muted">
          Difficulty: <span className={cn("font-medium", rating.label === "Deadly" || rating.label === "Beyond high" ? "text-ember" : rating.label === "High" ? "text-brass" : "text-fg")}>{rating.label}</span> · {rating.xp.toLocaleString()} XP vs budget {rating.budget.low}/{rating.budget.moderate}/{rating.budget.high} (low/moderate/high, D&amp;D 2024)
        </p>
      )}
      {sorted.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-sm text-faint">No combatants yet. Add creatures from your bestiary, NPCs, or the party.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sorted.map((c) => {
            const isCurrent = current?.id === c.id;
            const hpPct = c.hpMax ? Math.max(0, Math.min(100, ((c.hpCurrent ?? 0) / c.hpMax) * 100)) : null;
            return (
              <li
                key={c.id}
                className={cn(
                  "group flex items-center gap-2 rounded-md border px-2 py-1.5",
                  isCurrent ? "border-accent bg-accent-soft" : "border-line bg-surface",
                  c.defeated && "opacity-50",
                )}
                aria-current={isCurrent ? "true" : undefined}
              >
                <InitiativeInput value={c.initiative} onCommit={(v) => patch(c, { initiative: v })} />
                <span className={cn("size-2 shrink-0 rounded-full", c.side === "party" ? "bg-accent" : c.side === "ally" ? "bg-places" : c.side === "enemy" ? "bg-ember" : "bg-faint")} aria-label={c.side} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {c.entityId ? (
                      <Link href={`/w/${w.worldId}/e/${c.entityId}`} className={cn("truncate text-sm font-medium hover:text-accent", c.defeated && "line-through")}>
                        {c.name}
                      </Link>
                    ) : (
                      <span className={cn("truncate text-sm font-medium", c.defeated && "line-through")}>{c.name}</span>
                    )}
                    {c.hidden && <EyeOff className="size-3 text-faint" aria-label="Hidden" />}
                    {c.conditions.map((cond) => (
                      <button key={cond} onClick={() => patch(c, { conditions: c.conditions.filter((x) => x !== cond) })} className="rounded bg-brass-soft px-1 text-2xs text-brass hover:line-through" title="Remove condition">
                        {cond}
                      </button>
                    ))}
                  </div>
                  {hpPct !== null && (
                    <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-surface-3">
                      <div className={cn("h-full", hpPct > 50 ? "bg-accent" : hpPct > 25 ? "bg-brass" : "bg-ember")} style={{ width: `${hpPct}%` }} />
                    </div>
                  )}
                </div>
                {c.ac !== null && (
                  <span className="flex items-center gap-0.5 text-xs tabular text-muted" title="Armor class">
                    <Shield className="size-3" /> {c.ac}
                  </span>
                )}
                <HpControl c={c} onChange={(hp, temp) => patch(c, { hpCurrent: hp, tempHp: temp, defeated: hp !== null && hp <= 0 && c.side !== "party" ? true : c.defeated })} />
                <ConditionMenu onAdd={(cond) => patch(c, { conditions: Array.from(new Set([...c.conditions, cond])) })} />
                <button onClick={() => patch(c, { defeated: !c.defeated })} className="rounded p-1 text-faint hover:text-ember" aria-label={c.defeated ? "Revive" : "Mark defeated"} title={c.defeated ? "Revive" : "Mark defeated"}>
                  <Skull className="size-3.5" />
                </button>
                {!compact && (
                  <button onClick={() => act(removeCombatantAction(w.worldId, encounter.id, c.id))} className="rounded p-1 text-faint hover-reveal hover:text-ember" aria-label="Remove">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <AddCombatantDialog open={adding} onOpenChange={setAdding} encounterId={encounter.id} onDone={() => router.refresh()} />
    </div>
  );
}

function InitiativeInput({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const [v, setV] = React.useState(value === null ? "" : String(value));
  React.useEffect(() => setV(value === null ? "" : String(value)), [value]);
  return (
    <input
      aria-label="Initiative"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = v.trim() === "" ? null : Number(v);
        if (n !== value && (n === null || !Number.isNaN(n))) onCommit(n);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="h-7 w-10 rounded border border-line bg-surface-2 text-center text-sm font-semibold tabular outline-none focus:border-accent"
      placeholder="–"
    />
  );
}

function HpControl({ c, onChange }: { c: CombatantView; onChange: (hp: number | null, temp: number) => void }) {
  const [amount, setAmount] = React.useState("");
  const apply = (sign: 1 | -1) => {
    const n = Number(amount);
    if (!n) return;
    let hp = c.hpCurrent ?? 0;
    let temp = c.tempHp;
    if (sign === -1) {
      const absorbed = Math.min(temp, n);
      temp -= absorbed;
      hp -= n - absorbed;
    } else hp = Math.min(c.hpMax ?? hp + n, hp + n);
    onChange(hp, temp);
    setAmount("");
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex h-7 min-w-14 items-center justify-center gap-1 rounded border border-line px-1.5 text-xs tabular hover:border-line-strong" aria-label={`Hit points ${c.hpCurrent ?? "?"} of ${c.hpMax ?? "?"}`}>
          <Heart className="size-3 text-ember" />
          {c.hpCurrent ?? "–"}
          {c.hpMax !== null && <span className="text-faint">/{c.hpMax}</span>}
          {c.tempHp > 0 && <span className="text-places">+{c.tempHp}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="flex flex-col gap-2">
          <Input type="number" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" onKeyDown={(e) => e.key === "Enter" && apply(-1)} />
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="danger" onClick={() => apply(-1)}>
              Damage
            </Button>
            <Button size="sm" variant="primary" onClick={() => apply(1)}>
              Heal
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onChange(c.hpCurrent, Number(amount) || 0)}>
            Set temp HP
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ConditionMenu({ onAdd }: { onAdd: (c: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="rounded p-1 text-faint hover:text-brass" aria-label="Add condition" title="Add condition">
          <Plus className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        <div className="flex flex-wrap gap-1">
          {DND5E.conditions.map((cond) => (
            <button key={cond} onClick={() => onAdd(cond)} className="rounded bg-surface-3 px-1.5 py-0.5 text-xs hover:bg-brass-soft hover:text-brass">
              {cond}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AddCombatantDialog({ open, onOpenChange, encounterId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; encounterId: string; onDone: () => void }) {
  const w = useWorld();
  const [entity, setEntity] = React.useState<EntityOption | null>(null);
  const [name, setName] = React.useState("");
  const [side, setSide] = React.useState<"enemy" | "ally" | "party" | "neutral">("enemy");
  const [count, setCount] = React.useState(1);
  const [hp, setHp] = React.useState("");
  const [ac, setAc] = React.useState("");
  const [bonus, setBonus] = React.useState("0");
  const [cr, setCr] = React.useState("");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!entity) return;
    setName(entity.name);
    // Prefill from the creature/PC stat fields.
    fetch(`/api/w/${w.worldId}/entities/${entity.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((e: { type: string; fields: Record<string, unknown> } | null) => {
        if (!e) return;
        const f = e.fields;
        const hpText = String(f.hitPoints ?? f.hpMax ?? "");
        const hpNum = Number(hpText.match(/\d+/)?.[0] ?? "");
        if (hpNum) setHp(String(hpNum));
        if (f.armorClass ?? f.ac) setAc(String(f.armorClass ?? f.ac));
        const dex = (f.abilities as { dex?: number } | undefined)?.dex;
        if (dex) setBonus(String(Math.floor((dex - 10) / 2)));
        if (f.initiativeBonus !== undefined) setBonus(String(f.initiativeBonus));
        if (f.challenge) setCr(String(f.challenge));
        setSide(e.type === "pc" ? "party" : side);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, w.worldId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add to encounter" size="md">
        <div className="flex flex-col gap-4">
          <Field label="From your world (optional)">
            <EntityPicker value={entity} onChange={setEntity} types={["creature", "npc", "pc"]} placeholder="Search bestiary, NPCs, PCs…" allowCreate={false} />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Name" htmlFor="ac-name" className="col-span-2">
              <Input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="How many" htmlFor="ac-count">
              <Input id="ac-count" type="number" min={1} max={30} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} />
            </Field>
            <Field label="Side" htmlFor="ac-side">
              <NativeSelect id="ac-side" value={side} onChange={(e) => setSide(e.target.value as typeof side)}>
                <option value="enemy">Enemy</option>
                <option value="ally">Ally</option>
                <option value="party">Party</option>
                <option value="neutral">Neutral</option>
              </NativeSelect>
            </Field>
            <Field label="HP" htmlFor="ac-hp">
              <Input id="ac-hp" type="number" value={hp} onChange={(e) => setHp(e.target.value)} />
            </Field>
            <Field label="AC" htmlFor="ac-ac">
              <Input id="ac-ac" type="number" value={ac} onChange={(e) => setAc(e.target.value)} />
            </Field>
            <Field label="Initiative bonus" htmlFor="ac-bonus">
              <Input id="ac-bonus" type="number" value={bonus} onChange={(e) => setBonus(e.target.value)} />
            </Field>
            <Field label="Challenge" htmlFor="ac-cr">
              <Input id="ac-cr" value={cr} onChange={(e) => setCr(e.target.value)} placeholder="e.g. 1/2" />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            onClick={async () => {
              if (!name.trim()) return toast.error("Give it a name.");
              setPending(true);
              const res = await addCombatantsAction(w.worldId, encounterId, {
                entityId: entity?.id ?? null,
                name,
                side,
                count,
                hpMax: hp ? Number(hp) : null,
                ac: ac ? Number(ac) : null,
                initiativeBonus: Number(bonus) || 0,
                stats: cr ? { cr } : {},
              });
              setPending(false);
              if (!res.ok) return toast.error(res.error);
              setEntity(null);
              setName("");
              setHp("");
              setAc("");
              setCr("");
              onOpenChange(false);
              onDone();
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
