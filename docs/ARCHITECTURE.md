# Architecture

Worldloom treats a tabletop world as a database with history, not a pile of documents. Three ideas shape everything:

1. **The world has state.** Every person, place, faction, item, event, quest and rumour is an entity with a stable ID, typed fields, a location, relationships, a visibility level and a canon status. Time is a number.
2. **Campaigns overlay the world.** A campaign has its own clock and its own version of events. It can mark an NPC dead without killing them in world canon, and it promotes changes to canon only when the DM commits them.
3. **The AI proposes; the DM decides.** AI output never writes to canon directly. It becomes a batch of typed, validated proposals that the DM approves, edits or rejects. Approval runs the same service functions a form submit does, and records who approved.

## Layers

```
React (app/, components/)          server components read; client components call actions
        │
Server actions (server/actions/)   validate input (zod) → authorize (role + ownership) → call a service
        │
Services (server/services/)        domain rules, transactions, revision history
        │
Drizzle schema (server/db/)        PostgreSQL via postgres-js, or PGlite when DATABASE_URL is empty
```

The AI layer (`server/ai/`) sits beside the services. It reads through context builders and writes only by creating proposal batches.

`lib/` holds pure logic that both sides use: the calendar engine, entity type registry, relationship types, mention parsing, validation schemas and proposal payload schemas.

## Data model

All tables are defined in `src/server/db/schema.ts`; migrations are in `drizzle/`.

| Area | Tables | Notes |
| --- | --- | --- |
| Accounts | `users`, `auth_sessions`, `world_members` | Roles: owner > editor > viewer > player. |
| Worlds | `worlds`, `calendars`, `custom_entity_types` | A world has one calendar definition (JSON) and a clock. |
| Entities | `entities`, `tags`, `entity_tags`, `mentions`, `entity_metrics` | One table for all types. Typed `fields` are JSON validated against the type registry, plus reserved `_custom` one-off fields. A generated, weighted `tsvector` and a trigram index power search. |
| Extensions | `quests` (+ `quest_objectives`), `world_threads` (+ `thread_stages`), `mysteries`, `rumours`, `events` | 1:1 tables for types with real behaviour. |
| Links | `relationships` | Directional, typed (registry in `lib/relationship-types.ts`), with strength, dates, visibility and optional campaign scope. `entities.location_id` is the single source of "located in"; `parent_id` is the wiki hierarchy. |
| Knowledge | `facts` | `holder_id` null means world truth. Beliefs link to the truth they distort through `truth_ref_id`. Confidence, source, date learned and visibility on each. |
| Campaigns | `campaigns`, `campaign_entity_states`, `game_sessions`, `scenes` (+ `scene_entities`), `clues` (+ `clue_knowers`), `consequences`, `notes`, `travel_plans` | `campaign_entity_states` is the overlay: status, location, reputation, attitude and what the players know, per campaign. |
| Tools | `encounters` (+ `encounter_combatants`), `random_tables` (+ entries), `audio_tracks`, `audio_profiles`, `maps` (+ layers, markers, regions), `files` | |
| AI | `ai_conversations`, `ai_messages`, `proposal_batches`, `proposals` | |
| History | `revisions` | Every change: who (user, AI-approved-by-user, system), what, before and after. Restore works from here. |

### Time

In-world time is a `bigint` count of minutes since the calendar's epoch. `lib/calendar.ts` converts between minutes and dates for any calendar: months of any length, weeks of any length, intercalary festival days outside the week, leap years, eras, seasons, holidays and moon cycles. Because events store minutes, editing the calendar's structure re-maps dates by name (`services/calendar-edit.ts`) so an event on "14 Highsun" stays on 14 Highsun.

Each campaign has its own clock. The world clock follows the furthest campaign, and can be advanced on its own when no campaign is selected. Weather follows the clock unless the DM locks it.

### The AI-led world creator

`/onboarding` (`app/onboarding/spark/`) is a three-phase flow kept in the browser until the DM creates the world: a seed and vibe dials, three pitches, then a draft written section by section. `ai/tasks/spark.ts` writes pitches in two quick steps (three deliberately different one-line premises, then each expanded in parallel on the fast model) and sections on the main model, each against the pitch, the dials, the sections already written, and the DM's notes. `lib/spark-schema.ts` defines the shapes; `SECTION_DEPENDS` in `lib/spark.ts` says what each section is written from, so independent sections (land and peoples; history and the starting point) are written together. Steering a section marks the ones after it out of date, and anything about to be written on top of an out-of-date section waits until it's refreshed. `services/spark-world.ts` turns the finished draft into a world: profile and vibe, races and classes, then one change set (places nested by name, powers, ties, history, threads, the starting town and its NPCs and rumours) recorded as an approved proposal batch. Without a key, `ai/offline/spark.ts` produces the same shapes from templates; with a key, a failed section is reported rather than filled with template text.

