# Worldloom

A living-world manager for Dungeon Masters. Your world has state: people, places, factions, time, knowledge and consequences. Campaigns run inside it, sessions change it, and time moves it forward. AI is the intelligence layer on top. It reads your world, proposes changes, and nothing becomes canon until you approve it.

Built with Next.js 15, React 19, TypeScript, Drizzle ORM and PostgreSQL.

## Quick start

```bash
npm install
npm start              # http://localhost:3000
```

`npm start` runs Worldloom in fast mode. The first run (and the first run after you update the code) builds the app, which takes a couple of minutes; after that it starts in about a second and pages load in a fraction of a second. Use `npm run dev` only when you're changing the code: development mode recompiles each page on first visit and is many times slower.

You don't need a database server. With no `DATABASE_URL`, Worldloom runs an embedded PostgreSQL (PGlite) in `./.data/pglite`, and migrations run automatically on first use.

1. Open http://localhost:3000 and create an account.
2. Give Claude a spark (a phrase, a mood, or nothing) and set the vibe dials. Pick one of three pitches, blend two, or ask for variations. Claude then writes the world section by section (the world, the land, peoples, powers, history, where play begins) while you keep, redo or steer each part, and **Create this world** turns it all into linked entries. Prefer to write it yourself? **I'd rather fill it in myself** opens the step-by-step form. You can also open the demo world from the home screen ("The Shattered Crown", a fully populated example).
3. Create a campaign, then press **Run session**.

Every AI feature works without an API key through a built-in rule-based engine. For full AI (grounded answers, NPC roleplay, rich generation, deep continuity review), add an Anthropic key:

```bash
cp .env.example .env.local
# then set ANTHROPIC_API_KEY=...
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | empty | A Postgres connection string (Supabase, Neon, RDS, your own). Empty uses embedded PGlite. |
| `PGLITE_DIR` | `./.data/pglite` | Where the embedded database lives. |
| `AUTO_MIGRATE` | `true` | Apply pending migrations on first database access. |
| `ANTHROPIC_API_KEY` | empty | Enables live AI through Claude. |
| `AI_PROVIDER` | auto | `anthropic` or `offline`. Auto picks Anthropic when a key is set. |
| `AI_MODEL` | `claude-sonnet-5-5` | Model for generation, analysis and chat. |
| `AI_FAST_MODEL` | `claude-haiku-4-5-20251001` | Model for "I need something now" quick generators. |
| `AI_DEBUG_DIR` | unset | If set, every raw structured response from Claude is saved here as JSON, for prompt tuning. Leave unset in production. |
| `UPLOAD_DIR` | `./.data/uploads` | Where uploaded maps, images and audio are stored. |
| `PORT` | `3000` | Port for `npm start`. |
| `INSECURE_COOKIES` | unset | Rarely needed: sign-in cookies already follow the connection (secure over HTTPS, plain over `http://localhost` or a LAN address). Set to `true` to force non-secure cookies behind a proxy that hides the protocol. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Fast mode: builds if the code changed since the last build, then serves on port 3000. Use this to play. |
| `npm run dev` | Development server (Turbopack) for working on the code. |
| `npm run build` / `npm run serve` | Build and serve separately (what `npm start` does for you). |
| `npm run typecheck` | TypeScript, strict. |
| `npm test` | Unit and integration tests (Vitest, in-memory Postgres, offline AI). |
| `npm run test:e2e` | Browser tests of the critical flows (Playwright, production build, throwaway database). |
| `npm run db:migrate` | Apply migrations explicitly. |
| `npm run db:generate` | Generate a migration after changing `src/server/db/schema.ts`. |
| `npm run db:seed -- you@example.com [password]` | Add the demo world to an account (creating the account if you pass a password). |
| `npx tsx scripts/live-ai-check.ts [out.json] [only=generate,session]` | Run every AI feature against a throwaway copy of the demo world with your real key, print a summary and save the full output. Uses a few dollars of API credit at most. |

The demo world is never added to an account unless someone asks for it: from the home screen or with `db:seed`.

## What's in it

