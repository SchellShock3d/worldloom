"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Footprints, MapPinned, Plus, Route, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { Dialog, DialogContent, DialogFooter, ConfirmDialog } from "@/components/ui/overlays";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EntityPicker, type EntityOption } from "@/components/entity/entity-picker";
import { useWorld } from "@/components/shell/world-context";
import { arriveTravelAction, deleteTravelAction, departTravelAction, saveTravelAction } from "@/server/actions/tools";
import { describeDuration, formatDate } from "@/lib/calendar";
import type { TravelPlan } from "@/server/db/schema";
import { PLACE_TYPES } from "@/lib/entity-types";

const METHODS: Record<string, { label: string; speed: number }> = {
  foot: { label: "On foot", speed: 24 },
  horse: { label: "Horseback", speed: 40 },
  cart: { label: "Cart or wagon", speed: 18 },
  river: { label: "Riverboat", speed: 50 },
  ship: { label: "Sailing ship", speed: 72 },
  flying: { label: "Flying mount", speed: 80 },
};

export function TravelView({ campaignId, now, plans, places }: { campaignId: string; now: number; plans: TravelPlan[]; places: { id: string; name: string; type: string }[] }) {
  const w = useWorld();
  const router = useRouter();
  const [editing, setEditing] = React.useState<TravelPlan | "new" | null>(null);
  const name = (id: string | null) => places.find((p) => p.id === id)?.name ?? "—";
  const act = async (p: Promise<{ ok: boolean; error?: string; data?: unknown }>, msg?: string) => {
    const res = await p;
    if (!res.ok) return toast.error(res.error ?? "Failed");
    if (msg) toast.success(msg);
    router.refresh();
  };
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<Route />}
        title="Travel"
        description="Plan journeys: distance, method and terrain give an estimated duration. Arriving moves the clock and the party; for long trips, Advance World simulates what happens meanwhile."
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus /> Plan a journey
          </Button>
        }
      />
      {plans.length === 0 ? (
        <EmptyState icon={<Route />} title="No journeys planned" />
      ) : (
        <ul className="flex flex-col gap-3">
          {plans.map((p) => (
            <li key={p.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-serif text-xl font-semibold">
                    {p.originId ? <Link href={`/w/${w.worldId}/e/${p.originId}`} className="hover:text-accent">{name(p.originId)}</Link> : "Somewhere"}
                    <ArrowRight className="size-5 text-brass" />
                    {p.destinationId ? <Link href={`/w/${w.worldId}/e/${p.destinationId}`} className="hover:text-accent">{name(p.destinationId)}</Link> : "Somewhere"}
                  </p>
                  {p.name && <p className="text-sm text-muted">{p.name}</p>}
                  <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
                    {p.distance !== null && (
                      <span>
                        {p.distance} {p.distanceUnit}
                      </span>
                    )}
                    <span>{METHODS[p.method]?.label ?? p.method}</span>
                    {p.estimatedMinutes !== null && <span className="text-brass">about {describeDuration(w.calendar, p.estimatedMinutes)}</span>}
                    {p.terrain && <span>{p.terrain}</span>}
                  </p>
                  {p.stops.length > 0 && <p className="mt-1 text-xs text-faint">Stops: {p.stops.map((s) => s.name).join(" → ")}</p>}
                  {p.status === "underway" && p.departedAt !== null && p.estimatedMinutes !== null && <p className="mt-1 text-xs text-brass">Arrives around {formatDate(w.calendar, p.departedAt + p.estimatedMinutes)}</p>}
                  {p.status === "arrived" && p.arrivedAt !== null && <p className="mt-1 text-xs text-faint">Arrived {formatDate(w.calendar, p.arrivedAt)}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={p.status === "underway" ? "brass" : p.status === "arrived" ? "accent" : "outline"}>{p.status}</Badge>
                  {p.status === "planned" && (
                    <Button size="sm" variant="secondary" onClick={() => act(departTravelAction(w.worldId, campaignId, p.id), "The party sets out")}>
                      <Footprints /> Depart
                    </Button>
                  )}
                  {p.status !== "arrived" && (
                    <Button size="sm" variant="primary" onClick={() => act(arriveTravelAction(w.worldId, campaignId, p.id), "Arrived")}>
                      <MapPinned /> Arrive now
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button size="icon-sm" variant="ghost" aria-label="Delete journey">
                        <Trash2 />
                      </Button>
                    }
                    title="Delete this journey?"
                    onConfirm={async () => {
                      await act(deleteTravelAction(w.worldId, campaignId, p.id));
                    }}
                  />
                </div>
              </div>
              {p.encounterNotes && <p className="mt-2 text-sm">Possible encounters: {p.encounterNotes}</p>}
              {p.notes && <p className="mt-1 text-sm text-muted">{p.notes}</p>}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <TravelDialog
          plan={editing === "new" ? null : editing}
          places={places}
          campaignId={campaignId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      <p className="mt-6 text-xs text-faint">Speeds assume a full day of travel. Current date: {formatDate(w.calendar, now)}.</p>
    </div>
  );
}

function TravelDialog({ plan, places, campaignId, onClose, onSaved }: { plan: TravelPlan | null; places: { id: string; name: string; type: string }[]; campaignId: string; onClose: () => void; onSaved: () => void }) {
  const w = useWorld();
  const find = (id: string | null) => (id ? (places.find((p) => p.id === id) ?? null) : null);
  const [origin, setOrigin] = React.useState<EntityOption | null>(find(plan?.originId ?? null));
  const [dest, setDest] = React.useState<EntityOption | null>(find(plan?.destinationId ?? null));
  const [name, setName] = React.useState(plan?.name ?? "");
  const [distance, setDistance] = React.useState(plan?.distance ? String(plan.distance) : "");
  const [unit, setUnit] = React.useState(plan?.distanceUnit ?? "miles");
  const [method, setMethod] = React.useState(plan?.method ?? "foot");
  const [speed, setSpeed] = React.useState(plan?.speedPerDay ? String(plan.speedPerDay) : String(METHODS.foot!.speed));
  const [terrain, setTerrain] = React.useState(plan?.terrain ?? "");
  const [encounterNotes, setEncounterNotes] = React.useState(plan?.encounterNotes ?? "");
  const [notes, setNotes] = React.useState(plan?.notes ?? "");
  const [stops, setStops] = React.useState(plan?.stops.map((s) => s.name).join(", ") ?? "");
  const [pending, setPending] = React.useState(false);
  const days = distance && speed ? Number(distance) / Number(speed) : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={plan ? "Edit journey" : "Plan a journey"} size="lg">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From">
              <EntityPicker value={origin} onChange={setOrigin} types={PLACE_TYPES} placeholder="Origin" />
            </Field>
            <Field label="To">
              <EntityPicker value={dest} onChange={setDest} types={PLACE_TYPES} placeholder="Destination" />
            </Field>
          </div>
          <Field label="Name (optional)" htmlFor="tr-name">
            <Input id="tr-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Distance" htmlFor="tr-dist">
              <Input id="tr-dist" type="number" min={0} value={distance} onChange={(e) => setDistance(e.target.value)} />
            </Field>
            <Field label="Unit" htmlFor="tr-unit">
              <NativeSelect id="tr-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="miles">miles</option>
                <option value="km">km</option>
                <option value="leagues">leagues</option>
              </NativeSelect>
            </Field>
            <Field label="Method" htmlFor="tr-method">
              <NativeSelect
                id="tr-method"
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  setSpeed(String(METHODS[e.target.value]?.speed ?? speed));
                }}
              >
                {Object.entries(METHODS).map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={`Per day (${unit})`} htmlFor="tr-speed">
              <Input id="tr-speed" type="number" min={1} value={speed} onChange={(e) => setSpeed(e.target.value)} />
            </Field>
          </div>
          {days !== null && <p className="text-sm text-brass">Estimated: {describeDuration(w.calendar, Math.round(days * w.calendar.hoursPerDay * w.calendar.minutesPerHour))}</p>}
          <Field label="Stops (comma-separated)" htmlFor="tr-stops">
            <Input id="tr-stops" value={stops} onChange={(e) => setStops(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Terrain" htmlFor="tr-terrain">
              <Input id="tr-terrain" value={terrain} onChange={(e) => setTerrain(e.target.value)} />
            </Field>
            <Field label="Possible encounters" htmlFor="tr-enc">
              <Input id="tr-enc" value={encounterNotes} onChange={(e) => setEncounterNotes(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes" htmlFor="tr-notes">
            <Textarea id="tr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            onClick={async () => {
              setPending(true);
              const res = await saveTravelAction(
                w.worldId,
                campaignId,
                {
                  name,
                  originId: origin?.id ?? null,
                  destinationId: dest?.id ?? null,
                  distance: distance ? Number(distance) : null,
                  distanceUnit: unit,
                  method,
                  speedPerDay: speed ? Number(speed) : null,
                  terrain,
                  encounterNotes,
                  notes,
                  stops: stops.split(",").map((s) => s.trim()).filter(Boolean).map((n) => ({ name: n })),
                },
                plan?.id,
              );
              setPending(false);
              if (!res.ok) return toast.error(res.error);
              onSaved();
            }}
          >
            Save journey
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
