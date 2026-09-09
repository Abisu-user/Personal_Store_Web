import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../supabase/migrations/20260909090000_add_storage_objects_metadata.sql", import.meta.url);
const verificationUrl = new URL("./verify-storage-metadata.sql", import.meta.url);

const migration = await readFile(migrationUrl, "utf8");
const verification = await readFile(verificationUrl, "utf8");

test("Phase 2 metadata migration contains the required provider-neutral lifecycle fields", () => {
  for (const field of [
    "id uuid",
    "user_id uuid",
    "provider text",
    "bucket text",
    "object_key text",
    "category text",
    "byte_size bigint",
    "mime_type text",
    "checksum text",
    "status text",
    "created_at timestamptz",
    "updated_at timestamptz",
    "deleted_at timestamptz",
  ]) assert.match(migration, new RegExp(`\\b${field.replace(" ", "\\s+")}`, "i"), field);

  assert.match(migration, /provider in \('supabase', 'r2'\)/i);
  assert.match(migration, /status in \('pending', 'active', 'deleting', 'failed'\)/i);
});

test("migration only adds nullable compatibility references and preserves legacy columns", () => {
  assert.match(migration, /alter table public\.file_details\s+add column if not exists storage_object_id uuid/i);
  assert.match(migration, /alter table public\.entries\s+add column if not exists cover_storage_object_id uuid/i);
  assert.match(migration, /alter table public\.anime_library\s+add column if not exists cover_storage_object_id uuid/i);
  assert.doesNotMatch(migration, /storage_object_id uuid\s+not null/i);
  assert.doesNotMatch(migration, /drop\s+column/i);
  assert.doesNotMatch(migration, /alter\s+column\s+(storage_path|cover_image_path|cover_url)/i);
  assert.doesNotMatch(migration, /\b(update|insert into|truncate)\s+(public\.)?(file_details|entries|anime_library)\b/i);
});

test("metadata is server-only and indexed for owner/lifecycle access", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.storage_objects from anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on public\.storage_objects to service_role/i);
  assert.match(migration, /storage_objects_user_status_idx/i);
  assert.match(migration, /storage_objects_user_category_idx/i);
  assert.match(migration, /storage_objects_pending_idx/i);
});

test("verification SQL is read-only and checks that no legacy row was linked", () => {
  assert.match(verification, /metadata_rows/i);
  assert.match(verification, /linked_files/i);
  assert.match(verification, /linked_entry_covers/i);
  assert.match(verification, /linked_anime_covers/i);
  assert.doesNotMatch(verification, /\b(insert|update|delete|truncate|alter|drop|create)\b/i);
});
