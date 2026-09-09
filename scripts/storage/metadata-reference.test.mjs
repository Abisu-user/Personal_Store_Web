import assert from "node:assert/strict";
import test from "node:test";

import { resolveStorageReference } from "../../src/lib/storage/metadata-reference.ts";

const userId = "00000000-0000-4000-8000-000000000001";
const legacy = { provider: "supabase", bucket: "vault-files", objectKey: `${userId}/legacy-file` };

test("legacy rows remain readable without metadata", async () => {
  const reader = { findOwnedActive: async () => null };
  assert.deepEqual(await resolveStorageReference(reader, { userId, legacy }), legacy);
});

test("active owned metadata takes precedence for new rows", async () => {
  const reader = {
    findOwnedActive: async (id, owner) => ({
      id,
      userId: owner,
      provider: "supabase",
      bucket: "content-covers",
      objectKey: `${owner}/covers/new-cover`,
      category: "content-cover",
      byteSize: 25,
      mimeType: "image/webp",
      checksum: null,
      status: "active",
      createdAt: "2026-09-09T00:00:00Z",
      updatedAt: "2026-09-09T00:00:00Z",
      deletedAt: null,
    }),
  };
  assert.deepEqual(await resolveStorageReference(reader, { userId, storageObjectId: "metadata-id", legacy }), {
    provider: "supabase",
    bucket: "content-covers",
    objectKey: `${userId}/covers/new-cover`,
  });
});

test("missing or non-active metadata safely falls back to the unchanged legacy path", async () => {
  const reader = { findOwnedActive: async () => null };
  assert.deepEqual(await resolveStorageReference(reader, { userId, storageObjectId: "missing", legacy }), legacy);
});

test("legacy fallback cannot escape the authenticated account prefix", async () => {
  const reader = { findOwnedActive: async () => null };
  await assert.rejects(
    resolveStorageReference(reader, { userId, legacy: { ...legacy, objectKey: "another-user/file" } }),
    /outside the authenticated account prefix/,
  );
});

