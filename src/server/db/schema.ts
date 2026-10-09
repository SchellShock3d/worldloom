/**
 * Worldloom database schema (PostgreSQL via Drizzle).
 *
 * Design notes (see docs/ARCHITECTURE.md for the long version):
 *  - User → Worlds → Campaigns → Sessions is the core hierarchy.
 *  - Every linkable concept is an `entities` row with a stable UUID. Typed
 *    descriptive attributes live in `entities.fields` (validated in code);
 *    queryable structure lives in columns and 1:1 extension tables
 *    (quests, world_threads, mysteries, rumours, events).
 *  - `campaign_id IS NULL` means world canon; a campaign id scopes a row to
 *    that campaign. Campaign-specific state for world entities (an NPC died in
 *    *this* campaign, the party's reputation with a faction, what the players
 *    have discovered) lives in `campaign_entity_states` so world canon is only
 *    changed when the DM commits it.
 *  - In-world time is a bigint count of minutes since the world calendar epoch.
 *  - AI never writes canon directly: it produces `proposals` grouped in
 *    `proposal_batches`; the DM approves/edits/rejects; the application applies
 *    approved proposals and records `revisions`.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { CalendarDefinition } from "@/lib/calendar";
import type { FieldDef } from "@/lib/entity-types";
import type { WorldProfile } from "@/lib/world-profile";

// ---------------------------------------------------------------------------
// Helpers & enums
// ---------------------------------------------------------------------------

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const pk = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
/** In-world time: minutes since the world calendar epoch. */
const worldTime = (name: string) => bigint(name, { mode: "number" });

export const canonStatus = pgEnum("canon_status", ["draft", "proposed", "canon", "archived"]);
export const visibility = pgEnum("visibility", ["dm_only", "secret", "partially_known", "discovered", "public"]);
export const memberRole = pgEnum("member_role", ["owner", "editor", "viewer", "player"]);
export const actorType = pgEnum("actor_type", ["user", "ai", "system"]);
export const questStatus = pgEnum("quest_status", ["unknown", "available", "active", "completed", "failed", "abandoned", "hidden"]);
export const threadStatus = pgEnum("thread_status", ["dormant", "active", "escalating", "resolved", "failed", "paused"]);
export const sessionStatus = pgEnum("session_status", ["planned", "in_progress", "completed", "processed"]);
export const proposalStatus = pgEnum("proposal_status", ["pending", "applied", "rejected", "failed"]);
export const batchStatus = pgEnum("batch_status", ["pending", "partial", "applied", "rejected"]);
export const truthStatus = pgEnum("truth_status", ["true", "false", "partial", "unknown"]);
export const playerKnowledge = pgEnum("player_knowledge", ["unknown", "rumoured", "partial", "discovered"]);

export type CanonStatus = (typeof canonStatus.enumValues)[number];
export type Visibility = (typeof visibility.enumValues)[number];
export type MemberRole = (typeof memberRole.enumValues)[number];
export type QuestStatus = (typeof questStatus.enumValues)[number];
export type ThreadStatus = (typeof threadStatus.enumValues)[number];
export type SessionStatus = (typeof sessionStatus.enumValues)[number];
export type ProposalStatus = (typeof proposalStatus.enumValues)[number];
export type TruthStatus = (typeof truthStatus.enumValues)[number];
export type PlayerKnowledge = (typeof playerKnowledge.enumValues)[number];

