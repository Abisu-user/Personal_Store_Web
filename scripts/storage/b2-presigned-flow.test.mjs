import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server.js";
import { loadApp } from "./harness.mjs";

const userId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
const bucket = "vault-b2-test";
const sha256 = "a".repeat(64);

function post(path, body) {
  return new NextRequest(`https://vault.invalid${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fixture(options = {}) {
  const calls = [];
  let pending = null;
  const metadata = {
    reservePending: async (values, ttlSeconds) => {
      calls.push(["reserve", values, ttlSeconds]);
      if (options.quotaError) {
        throw Object.assign(new Error("quota_exceeded:storage"), { code: "STORAGE_QUOTA_EXCEEDED" });
      }
      pending = { id: objectId, status: "pending", ...values };
      return pending;
    },
    findOwnedPending: async (id, ownerId) => {
      calls.push(["find-pending", id, ownerId]);
      return pending?.id === id && pending?.userId === ownerId && pending?.status === "pending"
        ? pending
        : null;
    },
    markFailed: async (id, ownerId) => {
      calls.push(["failed", id, ownerId]);
      if (pending?.id === id && pending?.userId === ownerId) pending.status = "failed";
    },
    activateOwned: async (values) => {
      calls.push(["active", values]);
      pending = { ...pending, ...values, status: "active" };
      return pending;
    },
  };
  const manager = {
    createSignedUploadUrl: async (targetBucket, objectKey, signedOptions) => {
      calls.push(["sign", targetBucket, objectKey, signedOptions]);
      if (options.signError) return { data: null, error: new Error("sign failed") };
      return {
        data: {
          signedUrl: "https://s3.us-west-004.backblazeb2.com/upload",
          headers: {
            "Content-Type": signedOptions.contentType,
            "x-amz-meta-sha256": signedOptions.checksumSha256,
          },
        },
        error: null,
      };
    },
    head: async (targetBucket, objectKey) => {
      calls.push(["head", targetBucket, objectKey]);
      return {
        data: options.head ?? {
          name: objectKey,
          byteSize: 12,
          contentType: "image/png",
          checksumSha256: sha256,
          etag: "etag",
          lastModified: null,
        },
        error: null,
      };
    },
  };
  const load = loadApp({
    "@/lib/security/activity": {
      getSecurityContext: async () => options.unauthorized ? null : { userId },
    },
    "@/lib/storage/b2-server": { createB2StorageManager: () => manager },
    "@/lib/storage/metadata-repository": {
      createStorageMetadataRepository: () => metadata,
    },
    "@/lib/system/quota": {
      quotaExceededResponse: (cause) => cause?.code === "STORAGE_QUOTA_EXCEEDED"
        ? { error: "儲存空間配額不足。", code: cause.code }
        : null,
    },
  }, {
    process: {
      env: {
        SUPABASE_SECRET_KEY: "phase-4-test-secret",
        B2_BUCKET_NAME: bucket,
      },
    },
  });
  return { calls, load, getPending: () => pending };
}

async function prepare(fixtureValue, overrides = {}) {
  const path = "/api/storage/b2/upload-url";
  const response = await fixtureValue.load("src/app/api/storage/b2/upload-url/route.ts").POST(post(path, {
    purpose: "photo",
    byteSize: 12,
    mimeType: "image/png",
    sha256,
    userId: "attacker",
    objectKey: "attacker/escape.png",
    ...overrides,
  }));
  return { response, data: await response.json() };
}

test("B2 prepare atomically reserves for the session owner, then signs", async () => {
  const f = fixture();
  const { response, data } = await prepare(f);
  assert.equal(response.status, 200);
  assert.equal(data.method, "PUT");
  assert.equal(data.storageObjectId, objectId);
  assert.equal(data.headers["Content-Type"], "image/png");
  assert.equal(data.headers["x-amz-meta-sha256"], sha256);
  assert.deepEqual(f.calls.slice(0, 2).map(([name]) => name), ["reserve", "sign"]);
  const values = f.calls[0][1];
  assert.equal(f.calls[0][2], 3600);
  assert.equal(values.userId, userId);
  assert.equal(values.provider, "b2");
  assert.match(values.objectKey, new RegExp(`^${userId}/photo/[0-9a-f-]{36}$`));
  assert.equal(values.objectKey.includes("attacker"), false);
});

test("B2 prepare never signs for invalid, unauthenticated, or over-quota requests", async () => {
  for (const [options, overrides, expected] of [
    [{ unauthorized: true }, {}, 401],
    [{}, { mimeType: "text/html" }, 400],
    [{ quotaError: true }, {}, 413],
  ]) {
    const f = fixture(options);
    const { response } = await prepare(f, overrides);
    assert.equal(response.status, expected);
    assert.equal(f.calls.some(([name]) => name === "sign"), false);
    assert.equal(f.calls.some(([name]) => name === "sign"), false);
  }
});

test("B2 finalize HEAD-verifies the object before activating metadata", async () => {
  const f = fixture();
  const prepared = await prepare(f);
  const response = await f.load("src/app/api/storage/b2/finalize/route.ts").POST(
    post("/api/storage/b2/finalize", { ticket: prepared.data.ticket }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    storageObjectId: objectId,
    status: "active",
    byteSize: 12,
    mimeType: "image/png",
    checksum: sha256,
  });
  assert.deepEqual(f.calls.slice(2).map(([name]) => name), ["find-pending", "head", "active"]);
  assert.equal(f.getPending().status, "active");
});

test("B2 finalize rejects a tampered ticket before reading B2", async () => {
  const f = fixture();
  const prepared = await prepare(f);
  const before = f.calls.length;
  const response = await f.load("src/app/api/storage/b2/finalize/route.ts").POST(
    post("/api/storage/b2/finalize", { ticket: `${prepared.data.ticket}tampered` }),
  );
  assert.equal(response.status, 400);
  assert.equal(f.calls.length, before);
});

test("B2 finalize marks mismatched objects failed and never activates", async () => {
  const f = fixture({
    head: {
      name: `${userId}/photo/wrong`,
      byteSize: 99,
      contentType: "image/png",
      checksumSha256: sha256,
      etag: "etag",
      lastModified: null,
    },
  });
  const prepared = await prepare(f);
  const response = await f.load("src/app/api/storage/b2/finalize/route.ts").POST(
    post("/api/storage/b2/finalize", { ticket: prepared.data.ticket }),
  );
  assert.equal(response.status, 422);
  assert.equal(f.calls.some(([name]) => name === "active"), false);
  assert.equal(f.getPending().status, "failed");
});
