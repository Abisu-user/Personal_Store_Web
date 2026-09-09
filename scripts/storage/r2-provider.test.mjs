import assert from "node:assert/strict";
import test from "node:test";

import { R2StorageProvider } from "../../src/lib/storage/r2-provider.ts";

const bucket = "personal-vault-storage";
const accountId = "0123456789abcdef0123456789abcdef";

function provider(respond) {
  const calls = [];
  const client = { send: async (command) => {
    calls.push({ name: command.constructor.name, input: command.input });
    return respond(command.constructor.name, command.input);
  } };
  const signer = async (_client, command, options) => {
    calls.push({ name: `Sign${command.constructor.name}`, input: command.input, options });
    return `https://signed.example/${encodeURIComponent(command.input.Key ?? "")}`;
  };
  return {
    calls,
    value: new R2StorageProvider({ accountId, accessKeyId: "access", secretAccessKey: "secret", bucket }, { client, signer }),
  };
}

test("R2 provider supports Put, HEAD, Get, Delete and bucket-scoped list", async () => {
  const { value, calls } = provider((name) => {
    if (name === "HeadObjectCommand") return { ContentLength: 3, ContentType: "text/plain", ETag: "etag", LastModified: new Date("2026-09-09T00:00:00Z") };
    if (name === "GetObjectCommand") return { ContentType: "text/plain", Body: { transformToByteArray: async () => new Uint8Array([65, 66, 67]) } };
    if (name === "DeleteObjectsCommand") return { Deleted: [{ Key: "test/phase-3/a.txt" }] };
    if (name === "ListObjectsV2Command") return { Contents: [{ Key: "test/phase-3/a.txt", ETag: "etag" }], CommonPrefixes: [] };
    if (name === "ListBucketsCommand") return { Buckets: [{ Name: bucket }, { Name: "not-authorized" }] };
    return {};
  });

  assert.equal((await value.upload(bucket, "test/phase-3/a.txt", new Uint8Array([65, 66, 67]).buffer, { contentType: "text/plain" })).error, null);
  assert.equal((await value.head(bucket, "test/phase-3/a.txt")).data?.byteSize, 3);
  assert.equal(await (await value.download(bucket, "test/phase-3/a.txt")).data?.text(), "ABC");
  assert.equal((await value.list(bucket, "test/phase-3")).data?.[0]?.name, "a.txt");
  assert.deepEqual((await value.listBuckets()).data, [{ id: bucket, name: bucket }]);
  assert.equal((await value.delete(bucket, ["test/phase-3/a.txt"])).error, null);
  assert.deepEqual(calls.filter((call) => !call.name.startsWith("Sign")).map((call) => call.name), [
    "PutObjectCommand", "HeadObjectCommand", "GetObjectCommand", "ListObjectsV2Command", "ListBucketsCommand", "DeleteObjectsCommand",
  ]);
});

test("signed PUT and signed GET are short-lived and keep filename encoding", async () => {
  const { value, calls } = provider(() => ({}));
  const upload = await value.createSignedUploadUrl(bucket, "test/phase-3/signed.txt");
  assert.equal(upload.data?.token, upload.data?.signedUrl);
  const download = await value.getSignedUrl(bucket, "test/phase-3/signed.txt", 60, { download: "測試 檔案.txt" });
  assert.match(download.data?.signedUrl ?? "", /^https:\/\/signed\.example/);
  assert.equal(calls[0].options.expiresIn, 600);
  assert.equal(calls[1].options.expiresIn, 60);
  assert.match(calls[1].input.ResponseContentDisposition, /%E6%B8%AC%E8%A9%A6%20%E6%AA%94%E6%A1%88\.txt/);
});

test("provider rejects any bucket outside the token-scoped configured bucket before network I/O", async () => {
  const { value, calls } = provider(() => ({}));
  const result = await value.head("another-bucket", "test/phase-3/a.txt");
  assert.match(result.error?.message ?? "", /outside the configured provider scope/);
  assert.equal(calls.length, 0);
});

test("signed browser upload uses PUT and propagates HTTP failures", async (context) => {
  const { value } = provider(() => ({}));
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = async (url, init) => { requests.push({ url, init }); return new Response(null, { status: 200 }); };
  const success = await value.uploadToSignedUrl(bucket, "test/phase-3/a.txt", "https://signed.example/a", new Uint8Array([1]).buffer, { contentType: "text/plain" });
  assert.equal(success.error, null);
  assert.equal(requests[0].init.method, "PUT");
  assert.equal(requests[0].init.headers["Content-Type"], "text/plain");
  globalThis.fetch = async () => new Response(null, { status: 403 });
  assert.match((await value.uploadToSignedUrl(bucket, "test/phase-3/a.txt", "https://signed.example/a", new Uint8Array([1]).buffer)).error?.message ?? "", /HTTP 403/);
});

test("configuration requires account-shaped ID, credentials and a valid bucket", () => {
  assert.throws(() => new R2StorageProvider({ accountId: "wrong", accessKeyId: "a", secretAccessKey: "b", bucket }), /ACCOUNT_ID/);
  assert.throws(() => new R2StorageProvider({ accountId, accessKeyId: "", secretAccessKey: "b", bucket }), /credentials/);
  assert.throws(() => new R2StorageProvider({ accountId, accessKeyId: "a", secretAccessKey: "b", bucket: "Bad Bucket" }), /BUCKET_NAME/);
});