// ---------------------------------------------------------------------------
// Users & auth
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: pk(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  preferences: jsonb("preferences").$type<{ theme?: "light" | "dark" | "system"; lastWorldId?: string }>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    /** sha256 of the session token; the raw token only ever lives in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Worlds, membership, calendars, campaigns
// ---------------------------------------------------------------------------

export const worlds = pgTable("worlds", {
  id: pk(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  genre: text("genre").notNull().default("High fantasy"),
  tone: text("tone").notNull().default(""),
  magicLevel: text("magic_level").notNull().default("Moderate"),
  techLevel: text("tech_level").notNull().default("Medieval"),
  gameSystem: text("game_system").notNull().default("dnd5e"),
  calendarId: uuid("calendar_id").references((): AnyPgColumn => calendars.id, { onDelete: "set null" }),
  /** World clock: the latest in-world moment that canon has reached. */
  currentAt: worldTime("current_at").notNull().default(0),
  coverFileId: uuid("cover_file_id").references((): AnyPgColumn => files.id, { onDelete: "set null" }),
  settings: jsonb("settings").$type<{ aiCreativity?: "grounded" | "balanced" | "inventive"; houseRules?: string; profile?: WorldProfile; thinSpotsDismissed?: string[]; followOnHandled?: string[] }>().notNull().default({}),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Every access check goes through membership, so collaboration is a UI feature away. */
export const worldMembers = pgTable(
  "world_members",
  {
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("owner"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.userId] }), index("world_members_user_idx").on(t.userId)],
);

