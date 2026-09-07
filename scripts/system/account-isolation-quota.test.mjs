import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { formatBytes } from "../../src/lib/format-bytes.ts";

const root = new URL("../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("byte formatting is shared and stable", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1.00 KB");
  assert.equal(formatBytes(100 * 1024 * 1024), "100 MB");
});

test("appearance cache key is scoped by account and device", async () => {
  const preferences = await source("src/lib/appearance/preferences.ts");
  assert.match(preferences, /accountAppearanceStoragePrefix.*appearance:account/);
  assert.match(preferences, /appearanceUserId.*getAppearanceDevice\(\)/);
  assert.doesNotMatch(preferences, /localStorage\.getItem\("personal-vault:appearance:(?:desktop|mobile)/);
});

test("administrator capacity endpoint rejects regular accounts", async () => {
  const adminRoute = await source("src/app/api/system/storage-usage/admin/route.ts");
  assert.match(adminRoute, /isSystemAdmin\(context\.userId\)/);
  assert.match(adminRoute, /status:\s*403/);
});

test("database and storage quotas are enforced by server-side gates", async () => {
  const migration = await source("supabase/migrations/20260907180000_add_account_appearance_and_user_quotas.sql");
  const fileUpload = await source("src/app/api/files/upload-url/route.ts");
  const photoUpload = await source("src/app/api/photos/upload-url/route.ts");
  assert.match(migration, /create trigger vault_enforce_database_quota/i);
  assert.match(migration, /quota_exceeded:database/);
  assert.match(fileUpload, /assertStorageQuota/);
  assert.match(photoUpload, /assertStorageQuota/);
});

test("usage breakdown is calculated by the database and returned without system detail", async () => {
  const migration = await source("supabase/migrations/20260907193000_add_usage_breakdown_and_app_lock_setting.sql");
  const ownRoute = await source("src/app/api/system/storage-usage/route.ts");
  assert.match(migration, /vault_user_database_usage/);
  assert.match(migration, /databaseGroups/);
  assert.match(ownRoute, /databaseGroups:\s*capacity\.databaseGroups/);
  assert.doesNotMatch(ownRoute, /vault_project_storage_usage/);
});

test("new accounts default App auto-lock off and disabling requires server PIN verification", async () => {
  const migration = await source("supabase/migrations/20260907193000_add_usage_breakdown_and_app_lock_setting.sql");
  const route = await source("src/app/api/security/app-lock/route.ts");
  assert.match(migration, /set default false/);
  assert.match(migration, /set app_auto_lock_enabled = true/);
  assert.match(route, /verifyAppLockPin/);
  assert.match(route, /app_auto_lock_enabled:\s*false/);
});

test("unauthorized accounts do not render adult settings", async () => {
  const page = await source("src/app/(app)/security/page.tsx");
  const settings = await source("src/components/security/adult-content-settings.tsx");
  assert.match(page, /permissions\.adultContentAccess && <AdultContentSettings/);
  assert.match(settings, /if \(!canAccess\) return null/);
});

test("the designated system administrator receives the system role", async () => {
  const migration = await source("supabase/migrations/20260907210000_assign_system_admin.sql");
  const authorization = await source("src/lib/security/system-admin.ts");
  assert.match(migration, /99135ddd@gmail\.com/);
  assert.match(migration, /set role = 'admin'/);
  assert.match(authorization, /data\?\.role === "admin"/);
});

test("account deletion requires an exact confirmation and removes owned storage before Auth", async () => {
  const route = await source("src/app/api/security/account/route.ts");
  const deletion = await source("src/lib/security/account-deletion.ts");
  assert.match(route, /z\.literal\("DELETE"\)/);
  assert.match(route, /getSecurityContext/);
  assert.match(deletion, /storage\.listBuckets/);
  assert.match(deletion, /removeOwnedStorage\(admin, userId\)/);
  assert.match(deletion, /auth\.admin\.deleteUser\(userId, false\)/);
  assert.ok(deletion.indexOf("removeOwnedStorage(admin, userId)") < deletion.indexOf("auth.admin.deleteUser(userId, false)"));
});

test("project Storage totals aggregate grouped bytes instead of a missing inner column", async () => {
  const migration = await source("supabase/migrations/20260907213000_fix_project_storage_usage.sql");
  assert.match(migration, /coalesce\(sum\(used_bytes\), 0\)/);
  assert.doesNotMatch(migration, /select\s+coalesce\(sum\(byte_size\), 0\),\s+coalesce\(jsonb_agg/);
});
