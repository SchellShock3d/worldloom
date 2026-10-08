/**
 * Input schemas shared by forms, server actions, import, and AI proposal
 * validation. AI output is parsed with exactly the same schemas a human form
 * submission goes through.
 */
import { z } from "zod";

export const uuid = z.string().uuid();

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/**
 * Keep only the keys the caller actually sent. zod 4 applies `.default()`
 * values even inside `.partial()`/`.optional()`, which would make every patch
 * silently reset untouched fields (summary, visibility, tags…) to defaults.
 */
export function onlySent<T>(parsed: T, raw: unknown): T {
  if (!isPlainObject(parsed) || !isPlainObject(raw)) return parsed;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (raw[k] === undefined) continue;
    out[k] = onlySent(v, raw[k]);
  }
  return out as T;
}

/** Parse an update payload: validate with the partial schema, keep only sent keys. */
export function parsePatch<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  return onlySent(schema.parse(raw), raw);
}
const optUuid = z.string().uuid().nullable().optional();
const worldTime = z.number().int().finite();
const optTime = worldTime.nullable().optional();

export const visibilityEnum = z.enum(["dm_only", "secret", "partially_known", "discovered", "public"]);
export const canonEnum = z.enum(["draft", "proposed", "canon", "archived"]);
export const questStatusEnum = z.enum(["unknown", "available", "active", "completed", "failed", "abandoned", "hidden"]);
export const threadStatusEnum = z.enum(["dormant", "active", "escalating", "resolved", "failed", "paused"]);
export const truthEnum = z.enum(["true", "false", "partial", "unknown"]);
export const eventKindEnum = z.enum(["historical", "campaign", "world", "character", "faction"]);
export const precisionEnum = z.enum(["year", "month", "day", "minute"]);
export const knowledgeEnum = z.enum(["unknown", "rumoured", "partial", "discovered"]);

// ---------------------------------------------------------------------------
// Worlds & campaigns
// ---------------------------------------------------------------------------

export const worldInput = z.object({
  name: z.string().trim().min(1, "Give your world a name").max(120),
  genre: z.string().trim().max(80).default("High fantasy"),
  tone: z.string().trim().max(200).default(""),
  magicLevel: z.string().trim().max(60).default("Moderate"),
  techLevel: z.string().trim().max(60).default("Medieval"),
  description: z.string().trim().max(5000).default(""),
  calendarPreset: z.string().max(40).optional(),
  startYear: z.number().int().min(-100000).max(100000).optional(),
});
export type WorldInput = z.infer<typeof worldInput>;

export const campaignInput = z.object({
  name: z.string().trim().min(1, "Give your campaign a name").max(120),
  premise: z.string().trim().max(5000).default(""),
  partyName: z.string().trim().max(120).optional(),
  startingLocationId: optUuid,
  status: z.enum(["planning", "active", "paused", "completed"]).optional(),
});
export type CampaignInput = z.infer<typeof campaignInput>;

/** Fields a DM may change on a campaign after creation (time moves through the clock services). */
export const campaignPatch = z.object({
  name: z.string().trim().min(1).max(120),
  premise: z.string().max(5000),
  status: z.enum(["planning", "active", "paused", "completed"]),
  partyName: z.string().trim().min(1).max(120),
  partyNotes: z.string().max(50000),
  partyInventory: z.string().max(50000),
  partyFunds: z.string().max(500),
  currentWeather: z.string().max(300),
  weatherLocked: z.boolean(),
  dmNotes: z.string().max(200000),
  currentLocationId: optUuid,
  activeSceneId: optUuid,
}).partial();
export type CampaignPatchInput = z.input<typeof campaignPatch>;

// ---------------------------------------------------------------------------
// Entity extensions
// ---------------------------------------------------------------------------

export const questExtension = z.object({
  status: questStatusEnum.default("available"),
  priority: z.number().int().min(0).max(3).default(1),
  giverId: optUuid,
  threadId: optUuid,
  rewards: z.string().max(5000).default(""),
  prerequisites: z.string().max(5000).default(""),
  consequences: z.string().max(5000).default(""),
  playerKnowledge: z.string().max(5000).default(""),
  objectives: z
    .array(z.object({ text: z.string().trim().min(1).max(500), status: z.enum(["open", "done", "failed"]).default("open"), hidden: z.boolean().default(false) }))
    .max(50)
    .default([]),
});

export const threadExtension = z.object({
  status: threadStatusEnum.default("active"),
  progress: z.number().int().min(0).max(100).default(0),
  urgency: z.number().int().min(1).max(5).default(3),
  momentum: z.number().int().min(0).max(100).default(10),
  goals: z.string().max(5000).default(""),
  nextMilestone: z.string().max(1000).default(""),
  nextMilestoneAt: optTime,
  possibleOutcomes: z.string().max(5000).default(""),
  triggers: z.string().max(5000).default(""),
  startAt: optTime,
  stageIndex: z.number().int().min(0).default(0),
  stages: z.array(z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(2000).default("") })).max(20).default([]),
});

