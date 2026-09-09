import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

import { StorageManager } from "../../src/lib/storage/manager.ts";
import { SupabaseStorageProvider } from "../../src/lib/storage/supabase-provider.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const email = process.env.STORAGE_VALIDATION_EMAIL;
if (!email) throw new Error("Set STORAGE_VALIDATION_EMAIL for an existing test account.");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !publicKey || !secretKey) throw new Error("Supabase environment is incomplete.");

async function fetchWithTimeout(input, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Storage request timed out.")), 15_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
  global: {
    fetch: fetchWithTimeout,
  },
};
const admin = createClient(url, secretKey, clientOptions);
const publicClient = createClient(url, publicKey, clientOptions);
const serverStorage = new StorageManager(new SupabaseStorageProvider(admin.storage));
const browserStorage = new StorageManager(new SupabaseStorageProvider(publicClient.storage));

const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (users.error) throw users.error;
const account = users.data.users.find((user) => user.email === email);
if (!account) throw new Error("Storage validation account was not found.");
console.log("Storage validation account resolved; starting isolated object tests.");

const marker = `phase-1-validation-${crypto.randomUUID()}`;
const cases = [
  ["general-file", "vault-files", `${account.id}/${marker}`, "application/octet-stream", new Uint8Array([0, 1, 127, 128, 255])],
  ["photo", "vault-files", `${account.id}/photos/${marker}.png`, "image/png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
  ["cover", "content-covers", `${account.id}/covers/${marker}.webp`, "image/webp", new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0])],
  ["desktop-background", "workspace-backgrounds", `${account.id}/desktop/${marker}.webp`, "image/webp", new Uint8Array([87, 69, 66, 80, 0])],
  ["mobile-background", "workspace-backgrounds", `${account.id}/mobile/${marker}.png`, "image/png", new Uint8Array([137, 80, 78, 71, 0])],
];

const created = [];
const report = [];
let validationError = null;
try {
  for (const [label, bucket, path, mimeType, bytes] of cases) {
    console.log(`Testing ${label} in ${bucket}...`);
    const signedUpload = await serverStorage.createSignedUploadUrl(bucket, path);
    if (signedUpload.error) throw new Error(`${label}: sign upload: ${signedUpload.error.message}`);

    const upload = await browserStorage.uploadToSignedUrl(
      bucket,
      path,
      signedUpload.data.token,
      bytes.buffer,
      { contentType: mimeType },
    );
    if (upload.error) throw new Error(`${label}: signed upload: ${upload.error.message}`);
    created.push([bucket, path]);

    const head = await serverStorage.head(bucket, path);
    if (head.error) throw new Error(`${label}: head: ${head.error.message}`);
    assert.equal(head.data.byteSize, bytes.byteLength, `${label}: HEAD byte size`);

    const download = await serverStorage.download(bucket, path);
    if (download.error) throw new Error(`${label}: download: ${download.error.message}`);
    assert.deepEqual(new Uint8Array(await download.data.arrayBuffer()), bytes, `${label}: download bytes`);

    const signedDownload = await serverStorage.getSignedUrl(bucket, path, 60, { download: `${label}.bin` });
    if (signedDownload.error) throw new Error(`${label}: sign download: ${signedDownload.error.message}`);
    const response = await fetchWithTimeout(signedDownload.data.signedUrl);
    assert.equal(response.ok, true, `${label}: signed download HTTP ${response.status}`);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes, `${label}: signed download bytes`);

    report.push({ label, bucket, bytes: bytes.byteLength });
  }
} catch (cause) {
  validationError = cause;
}

const cleanupFailures = [];
for (const [bucket, path] of created.reverse()) {
  const removed = await serverStorage.delete(bucket, [path]);
  if (removed.error) {
    cleanupFailures.push(`${bucket}: ${removed.error.message}`);
    continue;
  }
  const afterDelete = await serverStorage.head(bucket, path);
  if (!afterDelete.error) cleanupFailures.push(`${bucket}: object still exists`);
}

console.log(`Cleanup checked for ${created.length} test objects.`);

if (cleanupFailures.length) throw new Error(`Cleanup failed: ${cleanupFailures.join(", ")}`);
if (validationError) throw validationError;

console.log(JSON.stringify({ ok: true, tested: report, cleanup: "verified" }, null, 2));