export const calendars = pgTable("calendars", {
  id: pk(),
  worldId: uuid("world_id")
    .notNull()
    .references((): AnyPgColumn => worlds.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  definition: jsonb("definition").$type<CalendarDefinition>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const campaigns = pgTable(
  "campaigns",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    premise: text("premise").notNull().default(""),
    status: text("status").$type<"planning" | "active" | "paused" | "completed">().notNull().default("active"),
    currentAt: worldTime("current_at").notNull().default(0),
    currentLocationId: uuid("current_location_id").references((): AnyPgColumn => entities.id, { onDelete: "set null" }),
    activeSceneId: uuid("active_scene_id").references((): AnyPgColumn => scenes.id, { onDelete: "set null" }),
    partyName: text("party_name").notNull().default("The party"),
    partyNotes: text("party_notes").notNull().default(""),
    partyInventory: text("party_inventory").notNull().default(""),
    partyFunds: text("party_funds").notNull().default(""),
    currentWeather: text("current_weather").notNull().default(""),
    weatherLocked: boolean("weather_locked").notNull().default(false),
    dmNotes: text("dm_notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("campaigns_world_idx").on(t.worldId)],
);

// ---------------------------------------------------------------------------
// Files (images, maps, audio) — storage driver is pluggable
// ---------------------------------------------------------------------------

export const files = pgTable(
  "files",
  {
    id: pk(),
    worldId: uuid("world_id").references((): AnyPgColumn => worlds.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"image" | "map" | "audio" | "other">().notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    storageKey: text("storage_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("files_world_idx").on(t.worldId)],
);

// ---------------------------------------------------------------------------
// Entities (the base of the world model)
// ---------------------------------------------------------------------------

export const customEntityTypes = pgTable(
  "custom_entity_types",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    pluralName: text("plural_name"),
    description: text("description"),
    icon: text("icon"),
    isPlace: boolean("is_place").notNull().default(false),
    fields: jsonb("fields").$type<FieldDef[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("custom_entity_types_world_key").on(t.worldId, t.key)],
);

export const entities = pgTable(
  "entities",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    /** NULL = world canon. Set = belongs to that campaign only (e.g. player characters). */
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    /** One or two sentences; used in lists, hovercards, and AI context. */
    summary: text("summary").notNull().default(""),
    /** Markdown. `:::dm … :::` blocks are DM-only; mentions are `@[Name](entity:uuid)`. */
    body: text("body").notNull().default(""),
    dmNotes: text("dm_notes").notNull().default(""),
    fields: jsonb("fields").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status"),
    /** Where this entity is (NPC → tavern, shop → town, town → region). Single source of "located in". */
    locationId: uuid("location_id").references((): AnyPgColumn => entities.id, { onDelete: "set null" }),
    /** Wiki page hierarchy (sub-articles). */
    parentId: uuid("parent_id").references((): AnyPgColumn => entities.id, { onDelete: "set null" }),
    imageFileId: uuid("image_file_id").references(() => files.id, { onDelete: "set null" }),
    canonStatus: canonStatus("canon_status").notNull().default("canon"),
    /** secret = exists but hidden until discovered; dm_only = never shown to players. */
    visibility: visibility("visibility").notNull().default("secret"),
    /** 0 = normal, 1 = important, 2 = major. Drives dashboards and AI retrieval priority. */
    importance: smallint("importance").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple'::regconfig, coalesce("name", '')), 'A') || setweight(to_tsvector('simple'::regconfig, wl_text_array("aliases")), 'A') || setweight(to_tsvector('english'::regconfig, coalesce("summary", '')), 'B') || setweight(to_tsvector('english'::regconfig, coalesce("body", '')), 'C') || setweight(to_tsvector('english'::regconfig, coalesce("dm_notes", '')), 'D')`,
    ),
  },
  (t) => [
    index("entities_world_type_idx").on(t.worldId, t.type),
    index("entities_campaign_idx").on(t.campaignId),
    index("entities_location_idx").on(t.locationId),
    index("entities_parent_idx").on(t.parentId),
    index("entities_updated_idx").on(t.worldId, t.updatedAt),
    uniqueIndex("entities_world_slug").on(t.worldId, t.slug),
    index("entities_search_idx").using("gin", t.searchVector),
    index("entities_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
  },
  (t) => [uniqueIndex("tags_world_name").on(t.worldId, t.name)],
);

export const entityTags = pgTable(
  "entity_tags",
  {
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.entityId, t.tagId] }), index("entity_tags_tag_idx").on(t.tagId)],
);

export const relationships = pgTable(
  "relationships",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    description: text("description").notNull().default(""),
    /** 1–5: how strong/important the bond is. */
    strength: smallint("strength"),
    visibility: visibility("visibility").notNull().default("secret"),
    canonStatus: canonStatus("canon_status").notNull().default("canon"),
    startAt: worldTime("start_at"),
    endAt: worldTime("end_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("relationships_source_idx").on(t.sourceId),
    index("relationships_target_idx").on(t.targetId),
    index("relationships_world_type_idx").on(t.worldId, t.type),
  ],
);

/**
 * Mentions extracted from markdown (`@[Name](entity:id)`) in entity bodies,
 * session notes, scenes, notes and consequences. Powers backlinks, "campaign
 * appearances", and the forgotten-thread detector.
 */
export const mentions = pgTable(
  "mentions",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind").$type<MentionSourceKind>().notNull(),
    sourceId: uuid("source_id").notNull(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("mentions_unique").on(t.sourceKind, t.sourceId, t.entityId),
    index("mentions_entity_idx").on(t.entityId),
  ],
);
export type MentionSourceKind = "entity" | "session" | "scene" | "note" | "consequence" | "clue";

/** Simple numeric world-state trackers (faction influence, road safety, food prices…). */
export const entityMetrics = pgTable(
  "entity_metrics",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    value: integer("value").notNull().default(50),
    min: integer("min").notNull().default(0),
    max: integer("max").notNull().default(100),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("entity_metrics_unique").on(t.entityId, t.key)],
);

// ---------------------------------------------------------------------------
// Entity extensions
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    entityId: uuid("entity_id")
      .primaryKey()
      .references(() => entities.id, { onDelete: "cascade" }),
    kind: text("kind").$type<EventKind>().notNull().default("historical"),
    startAt: worldTime("start_at").notNull(),
    endAt: worldTime("end_at"),
    precision: text("precision").$type<"year" | "month" | "day" | "minute">().notNull().default("day"),
    sessionId: uuid("session_id").references((): AnyPgColumn => gameSessions.id, { onDelete: "set null" }),
    /** How the event came to be: typed by the DM, approved from AI, etc. */
    origin: text("origin").$type<"manual" | "ai" | "advance" | "session">().notNull().default("manual"),
  },
  (t) => [index("events_start_idx").on(t.startAt)],
);
export type EventKind = "historical" | "campaign" | "world" | "character" | "faction";

