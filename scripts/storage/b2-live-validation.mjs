import assert from "node:assert/strict";
import nextEnv from "@next/env";

import { B2StorageProvider } from "../../src/lib/storage/b2-provider.ts";
import { StorageManager } from "../../src/lib/storage/manager.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const bucket = required("B2_BUCKET_NAME");
const manager = new StorageManager(new B2StorageProvider({
  endpoint: required("B2_ENDPOINT"),
  region: required("B2_REGION"),
  accessKeyId: required("B2_ACCESS_KEY_ID"),
  secretAccessKey: required("B2_SECRET_ACCESS_KEY"),
  bucket,
}));

const prefix = `test/phase-3/${crypto.randomUUID()}`;
const directPath = `${prefix}/direct.txt`;
const signedPath = `${prefix}/signed.txt`;
const directBytes = new TextEncoder().encode("Personal Vault B2 direct validation");
const signedBytes = new TextEncoder().encode("Personal Vault B2 signed validation");
const created = [];

async function expect(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

let validationError = null;
try {
  await expect(await manager.upload(bucket, directPath, directBytes.buffer, { contentType: "text/plain" }), "direct PUT");
  created.push(directPath);
  assert.equal((await expect(await manager.head(bucket, directPath), "direct HEAD")).byteSize, directBytes.byteLength);
  assert.deepEqual(new Uint8Array(await (await expect(await manager.download(bucket, directPath), "direct GET")).arrayBuffer()), directBytes);

  const signedUpload = await expect(await manager.createSignedUploadUrl(bucket, signedPath), "signed PUT URL");
  await expect(await manager.uploadToSignedUrl(bucket, signedPath, signedUpload.token, signedBytes.buffer, { contentType: "text/plain" }), "signed PUT");
  created.push(signedPath);
  assert.equal((await expect(await manager.head(bucket, signedPath), "signed object HEAD")).byteSize, signedBytes.byteLength);

  const signedDownload = await expect(await manager.getSignedUrl(bucket, signedPath, 60, { download: "phase-3.txt" }), "signed GET URL");
  const response = await fetch(signedDownload.signedUrl, { signal: AbortSignal.timeout(15_000) });
  assert.equal(response.ok, true, `signed GET HTTP ${response.status}`);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), signedBytes);
} catch (cause) {
  validationError = cause;
}

const cleanupErrors = [];
for (const path of created.reverse()) {
  const removed = await manager.delete(bucket, [path]);
  if (removed.error) cleanupErrors.push(`${path}: ${removed.error.message}`);
  else {
    const head = await manager.head(bucket, path);
    if (!head.error) cleanupErrors.push(`${path}: object still exists after cleanup`);
  }
}

if (cleanupErrors.length) throw new Error(`B2 test-object cleanup failed: ${cleanupErrors.join("; ")}`);
if (validationError) throw validationError;
console.log(JSON.stringify({ ok: true, prefix: "test/phase-3/<uuid>", directPut: true, signedPut: true, head: true, get: true, signedGet: true, testObjectCleanup: "verified" }));
