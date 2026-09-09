import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile(new URL("../../src/lib/storage/metadata-repository.ts", import.meta.url), "utf8");
const reference = await readFile(new URL("../../src/lib/storage/metadata-reference.ts", import.meta.url), "utf8");

test("metadata repository stays server-only and filters every lookup by user_id", () => {
  assert.match(repository, /^import "server-only";/);
  assert.match(repository, /\.eq\("id", id\)\.eq\("user_id", userId\)/);
  assert.doesNotMatch(repository, /NEXT_PUBLIC_.*SECRET|process\.env/);
});

test("pending activation and reservation use owner-scoped atomic RPCs", () => {
  assert.match(repository, /rpc\("vault_reserve_storage_object"/);
  assert.match(repository, /rpc\("vault_activate_storage_object"/);
  assert.match(repository, /target_id: input\.id/);
  assert.match(repository, /target_user_id: input\.userId/);
  assert.match(repository, /status: "failed"/);
});

test("transition resolver prefers metadata but explicitly retains legacy fallback", () => {
  assert.match(reference, /storageObjectId/);
  assert.match(reference, /findOwnedActive/);
  assert.match(reference, /return reference\.legacy/);
});
