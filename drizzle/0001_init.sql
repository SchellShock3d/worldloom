CREATE TYPE "public"."actor_type" AS ENUM('user', 'ai', 'system');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('pending', 'partial', 'applied', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."canon_status" AS ENUM('draft', 'proposed', 'canon', 'archived');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'editor', 'viewer', 'player');--> statement-breakpoint
CREATE TYPE "public"."player_knowledge" AS ENUM('unknown', 'rumoured', 'partial', 'discovered');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'applied', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."quest_status" AS ENUM('unknown', 'available', 'active', 'completed', 'failed', 'abandoned', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('planned', 'in_progress', 'completed', 'processed');--> statement-breakpoint
CREATE TYPE "public"."thread_status" AS ENUM('dormant', 'active', 'escalating', 'resolved', 'failed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."truth_status" AS ENUM('true', 'false', 'partial', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('dm_only', 'secret', 'partially_known', 'discovered', 'public');--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"campaign_id" uuid,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"roleplay_entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"context_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposal_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"music_track_id" uuid,
	"ambience_track_id" uuid,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'music' NOT NULL,
	"file_id" uuid,
	"url" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"loop" boolean DEFAULT true NOT NULL,
	"volume" real DEFAULT 0.8 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_entity_states" (
	"campaign_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"status" text,
	"location_id" uuid,
	"reputation" smallint,
	"attitude" text,
	"knowledge" "player_knowledge" DEFAULT 'unknown' NOT NULL,
	"discovered_at" bigint,
	"discovered_session_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_entity_states_campaign_id_entity_id_pk" PRIMARY KEY("campaign_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"premise" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_at" bigint DEFAULT 0 NOT NULL,
	"current_location_id" uuid,
	"active_scene_id" uuid,
	"party_name" text DEFAULT 'The party' NOT NULL,
	"party_notes" text DEFAULT '' NOT NULL,
	"party_inventory" text DEFAULT '' NOT NULL,
	"party_funds" text DEFAULT '' NOT NULL,
	"current_weather" text DEFAULT '' NOT NULL,
	"weather_locked" boolean DEFAULT false NOT NULL,
	"dm_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clue_knowers" (
	"clue_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	CONSTRAINT "clue_knowers_clue_id_entity_id_pk" PRIMARY KEY("clue_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "clues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"campaign_id" uuid,
	"mystery_id" uuid,
	"quest_id" uuid,
	"description" text NOT NULL,
	"location_id" uuid,
	"source_entity_id" uuid,
	"source_text" text DEFAULT '' NOT NULL,
	"is_red_herring" boolean DEFAULT false NOT NULL,
	"discovered" boolean DEFAULT false NOT NULL,
	"discovered_session_id" uuid,
	"discovered_at" bigint,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"campaign_id" uuid,
	"kind" text DEFAULT 'consequence' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cause" text DEFAULT '' NOT NULL,
	"actor_id" uuid,
	"cause_event_id" uuid,
	"session_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"severity" smallint DEFAULT 2 NOT NULL,
	"due_at" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_entity_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"plural_name" text,
	"description" text,
	"icon" text,
	"is_place" boolean DEFAULT false NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encounter_combatants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"encounter_id" uuid NOT NULL,
	"entity_id" uuid,
	"name" text NOT NULL,
	"side" text DEFAULT 'enemy' NOT NULL,
	"initiative" real,
	"initiative_bonus" integer DEFAULT 0 NOT NULL,
	"hp_current" integer,
	"hp_max" integer,
	"temp_hp" integer DEFAULT 0 NOT NULL,
	"ac" integer,
	"conditions" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"defeated" boolean DEFAULT false NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encounters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location_id" uuid,
	"quest_id" uuid,
	"rewards" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"turn_index" integer DEFAULT 0 NOT NULL,
	"game_system" text DEFAULT 'dnd5e' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"campaign_id" uuid,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"dm_notes" text DEFAULT '' NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text,
	"location_id" uuid,
	"parent_id" uuid,
	"image_file_id" uuid,
	"canon_status" "canon_status" DEFAULT 'canon' NOT NULL,
	"visibility" "visibility" DEFAULT 'secret' NOT NULL,
	"importance" smallint DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("name", '')), 'A') || setweight(to_tsvector('simple'::regconfig, wl_text_array("aliases")), 'A') || setweight(to_tsvector('english'::regconfig, coalesce("summary", '')), 'B') || setweight(to_tsvector('english'::regconfig, coalesce("body", '')), 'C') || setweight(to_tsvector('english'::regconfig, coalesce("dm_notes", '')), 'D')) STORED
);
--> statement-breakpoint
CREATE TABLE "entity_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"value" integer DEFAULT 50 NOT NULL,
	"min" integer DEFAULT 0 NOT NULL,
	"max" integer DEFAULT 100 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_tags" (
	"entity_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "entity_tags_entity_id_tag_id_pk" PRIMARY KEY("entity_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'historical' NOT NULL,
	"start_at" bigint NOT NULL,
	"end_at" bigint,
	"precision" text DEFAULT 'day' NOT NULL,
	"session_id" uuid,
	"origin" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"campaign_id" uuid,
	"holder_id" uuid,
	"subject_id" uuid,
	"statement" text NOT NULL,
	"truth_status" "truth_status" DEFAULT 'true' NOT NULL,
	"confidence" smallint DEFAULT 80 NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"source_entity_id" uuid,
	"truth_ref_id" uuid,
	"learned_at" bigint,
	"learned_session_id" uuid,
	"visibility" "visibility" DEFAULT 'dm_only' NOT NULL,
	"canon_status" "canon_status" DEFAULT 'canon' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" "session_status" DEFAULT 'planned' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"in_world_start_at" bigint,
	"in_world_end_at" bigint,
	"notes" text DEFAULT '' NOT NULL,
	"recap" text DEFAULT '' NOT NULL,
	"prep" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_layers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"map_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"visible_by_default" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_markers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"map_id" uuid NOT NULL,
	"layer_id" uuid,
	"entity_id" uuid,
	"child_map_id" uuid,
	"label" text NOT NULL,
	"category" text DEFAULT 'landmark' NOT NULL,
	"color" text,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"map_id" uuid NOT NULL,
	"layer_id" uuid,
	"entity_id" uuid,
	"name" text NOT NULL,
	"color" text DEFAULT '#5bb3a4' NOT NULL,
	"points" jsonb NOT NULL,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"parent_map_id" uuid,
	"entity_id" uuid,
	"image_file_id" uuid,
	"width" integer,
	"height" integer,
	"scale_distance" real,
	"scale_unit" text DEFAULT 'miles' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mysteries" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"question" text DEFAULT '' NOT NULL,
	"truth" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"campaign_id" uuid,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"campaign_id" uuid,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" "batch_status" DEFAULT 'pending' NOT NULL,
	"provider" text DEFAULT 'offline' NOT NULL,
	"from_at" bigint,
	"to_at" bigint,
	"session_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"original_payload" jsonb,
	"rationale" text DEFAULT '' NOT NULL,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"error" text,
	"result_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied_at" timestamp with time zone,
	"applied_by" uuid
);
--> statement-breakpoint
CREATE TABLE "quest_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quest_id" uuid NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"status" "quest_status" DEFAULT 'available' NOT NULL,
	"priority" smallint DEFAULT 1 NOT NULL,
	"giver_id" uuid,
	"thread_id" uuid,
	"rewards" text DEFAULT '' NOT NULL,
	"prerequisites" text DEFAULT '' NOT NULL,
	"consequences" text DEFAULT '' NOT NULL,
	"player_knowledge" text DEFAULT '' NOT NULL,
	"completed_at" bigint
);
--> statement-breakpoint
CREATE TABLE "random_table_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"text" text NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "random_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'custom' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"campaign_id" uuid,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"type" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"strength" smallint,
	"visibility" "visibility" DEFAULT 'secret' NOT NULL,
	"canon_status" "canon_status" DEFAULT 'canon' NOT NULL,
	"start_at" bigint,
	"end_at" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"campaign_id" uuid,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"target_label" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"actor_type" "actor_type" DEFAULT 'user' NOT NULL,
	"actor_user_id" uuid,
	"proposal_id" uuid,
	"summary" text DEFAULT '' NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rumours" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"claim" text NOT NULL,
	"truth" text DEFAULT '' NOT NULL,
	"accuracy" smallint DEFAULT 50 NOT NULL,
	"distortion" text DEFAULT '' NOT NULL,
	"origin_text" text DEFAULT '' NOT NULL,
	"origin_event_id" uuid,
	"started_at" bigint,
	"expires_at" bigint
);
--> statement-breakpoint
CREATE TABLE "scene_entities" (
	"scene_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"role" text DEFAULT 'present' NOT NULL,
	CONSTRAINT "scene_entities_scene_id_entity_id_pk" PRIMARY KEY("scene_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location_id" uuid,
	"at_time" bigint,
	"weather" text DEFAULT '' NOT NULL,
	"mood" text DEFAULT '' NOT NULL,
	"lighting" text DEFAULT '' NOT NULL,
	"ambience" text DEFAULT '' NOT NULL,
	"encounter_id" uuid,
	"quest_id" uuid,
	"audio_profile_id" uuid,
	"status" text DEFAULT 'planned' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text
);
--> statement-breakpoint
CREATE TABLE "thread_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"reached_at" bigint
);
--> statement-breakpoint
CREATE TABLE "travel_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"origin_id" uuid,
	"destination_id" uuid,
	"distance" real,
	"distance_unit" text DEFAULT 'miles' NOT NULL,
	"method" text DEFAULT 'foot' NOT NULL,
	"speed_per_day" real,
	"estimated_minutes" bigint,
	"terrain" text DEFAULT '' NOT NULL,
	"weather" text DEFAULT '' NOT NULL,
	"encounter_notes" text DEFAULT '' NOT NULL,
	"stops" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"departed_at" bigint,
	"arrived_at" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "world_members" (
	"world_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_members_world_id_user_id_pk" PRIMARY KEY("world_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "world_threads" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"status" "thread_status" DEFAULT 'active' NOT NULL,
	"progress" smallint DEFAULT 0 NOT NULL,
	"urgency" smallint DEFAULT 3 NOT NULL,
	"momentum" smallint DEFAULT 10 NOT NULL,
	"stage_index" integer DEFAULT 0 NOT NULL,
	"goals" text DEFAULT '' NOT NULL,
	"next_milestone" text DEFAULT '' NOT NULL,
	"next_milestone_at" bigint,
	"possible_outcomes" text DEFAULT '' NOT NULL,
	"triggers" text DEFAULT '' NOT NULL,
	"start_at" bigint,
	"last_advanced_at" bigint
);
--> statement-breakpoint
CREATE TABLE "worlds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"genre" text DEFAULT 'High fantasy' NOT NULL,
	"tone" text DEFAULT '' NOT NULL,
	"magic_level" text DEFAULT 'Moderate' NOT NULL,
	"tech_level" text DEFAULT 'Medieval' NOT NULL,
	"game_system" text DEFAULT 'dnd5e' NOT NULL,
	"calendar_id" uuid,
	"current_at" bigint DEFAULT 0 NOT NULL,
	"cover_file_id" uuid,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_roleplay_entity_id_entities_id_fk" FOREIGN KEY ("roleplay_entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_proposal_batch_id_proposal_batches_id_fk" FOREIGN KEY ("proposal_batch_id") REFERENCES "public"."proposal_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_profiles" ADD CONSTRAINT "audio_profiles_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_profiles" ADD CONSTRAINT "audio_profiles_music_track_id_audio_tracks_id_fk" FOREIGN KEY ("music_track_id") REFERENCES "public"."audio_tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_profiles" ADD CONSTRAINT "audio_profiles_ambience_track_id_audio_tracks_id_fk" FOREIGN KEY ("ambience_track_id") REFERENCES "public"."audio_tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_entity_states" ADD CONSTRAINT "campaign_entity_states_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_entity_states" ADD CONSTRAINT "campaign_entity_states_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_entity_states" ADD CONSTRAINT "campaign_entity_states_location_id_entities_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_entity_states" ADD CONSTRAINT "campaign_entity_states_discovered_session_id_game_sessions_id_fk" FOREIGN KEY ("discovered_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_current_location_id_entities_id_fk" FOREIGN KEY ("current_location_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_active_scene_id_scenes_id_fk" FOREIGN KEY ("active_scene_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clue_knowers" ADD CONSTRAINT "clue_knowers_clue_id_clues_id_fk" FOREIGN KEY ("clue_id") REFERENCES "public"."clues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clue_knowers" ADD CONSTRAINT "clue_knowers_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clues" ADD CONSTRAINT "clues_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clues" ADD CONSTRAINT "clues_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clues" ADD CONSTRAINT "clues_mystery_id_mysteries_entity_id_fk" FOREIGN KEY ("mystery_id") REFERENCES "public"."mysteries"("entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clues" ADD CONSTRAINT "clues_quest_id_entities_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clues" ADD CONSTRAINT "clues_location_id_entities_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clues" ADD CONSTRAINT "clues_source_entity_id_entities_id_fk" FOREIGN KEY ("source_entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clues" ADD CONSTRAINT "clues_discovered_session_id_game_sessions_id_fk" FOREIGN KEY ("discovered_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consequences" ADD CONSTRAINT "consequences_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consequences" ADD CONSTRAINT "consequences_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consequences" ADD CONSTRAINT "consequences_actor_id_entities_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consequences" ADD CONSTRAINT "consequences_cause_event_id_entities_id_fk" FOREIGN KEY ("cause_event_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consequences" ADD CONSTRAINT "consequences_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_entity_types" ADD CONSTRAINT "custom_entity_types_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_combatants" ADD CONSTRAINT "encounter_combatants_encounter_id_encounters_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_combatants" ADD CONSTRAINT "encounter_combatants_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_location_id_entities_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_quest_id_entities_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_location_id_entities_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_parent_id_entities_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_metrics" ADD CONSTRAINT "entity_metrics_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_metrics" ADD CONSTRAINT "entity_metrics_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_tags" ADD CONSTRAINT "entity_tags_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_tags" ADD CONSTRAINT "entity_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_holder_id_entities_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_subject_id_entities_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_source_entity_id_entities_id_fk" FOREIGN KEY ("source_entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_truth_ref_id_facts_id_fk" FOREIGN KEY ("truth_ref_id") REFERENCES "public"."facts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_learned_session_id_game_sessions_id_fk" FOREIGN KEY ("learned_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_layers" ADD CONSTRAINT "map_layers_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_markers" ADD CONSTRAINT "map_markers_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_markers" ADD CONSTRAINT "map_markers_layer_id_map_layers_id_fk" FOREIGN KEY ("layer_id") REFERENCES "public"."map_layers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_markers" ADD CONSTRAINT "map_markers_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_markers" ADD CONSTRAINT "map_markers_child_map_id_maps_id_fk" FOREIGN KEY ("child_map_id") REFERENCES "public"."maps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_regions" ADD CONSTRAINT "map_regions_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_regions" ADD CONSTRAINT "map_regions_layer_id_map_layers_id_fk" FOREIGN KEY ("layer_id") REFERENCES "public"."map_layers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_regions" ADD CONSTRAINT "map_regions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_parent_map_id_maps_id_fk" FOREIGN KEY ("parent_map_id") REFERENCES "public"."maps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mysteries" ADD CONSTRAINT "mysteries_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_batches" ADD CONSTRAINT "proposal_batches_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_batches" ADD CONSTRAINT "proposal_batches_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_batches" ADD CONSTRAINT "proposal_batches_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_batches" ADD CONSTRAINT "proposal_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_batch_id_proposal_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."proposal_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_objectives" ADD CONSTRAINT "quest_objectives_quest_id_quests_entity_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_giver_id_entities_id_fk" FOREIGN KEY ("giver_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_thread_id_entities_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "random_table_entries" ADD CONSTRAINT "random_table_entries_table_id_random_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."random_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "random_tables" ADD CONSTRAINT "random_tables_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "random_tables" ADD CONSTRAINT "random_tables_location_id_entities_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_id_entities_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_id_entities_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rumours" ADD CONSTRAINT "rumours_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rumours" ADD CONSTRAINT "rumours_origin_event_id_entities_id_fk" FOREIGN KEY ("origin_event_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_entities" ADD CONSTRAINT "scene_entities_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_entities" ADD CONSTRAINT "scene_entities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_location_id_entities_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_encounter_id_encounters_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_quest_id_entities_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_audio_profile_id_audio_profiles_id_fk" FOREIGN KEY ("audio_profile_id") REFERENCES "public"."audio_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_stages" ADD CONSTRAINT "thread_stages_thread_id_world_threads_entity_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."world_threads"("entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_plans" ADD CONSTRAINT "travel_plans_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_plans" ADD CONSTRAINT "travel_plans_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_plans" ADD CONSTRAINT "travel_plans_origin_id_entities_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_plans" ADD CONSTRAINT "travel_plans_destination_id_entities_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_members" ADD CONSTRAINT "world_members_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_members" ADD CONSTRAINT "world_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_threads" ADD CONSTRAINT "world_threads_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversations_world_idx" ON "ai_conversations" USING btree ("world_id","user_id");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_idx" ON "ai_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "audio_tracks_world_idx" ON "audio_tracks" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ces_entity_idx" ON "campaign_entity_states" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "campaigns_world_idx" ON "campaigns" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "clues_mystery_idx" ON "clues" USING btree ("mystery_id");--> statement-breakpoint
CREATE INDEX "clues_campaign_idx" ON "clues" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "consequences_campaign_idx" ON "consequences" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_entity_types_world_key" ON "custom_entity_types" USING btree ("world_id","key");--> statement-breakpoint
CREATE INDEX "encounter_combatants_encounter_idx" ON "encounter_combatants" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "encounters_world_idx" ON "encounters" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "entities_world_type_idx" ON "entities" USING btree ("world_id","type");--> statement-breakpoint
CREATE INDEX "entities_campaign_idx" ON "entities" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "entities_location_idx" ON "entities" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "entities_parent_idx" ON "entities" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "entities_updated_idx" ON "entities" USING btree ("world_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_world_slug" ON "entities" USING btree ("world_id","slug");--> statement-breakpoint
CREATE INDEX "entities_search_idx" ON "entities" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "entities_name_trgm_idx" ON "entities" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "entity_metrics_unique" ON "entity_metrics" USING btree ("entity_id","key");--> statement-breakpoint
CREATE INDEX "entity_tags_tag_idx" ON "entity_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "events_start_idx" ON "events" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "facts_holder_idx" ON "facts" USING btree ("holder_id");--> statement-breakpoint
CREATE INDEX "facts_subject_idx" ON "facts" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "facts_world_idx" ON "facts" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "files_world_idx" ON "files" USING btree ("world_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_sessions_campaign_number" ON "game_sessions" USING btree ("campaign_id","number");--> statement-breakpoint
CREATE INDEX "map_layers_map_idx" ON "map_layers" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "map_markers_map_idx" ON "map_markers" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "map_markers_entity_idx" ON "map_markers" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "map_regions_map_idx" ON "map_regions" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "maps_world_idx" ON "maps" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "maps_parent_idx" ON "maps" USING btree ("parent_map_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mentions_unique" ON "mentions" USING btree ("source_kind","source_id","entity_id");--> statement-breakpoint
CREATE INDEX "mentions_entity_idx" ON "mentions" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "notes_campaign_idx" ON "notes" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "proposal_batches_world_idx" ON "proposal_batches" USING btree ("world_id","status");--> statement-breakpoint
CREATE INDEX "proposals_batch_idx" ON "proposals" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "quest_objectives_quest_idx" ON "quest_objectives" USING btree ("quest_id");--> statement-breakpoint
CREATE INDEX "random_table_entries_table_idx" ON "random_table_entries" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "random_tables_world_idx" ON "random_tables" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "relationships_source_idx" ON "relationships" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "relationships_target_idx" ON "relationships" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "relationships_world_type_idx" ON "relationships" USING btree ("world_id","type");--> statement-breakpoint
CREATE INDEX "revisions_world_created_idx" ON "revisions" USING btree ("world_id","created_at");--> statement-breakpoint
CREATE INDEX "revisions_target_idx" ON "revisions" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "scenes_campaign_idx" ON "scenes" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "scenes_session_idx" ON "scenes" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_world_name" ON "tags" USING btree ("world_id","name");--> statement-breakpoint
CREATE INDEX "thread_stages_thread_idx" ON "thread_stages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "travel_plans_campaign_idx" ON "travel_plans" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "world_members_user_idx" ON "world_members" USING btree ("user_id");