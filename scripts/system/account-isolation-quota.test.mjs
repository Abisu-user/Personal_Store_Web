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
