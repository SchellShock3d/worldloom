/** Human-readable descriptions and edit-form layouts for proposals. */
import { formatDate, describeDuration, type CalendarDefinition } from "./calendar";
import { getEntityType } from "./entity-types";
import { relationshipLabel, RELATIONSHIP_TYPES } from "./relationship-types";
import type { ProposalKind } from "./proposals";

type Ref = { id?: string | null; ref?: string | null; name?: string } | null | undefined;
const nm = (r: Ref, fallback = "something") => r?.name || fallback;

export interface DescribedProposal {
  title: string;
  detail?: string;
  bullets?: string[];
  /** Entity ids this proposal touches (for links). */
  links?: { id: string; name: string }[];
  tone: "accent" | "brass" | "arcane" | "ember" | "neutral";
}

export function describeProposal(kind: ProposalKind, p: Record<string, any>, cal: CalendarDefinition): DescribedProposal {
  const link = (r: Ref) => (r?.id ? [{ id: r.id, name: r.name ?? "" }] : []);
  switch (kind) {
    case "create_entity": {
      const def = getEntityType(p.entity?.type ?? "lore");
      const fields = Object.entries(p.entity?.fields ?? {})
        .slice(0, 4)
        .map(([k, v]) => `${def.fields.find((f) => f.key === k)?.label ?? k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
      return { title: `New ${def.label.toLowerCase()}: ${p.entity?.name}`, detail: p.entity?.summary, bullets: fields, tone: "accent" };
    }
    case "update_entity": {
      const b: string[] = [];
      if (p.status) b.push(`Status → ${p.status}`);
      if (p.location) b.push(`Moves to ${nm(p.location)}`);
      if (p.summary) b.push(`New summary: ${p.summary}`);
      if (p.appendBody) b.push(`Adds to the article: ${String(p.appendBody).slice(0, 220)}${String(p.appendBody).length > 220 ? "…" : ""}`);
      if (p.visibility) b.push(`Visibility → ${p.visibility.replace("_", " ")}`);
      return { title: `Update ${nm(p.target)}`, bullets: b, links: link(p.target), tone: "neutral" };
    }
    case "create_relationship":
      return { title: `${nm(p.source)} ${relationshipLabel(p.type, "forward")} ${nm(p.target)}`, detail: p.description, links: [...link(p.source), ...link(p.target)], tone: "neutral" };
    case "end_relationship":
      return { title: "End a relationship", detail: p.reason, tone: "ember" };
    case "create_event":
      return {
        title: p.title,
        detail: p.summary,
        bullets: [
          `${formatDate(cal, p.startAt)}${p.kind ? ` · ${p.kind} event` : ""}`,
          ...(p.location ? [`At ${nm(p.location)}`] : []),
          ...(p.involved?.length ? [`Involving ${p.involved.map((r: Ref) => nm(r)).join(", ")}`] : []),
        ],
        links: [...link(p.location), ...(p.involved ?? []).flatMap(link)],
        tone: "brass",
      };
    case "update_thread": {
      const b: string[] = [];
      if (p.progressDelta) b.push(`Progress ${p.progressDelta > 0 ? "+" : ""}${p.progressDelta}%`);
      if (p.progress !== undefined) b.push(`Progress → ${p.progress}%`);
      if (p.status) b.push(`Status → ${p.status}`);
      if (p.nextMilestone) b.push(`Next: ${p.nextMilestone}`);
      return { title: `World thread: ${nm(p.thread)}`, bullets: b, detail: p.note, links: link(p.thread), tone: "ember" };
    }
    case "create_rumour":
      return {
        title: `Rumour: “${p.claim}”`,
        bullets: [`Accuracy ${p.accuracy}%`, ...(p.truth ? [`Truth: ${p.truth}`] : []), ...(p.circulatesIn?.length ? [`Heard in ${p.circulatesIn.map((r: Ref) => nm(r)).join(", ")}`] : [])],
        tone: "arcane",
      };
    case "create_fact":
      return {
        title: p.holder ? `${nm(p.holder)} ${p.truthStatus === "false" ? "believes" : p.truthStatus === "partial" ? "partly knows" : "knows"}: ${p.statement}` : `World truth: ${p.statement}`,
        bullets: [`Confidence ${p.confidence}%`, ...(p.subject ? [`About ${nm(p.subject)}`] : [])],
        links: [...link(p.holder), ...link(p.subject)],
        tone: "arcane",
      };
    case "quest_update":
      return {
        title: `Quest: ${nm(p.quest)}${p.status ? ` → ${p.status}` : ""}`,
        bullets: [...(p.objectives ?? []).map((o: { text: string; status: string }) => `${o.status === "done" ? "✓" : "✗"} ${o.text}`), ...(p.addObjectives ?? []).map((t: string) => `+ ${t}`)],
        links: link(p.quest),
        tone: "accent",
      };
    case "campaign_state": {
      const b: string[] = [];
      if (p.status) b.push(`Status in this campaign → ${p.status}${p.commitToCanon ? " (also world canon)" : ""}`);
      if (p.location) b.push(`Now at ${nm(p.location)}`);
      if (p.reputationDelta) b.push(`Reputation with the party ${p.reputationDelta > 0 ? "+" : ""}${p.reputationDelta}`);
      if (p.attitude) b.push(`Attitude: ${p.attitude}`);
      if (p.knowledge) b.push(`Players' knowledge → ${p.knowledge}`);
      return { title: nm(p.entity), bullets: b, links: link(p.entity), tone: "neutral" };
    }
    case "metric_change":
      return { title: `${nm(p.entity)} · ${p.label} ${p.delta > 0 ? "↑" : "↓"} ${Math.abs(p.delta)}`, detail: p.reason, links: link(p.entity), tone: p.delta > 0 ? "accent" : "ember" };
    case "create_consequence":
      return {
        title: `${p.kind === "promise" ? "Promise" : p.kind === "reaction" ? "Pending reaction" : "Consequence"}: ${p.title}`,
        detail: p.description,
        bullets: [`Severity ${p.severity}/5`, ...(p.actor ? [`Actor: ${nm(p.actor)}`] : []), ...(p.dueAt !== null && p.dueAt !== undefined ? [`Due ${formatDate(cal, p.dueAt)}`] : [])],
        links: link(p.actor),
        tone: "ember",
      };
    case "consequence_update":
      return { title: `Consequence → ${p.status}`, detail: p.note, tone: "ember" };
    case "clue_update":
      return { title: p.discovered ? "Clue discovered" : "Clue hidden again", tone: "arcane" };
    case "session_recap":
      return { title: "Session recap", detail: String(p.recap).slice(0, 600), tone: "brass" };
    case "party_inventory":
      return { title: "Party inventory", bullets: [...(p.add ?? []).map((a: string) => `+ ${a}`), ...(p.remove ?? []).map((r: string) => `− ${r}`)], tone: "neutral" };
    case "advance_clock":
      return { title: `Time passes: ${describeDuration(cal, p.toAt - p.fromAt)}`, detail: `${formatDate(cal, p.fromAt)} → ${formatDate(cal, p.toAt)}`, tone: "brass" };
    case "create_note":
      return { title: `Note: ${p.title}`, detail: String(p.body).slice(0, 300), tone: "neutral" };
  }
}

export type EditField =
  | { path: string; label: string; kind: "text" | "textarea" | "number" | "date" | "bool" | "lines" }
  | { path: string; label: string; kind: "select"; options: { value: string; label: string }[] };

const VIS = ["secret", "public", "discovered", "partially_known", "dm_only"].map((v) => ({ value: v, label: v.replace("_", " ") }));

export function editFieldsFor(kind: ProposalKind): EditField[] {
  switch (kind) {
    case "create_entity":
      return [
        { path: "entity.name", label: "Name", kind: "text" },
        { path: "entity.summary", label: "Summary", kind: "textarea" },
        { path: "entity.body", label: "Article", kind: "textarea" },
        { path: "entity.visibility", label: "Visibility", kind: "select", options: VIS },
      ];
    case "update_entity":
      return [
        { path: "status", label: "Status", kind: "text" },
        { path: "summary", label: "Summary", kind: "textarea" },
        { path: "appendBody", label: "Text to add", kind: "textarea" },
      ];
    case "create_relationship":
      return [
        { path: "type", label: "Relationship", kind: "select", options: RELATIONSHIP_TYPES.map((t) => ({ value: t.key, label: t.label })) },
        { path: "description", label: "Description", kind: "textarea" },
      ];
    case "end_relationship":
      return [{ path: "reason", label: "Reason", kind: "text" }];
    case "create_event":
      return [
        { path: "title", label: "Title", kind: "text" },
        { path: "summary", label: "Summary", kind: "textarea" },
        { path: "startAt", label: "When", kind: "date" },
        { path: "visibility", label: "Visibility", kind: "select", options: VIS },
      ];
    case "update_thread":
      return [
        { path: "progressDelta", label: "Progress change (%)", kind: "number" },
        { path: "status", label: "Status", kind: "select", options: ["", "dormant", "active", "escalating", "resolved", "failed", "paused"].map((s) => ({ value: s, label: s || "no change" })) },
        { path: "nextMilestone", label: "Next milestone", kind: "text" },
      ];
    case "create_rumour":
      return [
        { path: "title", label: "Title", kind: "text" },
        { path: "claim", label: "What people say", kind: "textarea" },
        { path: "truth", label: "The truth", kind: "textarea" },
        { path: "accuracy", label: "Accuracy (0–100)", kind: "number" },
      ];
    case "create_fact":
      return [
        { path: "statement", label: "Statement", kind: "textarea" },
        { path: "truthStatus", label: "Truth", kind: "select", options: ["true", "false", "partial", "unknown"].map((s) => ({ value: s, label: s })) },
        { path: "confidence", label: "Confidence (0–100)", kind: "number" },
      ];
    case "quest_update":
      return [
        { path: "status", label: "Status", kind: "select", options: ["", "available", "active", "completed", "failed", "abandoned", "hidden"].map((s) => ({ value: s, label: s || "no change" })) },
        { path: "addObjectives", label: "New objectives (one per line)", kind: "lines" },
      ];
    case "campaign_state":
      return [
        { path: "status", label: "Status in this campaign", kind: "text" },
        { path: "reputationDelta", label: "Reputation change", kind: "number" },
        { path: "attitude", label: "Attitude", kind: "text" },
        { path: "commitToCanon", label: "Also change world canon", kind: "bool" },
      ];
    case "metric_change":
      return [
        { path: "label", label: "Tracker", kind: "text" },
        { path: "delta", label: "Change", kind: "number" },
        { path: "reason", label: "Reason", kind: "text" },
      ];
    case "create_consequence":
      return [
        { path: "title", label: "Title", kind: "text" },
        { path: "description", label: "Description", kind: "textarea" },
        { path: "kind", label: "Kind", kind: "select", options: ["consequence", "promise", "reaction"].map((s) => ({ value: s, label: s })) },
        { path: "severity", label: "Severity (1–5)", kind: "number" },
        { path: "dueAt", label: "Due", kind: "date" },
      ];
    case "consequence_update":
      return [{ path: "status", label: "Status", kind: "select", options: ["pending", "foreshadowed", "triggered", "resolved", "discarded"].map((s) => ({ value: s, label: s })) }];
    case "clue_update":
      return [{ path: "discovered", label: "Discovered", kind: "bool" }];
    case "session_recap":
      return [{ path: "recap", label: "Recap", kind: "textarea" }];
    case "party_inventory":
      return [
        { path: "add", label: "Add (one per line)", kind: "lines" },
        { path: "remove", label: "Remove (one per line)", kind: "lines" },
      ];
    case "advance_clock":
      return [{ path: "toAt", label: "Advance to", kind: "date" }];
    case "create_note":
      return [
        { path: "title", label: "Title", kind: "text" },
        { path: "body", label: "Body", kind: "textarea" },
      ];
  }
}

export function getPath(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath<T extends Record<string, any>>(obj: T, path: string, value: unknown): T {
  const copy: any = structuredClone(obj);
  const keys = path.split(".");
  let cur = copy;
  for (const k of keys.slice(0, -1)) cur = cur[k] ??= {};
  const last = keys[keys.length - 1]!;
  if (value === "" || value === undefined) delete cur[last];
  else cur[last] = value;
  return copy;
}