export const quests = pgTable("quests", {
  entityId: uuid("entity_id")
    .primaryKey()
    .references(() => entities.id, { onDelete: "cascade" }),
  status: questStatus("status").notNull().default("available"),
  /** 0 low, 1 normal, 2 high, 3 urgent */
  priority: smallint("priority").notNull().default(1),
  giverId: uuid("giver_id").references(() => entities.id, { onDelete: "set null" }),
  threadId: uuid("thread_id").references(() => entities.id, { onDelete: "set null" }),
  rewards: text("rewards").notNull().default(""),
  prerequisites: text("prerequisites").notNull().default(""),
  consequences: text("consequences").notNull().default(""),
  /** What the players believe/know about this quest. */
  playerKnowledge: text("player_knowledge").notNull().default(""),
  completedAt: worldTime("completed_at"),
});

export const questObjectives = pgTable(
  "quest_objectives",
  {
    id: pk(),
    questId: uuid("quest_id")
      .notNull()
      .references(() => quests.entityId, { onDelete: "cascade" }),
    text: text("text").notNull(),
    status: text("status").$type<"open" | "done" | "failed">().notNull().default("open"),
    hidden: boolean("hidden").notNull().default(false),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("quest_objectives_quest_idx").on(t.questId)],
);

export const worldThreads = pgTable("world_threads", {
  entityId: uuid("entity_id")
    .primaryKey()
    .references(() => entities.id, { onDelete: "cascade" }),
  status: threadStatus("status").notNull().default("active"),
  /** 0–100 */
  progress: smallint("progress").notNull().default(0),
  /** 1–5 */
  urgency: smallint("urgency").notNull().default(3),
  /** Expected progress per in-world week if nobody intervenes. */
  momentum: smallint("momentum").notNull().default(10),
  stageIndex: integer("stage_index").notNull().default(0),
  goals: text("goals").notNull().default(""),
  nextMilestone: text("next_milestone").notNull().default(""),
  nextMilestoneAt: worldTime("next_milestone_at"),
  possibleOutcomes: text("possible_outcomes").notNull().default(""),
  triggers: text("triggers").notNull().default(""),
  startAt: worldTime("start_at"),
  lastAdvancedAt: worldTime("last_advanced_at"),
});

export const threadStages = pgTable(
  "thread_stages",
  {
    id: pk(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => worldThreads.entityId, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    reachedAt: worldTime("reached_at"),
  },
  (t) => [index("thread_stages_thread_idx").on(t.threadId)],
);

export const mysteries = pgTable("mysteries", {
  entityId: uuid("entity_id")
    .primaryKey()
    .references(() => entities.id, { onDelete: "cascade" }),
  question: text("question").notNull().default(""),
  truth: text("truth").notNull().default(""),
  status: text("status").$type<"open" | "partially_solved" | "solved" | "abandoned">().notNull().default("open"),
});

export const rumours = pgTable("rumours", {
  entityId: uuid("entity_id")
    .primaryKey()
    .references(() => entities.id, { onDelete: "cascade" }),
  claim: text("claim").notNull(),
  truth: text("truth").notNull().default(""),
  /** 0 = pure fabrication, 100 = exactly true */
  accuracy: smallint("accuracy").notNull().default(50),
  distortion: text("distortion").notNull().default(""),
  originText: text("origin_text").notNull().default(""),
  originEventId: uuid("origin_event_id").references(() => entities.id, { onDelete: "set null" }),
  startedAt: worldTime("started_at"),
  expiresAt: worldTime("expires_at"),
});

// ---------------------------------------------------------------------------
// Knowledge: world truths, NPC beliefs, player knowledge
// ---------------------------------------------------------------------------

/**
 * A fact is a statement held by someone. holder_id NULL = objective world
 * truth (the DM's ledger). A holder (NPC, faction, PC) may know a truth, hold a
 * partial version, or believe something false; `truth_ref_id` links a belief
 * back to the truth it relates to. NPC roleplay only receives that NPC's facts.
 */
export const facts = pgTable(
  "facts",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    holderId: uuid("holder_id").references(() => entities.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").references(() => entities.id, { onDelete: "set null" }),
    statement: text("statement").notNull(),
    truthStatus: truthStatus("truth_status").notNull().default("true"),
    /** 0–100: how sure the holder is. */
    confidence: smallint("confidence").notNull().default(80),
    source: text("source").notNull().default(""),
    sourceEntityId: uuid("source_entity_id").references(() => entities.id, { onDelete: "set null" }),
    truthRefId: uuid("truth_ref_id").references((): AnyPgColumn => facts.id, { onDelete: "set null" }),
    learnedAt: worldTime("learned_at"),
    learnedSessionId: uuid("learned_session_id").references((): AnyPgColumn => gameSessions.id, { onDelete: "set null" }),
    visibility: visibility("visibility").notNull().default("dm_only"),
    canonStatus: canonStatus("canon_status").notNull().default("canon"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("facts_holder_idx").on(t.holderId),
    index("facts_subject_idx").on(t.subjectId),
    index("facts_world_idx").on(t.worldId),
  ],
);

/**
 * Campaign overlay for world entities: status/location changes that happened
 * in this campaign, party reputation/attitude, and how much the players know.
 */
export const campaignEntityStates = pgTable(
  "campaign_entity_states",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    status: text("status"),
    locationId: uuid("location_id").references(() => entities.id, { onDelete: "set null" }),
    /** -100 (hostile) … +100 (devoted) toward the party */
    reputation: smallint("reputation"),
    attitude: text("attitude"),
    knowledge: playerKnowledge("knowledge").notNull().default("unknown"),
    discoveredAt: worldTime("discovered_at"),
    discoveredSessionId: uuid("discovered_session_id").references((): AnyPgColumn => gameSessions.id, { onDelete: "set null" }),
    notes: text("notes").notNull().default(""),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.entityId] }), index("ces_entity_idx").on(t.entityId)],
);