### Build out, thin spots and follow-on changes

Build out (`app/w/[worldId]/e/[entityId]/build/`) reuses the creator's draft-and-steer loop for one existing entry. `lib/build-out.ts` holds a plan per kind of entry (a town's districts, power, places to go, people and trouble; a faction's leaders, members, holdings, ties and schemes; and so on), each section with what it's written from, how many entries to create, and its one-click nudges, plus the one generic section shape Claude returns (article text, empty fields to fill, new entries with `within` and `links` by name, links from the entry itself, rumours, hooks). `ai/tasks/build-out.ts` writes a section from the world context, the entry's card, everything already in or tied to it (`surroundings` in `services/build-out.ts`, so nothing is duplicated), and the sections written before it. The draft lives in the browser; `applyBuildOut` resolves names (to the entry, to other new entries, or to existing entries, which are linked rather than recreated), flips reversed links ("owned_by" becomes "owns" the other way), and records everything as one approved proposal batch, with the entry's article growing section by section and hooks kept in a DM block. `ai/offline/build-out.ts` gives the same shapes without a key.

`services/thin-spots.ts` finds what's only sketched in, with plain queries: settlements with no people or places to go, regions with no towns, nations with no ruler or cities, factions with no members, faiths with no gods or clergy, empty dungeons, and important or much-mentioned entries with almost nothing written. Each spot names the build-out sections that fill it; the party's surroundings rank first. Dismissed spots are kept in `worlds.settings.thinSpotsDismissed`.

`services/follow-on.ts` watches revisions for big changes (a status change, a move, archiving; for the world or one campaign) to entries that touch others, and `ai/tasks/follow-on.ts` turns one into a proposal batch of what follows. Changes made while creating content (the creator, build-outs, generators) and by follow-on batches themselves are never followed up, so nothing loops; handled changes are kept in `worlds.settings.followOnHandled`.

### World profile and peoples

The world creator stores its choices in `worlds.settings.profile` (`lib/world-profile.ts`): where magic comes from and how it's seen, the shape of the land, governments, faith, history, starting area, and the table's content limits. `worldHeader` puts a summary of it, and the limits, at the top of every AI request, including NPC roleplay.

Races and classes are ordinary entries of types `race` and `class`, with a prevalence (Common to Legendary) and a source (D&D 5e core or homebrew). `lib/peoples.ts` holds the core set, the rules that tune prevalence to genre, magic and technology, and the offline homebrew bank. `services/peoples.ts` adds them to a world and summarises them for AI context. Settlements, regions and nations have a `demographics` field; the offline generators pick NPC races from the nearest place's demographics, then from world prevalence (`racePicker` in `ai/offline/generate.ts`).

### Visibility and canon

Every entity, relationship, fact and map marker carries a visibility: `dm_only`, `secret`, `partially_known`, `discovered` or `public`. Articles can also hold `:::dm … :::` blocks. The player portal (`services/player-view.ts`) is built only from public and discovered material, with DM blocks, DM-section fields and DM-only custom fields stripped on the server.

Canon status (`draft`, `proposed`, `canon`, `archived`) separates ideas from facts. Archived entries drop out of search, context and lists.

## Access control

- `auth/session.ts`: scrypt password hashes, random session tokens stored as SHA-256 hashes in an httpOnly cookie, rate-limited login.
- `auth/access.ts`: `requireWorld` and `requireCampaign` for pages (404 on no access); `authorizeWorld`, `authorizeCampaign` and `authorizeScope` for actions (friendly errors). A campaign ID is always proven to belong to the world.
- `auth/ownership.ts`: `assertOwned` proves every client-supplied foreign ID (entities, campaigns, files, tracks and others) belongs to the same world before it's stored. Readers that follow IDs also filter by world, as a second line of defence.
- Patches go through `parsePatch`, which keeps only the keys the caller sent (zod 4 would otherwise apply defaults inside `.partial()` and reset untouched fields).
- Uploaded files are sniffed by magic bytes and served through an access-checked route with `nosniff` and a CSP sandbox.