export const mysteryExtension = z.object({
  question: z.string().max(1000).default(""),
  truth: z.string().max(10000).default(""),
  status: z.enum(["open", "partially_solved", "solved", "abandoned"]).default("open"),
});

export const rumourExtension = z.object({
  claim: z.string().trim().min(1).max(2000),
  truth: z.string().max(5000).default(""),
  accuracy: z.number().int().min(0).max(100).default(50),
  distortion: z.string().max(2000).default(""),
  originText: z.string().max(1000).default(""),
  originEventId: optUuid,
  startedAt: optTime,
  expiresAt: optTime,
});

export const eventExtension = z.object({
  kind: eventKindEnum.default("historical"),
  startAt: worldTime,
  endAt: optTime,
  precision: precisionEnum.default("day"),
  sessionId: optUuid,
  origin: z.enum(["manual", "ai", "advance", "session"]).default("manual"),
});

export type QuestExtension = z.infer<typeof questExtension>;
export type ThreadExtension = z.infer<typeof threadExtension>;
export type MysteryExtension = z.infer<typeof mysteryExtension>;
export type RumourExtension = z.infer<typeof rumourExtension>;
export type EventExtension = z.infer<typeof eventExtension>;

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export const entityInput = z.object({
  type: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1, "Name is required").max(200),
  summary: z.string().max(2000).default(""),
  body: z.string().max(200000).default(""),
  dmNotes: z.string().max(100000).default(""),
  aliases: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  fields: z.record(z.string(), z.unknown()).default({}),
  status: z.string().trim().max(60).nullable().optional(),
  locationId: optUuid,
  parentId: optUuid,
  campaignId: optUuid,
  imageFileId: optUuid,
  canonStatus: canonEnum.default("canon"),
  visibility: visibilityEnum.default("secret"),
  importance: z.number().int().min(0).max(2).default(0),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  quest: questExtension.optional(),
  thread: threadExtension.optional(),
  mystery: mysteryExtension.optional(),
  rumour: rumourExtension.optional(),
  event: eventExtension.optional(),
});
export type EntityInput = z.input<typeof entityInput>;
export type EntityInputParsed = z.infer<typeof entityInput>;

export const entityPatch = entityInput
  .omit({ type: true, quest: true, thread: true, mystery: true, rumour: true, event: true })
  .partial()
  .extend({
    quest: questExtension.partial().optional(),
    thread: threadExtension.partial().optional(),
    mystery: mysteryExtension.partial().optional(),
    rumour: rumourExtension.partial().optional(),
    event: eventExtension.partial().optional(),
  });
export type EntityPatch = z.input<typeof entityPatch>;

// ---------------------------------------------------------------------------
// Relationships & knowledge
// ---------------------------------------------------------------------------

export const relationshipInput = z.object({
  sourceId: uuid,
  targetId: uuid,
  type: z.string().trim().min(1).max(60),
  description: z.string().max(2000).default(""),
  strength: z.number().int().min(1).max(5).nullable().optional(),
  visibility: visibilityEnum.default("secret"),
  canonStatus: canonEnum.default("canon"),
  startAt: optTime,
  endAt: optTime,
  campaignId: optUuid,
});
export type RelationshipInput = z.input<typeof relationshipInput>;

export const factInput = z.object({
  holderId: optUuid,
  subjectId: optUuid,
  statement: z.string().trim().min(1).max(2000),
  truthStatus: truthEnum.default("true"),
  confidence: z.number().int().min(0).max(100).default(80),
  source: z.string().max(500).default(""),
  sourceEntityId: optUuid,
  truthRefId: optUuid,
  learnedAt: optTime,
  learnedSessionId: optUuid,
  campaignId: optUuid,
  visibility: visibilityEnum.default("dm_only"),
});
export type FactInput = z.input<typeof factInput>;

export const campaignStateInput = z.object({
  entityId: uuid,
  status: z.string().max(60).nullable().optional(),
  locationId: optUuid,
  reputation: z.number().int().min(-100).max(100).nullable().optional(),
  attitude: z.string().max(200).nullable().optional(),
  knowledge: knowledgeEnum.optional(),
  notes: z.string().max(5000).optional(),
});
export type CampaignStateInput = z.input<typeof campaignStateInput>;

export const consequenceInput = z.object({
  kind: z.enum(["consequence", "promise", "reaction"]).default("consequence"),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).default(""),
  cause: z.string().max(2000).default(""),
  actorId: optUuid,
  causeEventId: optUuid,
  sessionId: optUuid,
  status: z.enum(["pending", "foreshadowed", "triggered", "resolved", "discarded"]).default("pending"),
  severity: z.number().int().min(1).max(5).default(2),
  dueAt: optTime,
});
export type ConsequenceInput = z.input<typeof consequenceInput>;

export const clueInput = z.object({
  mysteryId: optUuid,
  questId: optUuid,
  description: z.string().trim().min(1).max(2000),
  locationId: optUuid,
  sourceEntityId: optUuid,
  sourceText: z.string().max(500).default(""),
  isRedHerring: z.boolean().default(false),
  discovered: z.boolean().default(false),
});
export type ClueInput = z.input<typeof clueInput>;
