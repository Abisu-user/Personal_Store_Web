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

test("pending activation is state constrained and cannot activate another account", () => {
  assert.match(repository, /\.eq\("id", input\.id\)\.eq\("user_id", input\.userId\)\.eq\("status", "pending"\)/);
  assert.match(repository, /status: "active"/);
  assert.match(repository, /status: "failed"/);
});

test("transition resolver prefers metadata but explicitly retains legacy fallback", () => {
  assert.match(reference, /storageObjectId/);
  assert.match(reference, /findOwnedActive/);
  assert.match(reference, /return reference\.legacy/);
});