## The AI layer

The brief names eight components. Here is where each lives:

| Component | Implementation |
| --- | --- |
| AIProvider | `ai/provider.ts` (interface and selection), `ai/anthropic.ts` (Claude, structured output and streaming). An `OfflineProvider` reports `live: false`, and tasks fall back to the deterministic engine in `ai/offline/`. |
| ContextRetriever | `retrieveEntities` in `ai/context.ts`: scores entities by explicit focus, names found in the request, the active scene and party location, and full-text matches, then adds one hop of relationships and locations. |
| WorldContextBuilder | `buildDmContext`: world header, entity cards, truths, threads, timeline, rumours, within a character budget. Never the whole database. |
| CampaignContextBuilder | `campaignSection` plus the quest, session, consequence and mystery sections, scoped to the campaign overlay. `buildNpcContext` builds the knowledge boundary for roleplay. |
| EntityGenerator | `generateContent` in `ai/tasks/world-tasks.ts`; `offlineGenerate` offline. Also `needSomethingNow` for instant table-side results. |
| SessionProcessor | `processSessionNotes`; `offlineProcessSession` offline. |
| WorldAdvancer | `advanceWorld`; `offlineAdvance` offline. |
| ContinuityAnalyzer | `continuityIssues` and `forgottenThreads` in `services/insights.ts` (deterministic), plus `runContinuity` for an optional AI pass. |

### Change sets and proposals

Generation, session processing, world advancement and lore actions all produce a **change set** (`ai/changeset.ts`): a strict JSON shape of new entities, entity updates, relationships, events, thread updates, rumours, facts, quest updates, campaign-state changes, metric changes, consequences, clue updates and inventory changes. The offline engine builds the same shape.

The model gets a simpler mirror of it, the wire format: no nullable fields (empty strings, `0` and `"unchanged"` mean "none"), and only the sections the task needs, in priority order with the summary last. Models fill a long schema top to bottom and can stop early, so the sections that matter most to a task come first. It's requested as a single tool call (`viaTool` in `ai/anthropic.ts`), validated with zod after filling defaults, and retried with the validation errors if it doesn't fit. `fromWire` converts it back. Small fixed-shape outputs (continuity notes, quick generators) use strict structured output instead.

`changeSetToDrafts` turns a change set into proposal drafts:

- IDs the model invents are dropped. Only IDs that exist in this world survive. A reference with no usable ID is matched by exact name, then alias, against this world's entries and the new entries in the same batch, and kept only when the match is unique.
- New entities get a `ref`, so other proposals in the same batch can point at them before they exist.
- Each draft is validated against the payload schema for its kind (`lib/proposals.ts`), the same schemas forms use.

`services/proposals.ts` stores the batch. On approval, each proposal is claimed atomically (so a double click can't apply it twice), applied in its own transaction through the normal services, and recorded in `revisions` with actor type `ai` and the approving user. The "What Changed?" view (`/proposals/[batchId]/changes`) reads those revisions back.

### Offline engine

`ai/offline/` makes every AI feature work without a key:

- **advance.ts** moves threads by momentum, turns stage boundaries into events, lands due consequences, ends journeys, shifts faction influence and place safety, and spreads distorted rumours. Dead characters and destroyed factions don't act.
- **session.ts** reads notes for deaths, captures, help and harm, grudges, promises, quest progress, discoveries and items, using `@mentions` and plain names, including names written without a title.
- **generate.ts** and **banks.ts** build names, NPCs, places, shops, taverns, rumours and more, using the world's own name lists and random tables.
- **answer.ts** answers questions from records.

It is deterministic for a given input, so tests can assert on it.

## Search

`services/search.ts` combines the weighted `tsvector` (name, aliases, summary, body) with `pg_trgm` similarity for typos and partial names. The ⌘K palette, the entity picker and AI retrieval all use it.

## Testing

- `tests/`: Vitest suites run against a fresh in-memory PGlite with migrations applied, and the offline AI. They cover entity rules, partial updates, world isolation, export and import, the critical flows from the brief (advance, approve, session processing, roleplay limits, player visibility) and living-world behaviour (the dead stay dead, weather, travel, encounters).
- `e2e/`: Playwright against a production build with a throwaway database: sign up, create a world and campaign, create linked entries and find them, run and process a session, advance the world, and render every main screen.