// ---------------------------------------------------------------------------
// Campaign play: sessions, scenes, clues, consequences, notes
// ---------------------------------------------------------------------------

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: pk(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull().default(""),
    status: sessionStatus("status").notNull().default("planned"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: "date" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    inWorldStartAt: worldTime("in_world_start_at"),
    inWorldEndAt: worldTime("in_world_end_at"),
    notes: text("notes").notNull().default(""),
    recap: text("recap").notNull().default(""),
    prep: text("prep").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("game_sessions_campaign_number").on(t.campaignId, t.number)],
);

export const scenes = pgTable(
  "scenes",
  {
    id: pk(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references((): AnyPgColumn => campaigns.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => gameSessions.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    locationId: uuid("location_id").references(() => entities.id, { onDelete: "set null" }),
    atTime: worldTime("at_time"),
    weather: text("weather").notNull().default(""),
    mood: text("mood").notNull().default(""),
    lighting: text("lighting").notNull().default(""),
    ambience: text("ambience").notNull().default(""),
    encounterId: uuid("encounter_id").references((): AnyPgColumn => encounters.id, { onDelete: "set null" }),
    questId: uuid("quest_id").references(() => entities.id, { onDelete: "set null" }),
    audioProfileId: uuid("audio_profile_id").references((): AnyPgColumn => audioProfiles.id, { onDelete: "set null" }),
    status: text("status").$type<"planned" | "active" | "done">().notNull().default("planned"),
    position: integer("position").notNull().default(0),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("scenes_campaign_idx").on(t.campaignId), index("scenes_session_idx").on(t.sessionId)],
);

export const sceneEntities = pgTable(
  "scene_entities",
  {
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    role: text("role").$type<"present" | "thread" | "quest">().notNull().default("present"),
  },
  (t) => [primaryKey({ columns: [t.sceneId, t.entityId] })],
);

export const clues = pgTable(
  "clues",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    mysteryId: uuid("mystery_id").references(() => mysteries.entityId, { onDelete: "cascade" }),
    questId: uuid("quest_id").references(() => entities.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    locationId: uuid("location_id").references(() => entities.id, { onDelete: "set null" }),
    sourceEntityId: uuid("source_entity_id").references(() => entities.id, { onDelete: "set null" }),
    sourceText: text("source_text").notNull().default(""),
    isRedHerring: boolean("is_red_herring").notNull().default(false),
    discovered: boolean("discovered").notNull().default(false),
    discoveredSessionId: uuid("discovered_session_id").references(() => gameSessions.id, { onDelete: "set null" }),
    discoveredAt: worldTime("discovered_at"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("clues_mystery_idx").on(t.mysteryId), index("clues_campaign_idx").on(t.campaignId)],
);

/** Which player characters know a clue. */
export const clueKnowers = pgTable(
  "clue_knowers",
  {
    clueId: uuid("clue_id")
      .notNull()
      .references(() => clues.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.clueId, t.entityId] })],
);

/**
 * Cause & effect ledger: consequences of player actions, promises NPCs made,
 * and reactions the world owes the party. Feeds Advance World and the
 * forgotten-thread detector.
 */
export const consequences = pgTable(
  "consequences",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"consequence" | "promise" | "reaction">().notNull().default("consequence"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    cause: text("cause").notNull().default(""),
    /** Who acts / owes (NPC, faction). */
    actorId: uuid("actor_id").references(() => entities.id, { onDelete: "set null" }),
    causeEventId: uuid("cause_event_id").references(() => entities.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").references(() => gameSessions.id, { onDelete: "set null" }),
    status: text("status").$type<"pending" | "foreshadowed" | "triggered" | "resolved" | "discarded">().notNull().default("pending"),
    /** 1–5 */
    severity: smallint("severity").notNull().default(2),
    dueAt: worldTime("due_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("consequences_campaign_idx").on(t.campaignId)],
);

export const notes = pgTable(
  "notes",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    pinned: boolean("pinned").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("notes_campaign_idx").on(t.campaignId)],
);

// ---------------------------------------------------------------------------
// Encounters (system-agnostic core; rules live in src/lib/game-systems)
// ---------------------------------------------------------------------------

export const encounters = pgTable(
  "encounters",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    locationId: uuid("location_id").references(() => entities.id, { onDelete: "set null" }),
    questId: uuid("quest_id").references(() => entities.id, { onDelete: "set null" }),
    rewards: text("rewards").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: text("status").$type<"draft" | "ready" | "active" | "completed">().notNull().default("ready"),
    round: integer("round").notNull().default(0),
    turnIndex: integer("turn_index").notNull().default(0),
    gameSystem: text("game_system").notNull().default("dnd5e"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("encounters_world_idx").on(t.worldId)],
);

export const encounterCombatants = pgTable(
  "encounter_combatants",
  {
    id: pk(),
    encounterId: uuid("encounter_id")
      .notNull()
      .references(() => encounters.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    side: text("side").$type<"party" | "ally" | "enemy" | "neutral">().notNull().default("enemy"),
    initiative: real("initiative"),
    initiativeBonus: integer("initiative_bonus").notNull().default(0),
    hpCurrent: integer("hp_current"),
    hpMax: integer("hp_max"),
    tempHp: integer("temp_hp").notNull().default(0),
    ac: integer("ac"),
    conditions: text("conditions").array().notNull().default(sql`'{}'::text[]`),
    notes: text("notes").notNull().default(""),
    hidden: boolean("hidden").notNull().default(false),
    defeated: boolean("defeated").notNull().default(false),
    /** System-specific numbers, e.g. { cr: "1/2", xp: 100 } for D&D 5e. */
    stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("encounter_combatants_encounter_idx").on(t.encounterId)],
);

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

export const maps = pgTable(
  "maps",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    parentMapId: uuid("parent_map_id").references((): AnyPgColumn => maps.id, { onDelete: "set null" }),
    /** The place this map depicts. */
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    imageFileId: uuid("image_file_id").references(() => files.id, { onDelete: "set null" }),
    width: integer("width"),
    height: integer("height"),
    /** Distance represented by the full map width, for later travel maths. */
    scaleDistance: real("scale_distance"),
    scaleUnit: text("scale_unit").notNull().default("miles"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("maps_world_idx").on(t.worldId), index("maps_parent_idx").on(t.parentMapId)],
);

export const mapLayers = pgTable(
  "map_layers",
  {
    id: pk(),
    mapId: uuid("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    visibleByDefault: boolean("visible_by_default").notNull().default(true),
  },
  (t) => [index("map_layers_map_idx").on(t.mapId)],
);

export const mapMarkers = pgTable(
  "map_markers",
  {
    id: pk(),
    mapId: uuid("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "cascade" }),
    layerId: uuid("layer_id").references(() => mapLayers.id, { onDelete: "set null" }),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    childMapId: uuid("child_map_id").references(() => maps.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    category: text("category").notNull().default("landmark"),
    color: text("color"),
    /** Normalised 0–1 coordinates so markers survive image resizes. */
    x: real("x").notNull(),
    y: real("y").notNull(),
    description: text("description").notNull().default(""),
    visibility: visibility("visibility").notNull().default("public"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("map_markers_map_idx").on(t.mapId), index("map_markers_entity_idx").on(t.entityId)],
);

export const mapRegions = pgTable(
  "map_regions",
  {
    id: pk(),
    mapId: uuid("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "cascade" }),
    layerId: uuid("layer_id").references(() => mapLayers.id, { onDelete: "set null" }),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#5bb3a4"),
    /** Polygon in normalised coordinates: [[x, y], …] */
    points: jsonb("points").$type<[number, number][]>().notNull(),
    visibility: visibility("visibility").notNull().default("public"),
    createdAt: createdAt(),
  },
  (t) => [index("map_regions_map_idx").on(t.mapId)],
);

// ---------------------------------------------------------------------------
// Random tables, travel, audio
// ---------------------------------------------------------------------------

export const randomTables = pgTable(
  "random_tables",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull().default("custom"),
    description: text("description").notNull().default(""),
    /** Optional: only roll this table in/around this place. */
    locationId: uuid("location_id").references(() => entities.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("random_tables_world_idx").on(t.worldId)],
);

export const randomTableEntries = pgTable(
  "random_table_entries",
  {
    id: pk(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => randomTables.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    weight: integer("weight").notNull().default(1),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("random_table_entries_table_idx").on(t.tableId)],
);

export const travelPlans = pgTable(
  "travel_plans",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    originId: uuid("origin_id").references(() => entities.id, { onDelete: "set null" }),
    destinationId: uuid("destination_id").references(() => entities.id, { onDelete: "set null" }),
    distance: real("distance"),
    distanceUnit: text("distance_unit").notNull().default("miles"),
    method: text("method").notNull().default("foot"),
    /** distance units per in-world day */
    speedPerDay: real("speed_per_day"),
    estimatedMinutes: bigint("estimated_minutes", { mode: "number" }),
    terrain: text("terrain").notNull().default(""),
    weather: text("weather").notNull().default(""),
    encounterNotes: text("encounter_notes").notNull().default(""),
    stops: jsonb("stops").$type<{ name: string; entityId?: string | null; notes?: string }[]>().notNull().default([]),
    notes: text("notes").notNull().default(""),
    status: text("status").$type<"planned" | "underway" | "arrived" | "cancelled">().notNull().default("planned"),
    departedAt: worldTime("departed_at"),
    arrivedAt: worldTime("arrived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("travel_plans_campaign_idx").on(t.campaignId)],
);

export const audioTracks = pgTable(
  "audio_tracks",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<"music" | "ambience" | "sfx">().notNull().default("music"),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    /** Optional external URL to a legally usable audio file. */
    url: text("url"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    loop: boolean("loop").notNull().default(true),
    volume: real("volume").notNull().default(0.8),
    createdAt: createdAt(),
  },
  (t) => [index("audio_tracks_world_idx").on(t.worldId)],
);

export const audioProfiles = pgTable("audio_profiles", {
  id: pk(),
  worldId: uuid("world_id")
    .notNull()
    .references(() => worlds.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  musicTrackId: uuid("music_track_id").references(() => audioTracks.id, { onDelete: "set null" }),
  ambienceTrackId: uuid("ambience_track_id").references(() => audioTracks.id, { onDelete: "set null" }),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// AI: conversations, proposals
// ---------------------------------------------------------------------------

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    /** Optional roleplay target: the NPC the assistant is voicing. */
    roleplayEntityId: uuid("roleplay_entity_id").references(() => entities.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_conversations_world_idx").on(t.worldId, t.userId)],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: pk(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    /** Entities/records that were retrieved into context for this answer. */
    contextRefs: jsonb("context_refs").$type<{ id: string; name: string; type: string }[]>().notNull().default([]),
    proposalBatchId: uuid("proposal_batch_id").references((): AnyPgColumn => proposalBatches.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("ai_messages_conversation_idx").on(t.conversationId)],
);

export const proposalBatches = pgTable(
  "proposal_batches",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    source: text("source").$type<ProposalSource>().notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    status: batchStatus("status").notNull().default("pending"),
    provider: text("provider").notNull().default("offline"),
    /** For Advance World / travel: the clock span this batch covers. */
    fromAt: worldTime("from_at"),
    toAt: worldTime("to_at"),
    sessionId: uuid("session_id").references(() => gameSessions.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("proposal_batches_world_idx").on(t.worldId, t.status)],
);
export type ProposalSource =
  | "session"
  | "advance"
  | "generate"
  | "assistant"
  | "onboarding"
  | "consequences"
  | "emergency"
  | "prep"
  | "follow_on";

export const proposals = pgTable(
  "proposals",
  {
    id: pk(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => proposalBatches.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** What the AI originally proposed, kept when the DM edits the payload. */
    originalPayload: jsonb("original_payload").$type<Record<string, unknown>>(),
    rationale: text("rationale").notNull().default(""),
    status: proposalStatus("status").notNull().default("pending"),
    position: integer("position").notNull().default(0),
    error: text("error"),
    resultRefs: jsonb("result_refs").$type<{ kind: string; id: string; label?: string }[]>().notNull().default([]),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
    appliedBy: uuid("applied_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("proposals_batch_idx").on(t.batchId)],
);

// ---------------------------------------------------------------------------
// Revision history
// ---------------------------------------------------------------------------

export const revisions = pgTable(
  "revisions",
  {
    id: pk(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    targetKind: text("target_kind").notNull(),
    targetId: uuid("target_id").notNull(),
    targetLabel: text("target_label").notNull().default(""),
    action: text("action").$type<"create" | "update" | "delete" | "advance">().notNull(),
    actorType: actorType("actor_type").notNull().default("user"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    proposalId: uuid("proposal_id").references(() => proposals.id, { onDelete: "set null" }),
    summary: text("summary").notNull().default(""),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("revisions_world_created_idx").on(t.worldId, t.createdAt),
    index("revisions_target_idx").on(t.targetKind, t.targetId),
  ],
);

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type World = typeof worlds.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Calendar = typeof calendars.$inferSelect;
export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
export type Relationship = typeof relationships.$inferSelect;
export type Fact = typeof facts.$inferSelect;
export type GameSession = typeof gameSessions.$inferSelect;
export type Scene = typeof scenes.$inferSelect;
export type Quest = typeof quests.$inferSelect;
export type WorldThread = typeof worldThreads.$inferSelect;
export type Mystery = typeof mysteries.$inferSelect;
export type Rumour = typeof rumours.$inferSelect;
export type Clue = typeof clues.$inferSelect;
export type Consequence = typeof consequences.$inferSelect;
export type Encounter = typeof encounters.$inferSelect;
export type Combatant = typeof encounterCombatants.$inferSelect;
export type MapRow = typeof maps.$inferSelect;
export type MapMarker = typeof mapMarkers.$inferSelect;
export type MapRegion = typeof mapRegions.$inferSelect;
export type ProposalBatch = typeof proposalBatches.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type Revision = typeof revisions.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type RandomTable = typeof randomTables.$inferSelect;
export type TravelPlan = typeof travelPlans.$inferSelect;
export type AudioTrack = typeof audioTracks.$inferSelect;
export type AudioProfile = typeof audioProfiles.$inferSelect;
export type CampaignEntityState = typeof campaignEntityStates.$inferSelect;
export type EventRow = typeof events.$inferSelect;