**The world**
- An AI-led world creator: from a spark and four vibe dials (hopeful ↔ grim, grounded ↔ wild, familiar ↔ strange, small-scale ↔ epic), Claude pitches three worlds, then writes the one you choose section by section. You steer with one-click nudges ("darker", "more islands and sea", "add a secret society"), your own notes, redo, or by removing anything you don't want; sections that depend on something you changed are updated before anything new is built on them. Works offline with the built-in engine too.
- A step-by-step form for DMs who'd rather write it themselves: genre, tone, magic, technology, the land, peoples, governments, faith, history, where play begins, and content to keep out, with a Suggest button on every text field.
- Races and classes: the D&D 5e core set tuned to your world (a low-magic world makes wizards rare), plus homebrew that grows out of your setting (artificers and clockwork folk in a steampunk world, planeswalkers when magic is high). Places carry demographics ("Human 60%, Dwarf 25%…"), and the AI and generators use them when they create people and towns.
- A wiki of typed entries with stable IDs: 28 built-in types (NPCs, races, classes, settlements, factions, religions, items, creatures, lore and more) plus your own custom types and one-off custom fields on any entry.
- `@mentions` that link and survive renames, automatic backlinks, sub-pages, full revision history with restore.
- Visibility on everything (DM only, secret, partially known, discovered, public), `:::dm` blocks inside articles, and canon states (draft, proposed, canon, archived).
- Explicit relationships with direction, strength, dates and visibility, and an interactive relationship graph.
- Interactive maps: upload, nested maps, markers linked to entries, regions, layers, DM-only markers and a player preview.
- A timeline with filters, and a custom calendar engine: any months, weeks, intercalary festival days, leap years, eras, seasons, holidays and multiple moons.
- NPC knowledge: who knows or believes what, how sure they are, where they heard it, and whether it's true. AI roleplay is limited to what that character knows.

**Campaigns and play**
- Campaigns with their own clock, party, quests and a per-campaign overlay on world entries (an NPC can be dead in one campaign and alive in another), with an explicit "commit to canon".
- Run Session mode: notes with quick log, scenes, who's here, party, quests and clues, initiative tracker, generators, dice, random tables, music and ambience, and a scene-aware copilot. Works on tablets.
- End Session: the AI reads your notes and proposes a recap, events, status and reputation changes, promises and quest updates. You approve, edit or reject each one.
- Prepare Next Session, mysteries and clues, consequences and promises with due dates, faction reputation, travel, notes, encounters, a bestiary of your own creatures, shops and taverns.

**The living world**
- World threads with momentum, stages and urgency.
- Advance World: pick a span, and Worldloom proposes what happens. Threads move, consequences land, rumours spread, journeys end, factions gain or lose ground. The dead stay dead. Approve what you want; the What Changed view shows the result.
- World News, rumours with distortion and accuracy, a continuity checker, and a forgotten-thread detector.

**AI**
- A copilot drawer (⌘J) and a full assistant page, grounded in a context pipeline that retrieves only the relevant records.
- Generators for towns, NPCs, religions, factions, taverns, shops, dungeons, rumours, quest hooks and history, all arriving as editable proposals.
- Validated structured output: every AI change is checked against the same schemas a form submission uses.

**Everything else**
- ⌘K search across the world (full text plus typo tolerance).
- JSON export and import of a whole world.
- Collaboration: owners, editors, viewers and players, with a read-only player portal that only shows what players have discovered.
- Dark and light themes (account menu, or ⌘K).

## Project layout

```
src/
  app/            Routes (App Router). /w/[worldId]/… is the DM app, /play/[worldId] the player portal.
  components/     UI: ui/ primitives, shell/, entity/, maps/, play/, proposals/, ai/, living/, common/
  lib/            Pure logic shared by client and server: calendar engine, entity types, validation, mentions, proposals
  server/
    db/           Drizzle schema and client (postgres-js or PGlite)
    auth/         Sessions, access control, ownership checks, rate limits
    services/     Domain logic: entities, relationships, timeline, campaigns, sessions, proposals, insights…
    actions/      Server actions (the UI's write API): validate, authorize, call services
    ai/           Provider abstraction, context builders, prompts, tasks and the offline engine
drizzle/          SQL migrations
tests/            Vitest suites (run against an in-memory Postgres)
e2e/              Playwright suite
scripts/          migrate, seed, e2e server
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Deploying

Worldloom is a standard Next.js app. For production:

1. Set `DATABASE_URL` to a managed Postgres (PGlite is for a single machine). The `pg_trgm` extension must be available; it is on Supabase, Neon and RDS.
2. Run `npm run build`, then `npm run serve` behind HTTPS. Session cookies are `Secure` whenever the connection is HTTPS.
3. Point `UPLOAD_DIR` at persistent storage. File storage is a small driver (`src/server/services/files.ts`), so an S3 driver can replace local disk.
4. Optionally set `ANTHROPIC_API_KEY`.

## Notes

- The core races and classes come from the D&D 5e System Reference Documents (SRD 5.2, plus half-elf and half-orc from SRD 5.1) by Wizards of the Coast LLC, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Their descriptions in Worldloom are original summaries.
- No copyrighted monster database is included. The bestiary holds creatures you create; the D&D 5e (2024) support is limited to mechanics (XP budgets, conditions, initiative).
- Semantic (embedding) search isn't included yet. Retrieval uses structured queries, relationships, full-text and trigram search, which keeps the AI grounded without a vector store. The context builder is the place to add it.
