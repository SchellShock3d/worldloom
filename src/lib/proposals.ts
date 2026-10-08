/**
 * Proposal kinds: the only way AI output can change the world.
 *
 * AI proposes → application validates (these schemas) → DM approves/edits/rejects
 * → application executes (src/server/services/proposals.ts). Each kind maps to
 * one well-defined service call; there is no "run arbitrary SQL" kind.
 *
 * `ref` fields let one batch create something and refer to it in a later
 * proposal (e.g. create an NPC, then make them a member of a new faction).
 */
import { z } from "zod";
import { entityInput, eventKindEnum, knowledgeEnum, questStatusEnum, threadStatusEnum, truthEnum, visibilityEnum } from "./validation";

const id = z.string().uuid();
const ref = z.string().min(1).max(60);
/** An entity reference: an existing id, or a ref to something created earlier in the batch. */
export const entityRef = z.object({ id: id.nullable().optional(), ref: ref.nullable().optional(), name: z.string().max(200).optional() }).refine((v) => !!v.id || !!v.ref, "Needs an id or ref");
export type EntityRefValue = z.infer<typeof entityRef>;

export const proposalPayloads = {
  create_entity: z.object({
    ref: ref.optional(),
    entity: entityInput,
  }),
  update_entity: z.object({
    target: entityRef,
    summary: z.string().max(2000).optional(),
    appendBody: z.string().max(20000).optional(),
    status: z.string().max(60).optional(),
    location: entityRef.nullable().optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
    importance: z.number().int().min(0).max(2).optional(),
    visibility: visibilityEnum.optional(),
  }),
  create_relationship: z.object({
    source: entityRef,
    target: entityRef,
    type: z.string().min(1).max(60),
    description: z.string().max(2000).default(""),
    strength: z.number().int().min(1).max(5).nullable().optional(),
    campaignScoped: z.boolean().default(false),
  }),
  end_relationship: z.object({
    relationshipId: id,
    reason: z.string().max(500).default(""),
  }),
  create_event: z.object({
    ref: ref.optional(),
    title: z.string().trim().min(1).max(200),
    summary: z.string().max(2000).default(""),
    kind: eventKindEnum.default("world"),
    startAt: z.number().int(),
    endAt: z.number().int().nullable().optional(),
    location: entityRef.nullable().optional(),
    involved: z.array(entityRef).max(20).default([]),
    visibility: visibilityEnum.default("secret"),
    campaignScoped: z.boolean().default(false),
  }),
  update_thread: z.object({
    thread: entityRef,
    progressDelta: z.number().int().min(-100).max(100).optional(),
    progress: z.number().int().min(0).max(100).optional(),
    status: threadStatusEnum.optional(),
    nextMilestone: z.string().max(1000).optional(),
    note: z.string().max(1000).default(""),
  }),
  create_rumour: z.object({
    ref: ref.optional(),
    title: z.string().trim().min(1).max(200),
    claim: z.string().trim().min(1).max(2000),
    truth: z.string().max(2000).default(""),
    accuracy: z.number().int().min(0).max(100).default(50),
    distortion: z.string().max(1000).default(""),
    originEvent: entityRef.nullable().optional(),
    circulatesIn: z.array(entityRef).max(10).default([]),
    spreadBy: z.array(entityRef).max(10).default([]),
  }),
  create_fact: z.object({
    holder: entityRef.nullable().optional(),
    subject: entityRef.nullable().optional(),
    statement: z.string().trim().min(1).max(2000),
    truthStatus: truthEnum.default("true"),
    confidence: z.number().int().min(0).max(100).default(80),
    source: z.string().max(500).default(""),
    campaignScoped: z.boolean().default(true),
  }),
  quest_update: z.object({
    quest: entityRef,
    status: questStatusEnum.optional(),
    objectives: z.array(z.object({ text: z.string().min(1).max(500), status: z.enum(["open", "done", "failed"]) })).max(30).default([]),
    addObjectives: z.array(z.string().min(1).max(500)).max(20).default([]),
    note: z.string().max(1000).default(""),
  }),
  campaign_state: z.object({
    entity: entityRef,
    status: z.string().max(60).optional(),
    location: entityRef.nullable().optional(),
    reputationDelta: z.number().int().min(-100).max(100).optional(),
    attitude: z.string().max(200).optional(),
    knowledge: knowledgeEnum.optional(),
    /** Also write status/location to world canon. */
    commitToCanon: z.boolean().default(false),
    note: z.string().max(1000).default(""),
  }),
  metric_change: z.object({
    entity: entityRef,
    label: z.string().trim().min(1).max(60),
    delta: z.number().int().min(-100).max(100),
    reason: z.string().max(500).default(""),
  }),
  create_consequence: z.object({
    kind: z.enum(["consequence", "promise", "reaction"]).default("consequence"),
    title: z.string().trim().min(1).max(300),
    description: z.string().max(5000).default(""),
    cause: z.string().max(2000).default(""),
    actor: entityRef.nullable().optional(),
    severity: z.number().int().min(1).max(5).default(2),
    dueAt: z.number().int().nullable().optional(),
  }),
  consequence_update: z.object({
    consequenceId: id,
    status: z.enum(["pending", "foreshadowed", "triggered", "resolved", "discarded"]),
    note: z.string().max(1000).default(""),
  }),
  clue_update: z.object({
    clueId: id,
    discovered: z.boolean(),
  }),
  session_recap: z.object({
    sessionId: id,
    recap: z.string().trim().min(1).max(20000),
  }),
  party_inventory: z.object({
    add: z.array(z.string().min(1).max(300)).max(40).default([]),
    remove: z.array(z.string().min(1).max(300)).max(40).default([]),
  }),
  advance_clock: z.object({
    fromAt: z.number().int(),
    toAt: z.number().int(),
    /** Journeys that end inside this span: approving marks them arrived and moves the party. */
    arrivals: z.array(z.object({ travelId: z.string().uuid(), destinationId: z.string().uuid().nullable(), name: z.string().max(200) })).max(20).optional(),
  }),
  create_note: z.object({
    title: z.string().trim().min(1).max(200),
    body: z.string().max(20000),
  }),
} as const;

