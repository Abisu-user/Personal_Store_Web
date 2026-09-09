import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../supabase/migrations/20260909170000_add_storage_reservations_and_cleanup.sql", import.meta.url),
  "utf8",
);

test("Phase 5 atomically checks effective usage and creates the reservation", () => {
  assert.match(migration, /vault_reserve_storage_object/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /vault_user_storage_usage\(target_user_id\)/);
  assert.match(migration, /vault_external_storage_usage\(target_user_id\)/);
  assert.match(migration, /status in \('active', 'pending', 'deleting'\)/);
  assert.match(migration, /insert into public\.storage_objects/);
  assert.match(migration, /reservation_expires_at/);
});

test("Phase 5 cleanup claims bounded batches and remains retryable", () => {
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /limit least\(greatest\(coalesce\(batch_size, 25\), 1\), 100\)/i);
  assert.match(migration, /status = 'deleting'/);
  assert.match(migration, /cleanup_claimed_at <= now\(\) - interval '15 minutes'/);
  assert.match(migration, /set status = 'pending',[\s\S]*reservation_expires_at = now\(\)/);
  assert.match(migration, /set status = 'failed',[\s\S]*deleted_at = now\(\)/);
});

test("Phase 5 RPCs are service-role only and migration never deletes user data", () => {
  for (const name of [
    "vault_external_storage_usage",
    "vault_reserve_storage_object",
    "vault_activate_storage_object",
    "vault_claim_expired_storage_objects",
    "vault_finish_storage_cleanup",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}.*service_role`));
  }
  assert.doesNotMatch(migration, /delete\s+from\s+public\./i);
  assert.doesNotMatch(migration, /truncate\s+/i);
  assert.doesNotMatch(migration, /drop\s+table/i);
});
