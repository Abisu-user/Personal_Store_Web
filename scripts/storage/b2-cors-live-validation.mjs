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

const origin = process.env.B2_CORS_TEST_ORIGIN?.trim() || "https://personal-store-web.vercel.app";
const bucket = required("B2_BUCKET_NAME");
const manager = new StorageManager(new B2StorageProvider({
  endpoint: required("B2_ENDPOINT"),
  region: required("B2_REGION"),
  accessKeyId: required("B2_ACCESS_KEY_ID"),
  secretAccessKey: required("B2_SECRET_ACCESS_KEY"),
  bucket,
}));

const objectKey = `test/phase-4-cors/${crypto.randomUUID()}.txt`;
const bytes = new TextEncoder().encode("Personal Vault Phase 4 browser CORS validation");
const digest = await crypto.subtle.digest("SHA-256", bytes);
const checksum = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
let created = false;
let validationError = null;

const expect = (result, label) => {
  if (result.error || !result.data) throw new Error(`${label}: ${result.error?.message ?? "missing data"}`);
  return result.data;
};

try {
  const signed = expect(await manager.createSignedUploadUrl(bucket, objectKey, {
    contentType: "text/plain",
    checksumSha256: checksum,
  }), "signed PUT URL");

  const preflight = await fetch(signed.signedUrl, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type,x-amz-meta-sha256",
    },
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok(preflight.ok, `CORS preflight HTTP ${preflight.status}`);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /PUT/i);

  const upload = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: { Origin: origin, ...signed.headers },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  });
  if (!upload.ok) throw new Error(`signed browser PUT HTTP ${upload.status}: ${(await upload.text()).slice(0, 1000)}`);
  assert.equal(upload.headers.get("access-control-allow-origin"), origin);
  created = true;

  const object = expect(await manager.head(bucket, objectKey), "uploaded object HEAD");
  assert.equal(object.byteSize, bytes.byteLength);
  assert.equal(object.contentType, "text/plain");
  assert.equal(object.checksumSha256, checksum);
} catch (cause) {
  validationError = cause;
}

if (created) {
  const removed = await manager.delete(bucket, [objectKey]);
  if (removed.error) throw new Error(`B2 Phase 4 test cleanup failed: ${removed.error.message}`);
  const afterCleanup = await manager.head(bucket, objectKey);
  if (!afterCleanup.error) throw new Error("B2 Phase 4 test object still exists after cleanup.");
}

if (validationError) throw validationError;
console.log(JSON.stringify({
  ok: true,
  origin,
  objectKey: "test/phase-4-cors/<uuid>.txt",
  preflight: true,
  signedPut: true,
  headVerified: true,
  checksumVerified: true,
  cleanupVerified: true,
}));