export type ProposalKind = keyof typeof proposalPayloads;
export const PROPOSAL_KINDS = Object.keys(proposalPayloads) as ProposalKind[];
export type ProposalPayload<K extends ProposalKind> = z.infer<(typeof proposalPayloads)[K]>;

export interface ProposalDraft<K extends ProposalKind = ProposalKind> {
  kind: K;
  payload: z.input<(typeof proposalPayloads)[K]>;
  rationale?: string;
}

export function isProposalKind(k: string): k is ProposalKind {
  return k in proposalPayloads;
}

/** Validate a draft; returns the parsed payload or an error message. */
export function validateProposal(kind: string, payload: unknown): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (!isProposalKind(kind)) return { ok: false, error: `Unknown proposal kind "${kind}"` };
  const r = proposalPayloads[kind].safeParse(payload);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, error: i ? `${i.path.join(".") || "payload"}: ${i.message}` : "Invalid payload" };
  }
  return { ok: true, payload: r.data as Record<string, unknown> };
}

export const PROPOSAL_LABELS: Record<ProposalKind, string> = {
  create_entity: "New",
  update_entity: "Update",
  create_relationship: "New relationship",
  end_relationship: "End relationship",
  create_event: "Timeline event",
  update_thread: "World thread",
  create_rumour: "Rumour",
  create_fact: "Knowledge",
  quest_update: "Quest progress",
  campaign_state: "Campaign state",
  metric_change: "World state",
  create_consequence: "Consequence",
  consequence_update: "Consequence",
  clue_update: "Clue",
  session_recap: "Session recap",
  party_inventory: "Party inventory",
  advance_clock: "Time passes",
  create_note: "Note",
};

/** Category used to group proposals in review screens. */
export function proposalGroup(kind: ProposalKind): "time" | "world" | "people" | "story" | "knowledge" | "party" {
  switch (kind) {
    case "advance_clock":
      return "time";
    case "create_event":
    case "update_thread":
    case "metric_change":
    case "create_rumour":
      return "world";
    case "create_entity":
    case "update_entity":
    case "create_relationship":
    case "end_relationship":
    case "campaign_state":
      return "people";
    case "quest_update":
    case "create_consequence":
    case "consequence_update":
    case "clue_update":
    case "session_recap":
      return "story";
    case "create_fact":
    case "create_note":
      return "knowledge";
    case "party_inventory":
      return "party";
  }
}
