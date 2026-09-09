import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server.js";

import { loadApp } from "./harness.mjs";

const cleanupPendingStorageObjects = loadApp({
  "./b2-server": { createB2StorageManager: () => ({}) },
  "./metadata-repository": { createStorageMetadataRepository: () => ({}) },
})("src/lib/storage/pending-cleanup.ts").cleanupPendingStorageObjects;

const base = {
  userId: "11111111-1111-4111-8111-111111111111",
  bucket: "vault-b2-test",
  category: "photo",
  byteSize: 12,
  mimeType: "image/png",
  checksum: null,
  status: "deleting",
  createdAt: "2026-09-09T00:00:00Z",
  updatedAt: "2026-09-09T01:00:00Z",
  deletedAt: null,
  reservationExpiresAt: "2026-09-09T01:00:00Z",
  cleanupClaimedAt: "2026-09-09T02:00:00Z",
  cleanupAttempts: 1,
  cleanupLastError: null,
};

test("expired cleanup deletes claimed B2 objects and retries failures safely", async () => {
  const objects = [
    { ...base, id: "ok", provider: "b2", objectKey: `${base.userId}/photo/ok` },
    { ...base, id: "failed", provider: "b2", objectKey: `${base.userId}/photo/failed` },
    { ...base, id: "unsupported", provider: "r2", objectKey: `${base.userId}/photo/unsupported` },
  ];
  const finished = [];
  const metadata = {
    claimExpired: async (limit) => {
      assert.equal(limit, 10);
      return objects;
    },
    finishCleanup: async (...args) => {
      finished.push(args);
      return objects.find(({ id }) => id === args[0]);
    },
  };
  const deletedKeys = [];
  const b2 = {
    delete: async (bucket, keys) => {
      assert.equal(bucket, base.bucket);
      deletedKeys.push(...keys);
      return keys[0].endsWith("/failed")
        ? { data: null, error: new Error("provider unavailable") }
        : { data: [], error: null };
    },
  };

  const report = await cleanupPendingStorageObjects({
    metadata,
    managers: { b2 },
    limit: 10,
  });

  assert.deepEqual(report, { claimed: 3, deleted: 1, retryableFailures: 2 });
  assert.deepEqual(deletedKeys.sort(), [
    `${base.userId}/photo/failed`,
    `${base.userId}/photo/ok`,
  ]);
  assert.deepEqual(finished.sort(([left], [right]) => left.localeCompare(right)), [
    ["failed", false, "Provider object deletion failed."],
    ["ok", true],
    ["unsupported", false, "Storage provider cleanup is not configured."],
  ]);
});

test("cleanup endpoint requires the server-only cron secret", async () => {
  let calls = 0;
  const secret = "phase-5-test-secret-that-is-at-least-32-characters";
  const load = loadApp({
    "@/lib/storage/pending-cleanup": {
      cleanupPendingStorageObjects: async ({ limit }) => {
        calls += 1;
        assert.equal(limit, 25);
        return { claimed: 2, deleted: 2, retryableFailures: 0 };
      },
    },
  }, { process: { env: { CRON_SECRET: secret } } });
  const route = load("src/app/api/internal/storage/cleanup-pending/route.ts");

  const unauthorized = await route.GET(new NextRequest("https://vault.invalid/api/internal/storage/cleanup-pending"));
  assert.equal(unauthorized.status, 401);
  assert.equal(calls, 0);

  const authorized = await route.GET(new NextRequest("https://vault.invalid/api/internal/storage/cleanup-pending", {
    headers: { Authorization: `Bearer ${secret}` },
  }));
  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), { claimed: 2, deleted: 2, retryableFailures: 0 });
  assert.equal(calls, 1);
});
