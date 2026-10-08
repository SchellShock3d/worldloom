CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- Immutable wrapper so text[] columns can feed a generated tsvector column.
CREATE OR REPLACE FUNCTION wl_text_array(arr text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT coalesce(array_to_string(arr, ' '), '') $$;
