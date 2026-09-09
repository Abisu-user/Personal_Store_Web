import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { StorageManager } from "../../src/lib/storage/manager.ts";
import { SupabaseStorageProvider } from "../../src/lib/storage/supabase-provider.ts";
import { removeOwnedStorage } from "../../src/lib/storage/cleanup.ts";

function transportFixture(respond) {
  const requests = [];
  const client = createClient("https://storage-regression.invalid", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      const request = { url: new URL(url), ...init };
      requests.push(request);
      return respond(request);
    } },
  });
  return { manager: new StorageManager(new SupabaseStorageProvider(client.storage)), requests };
}

const json = (data, status = 200) => Response.json(data, { status });

for (const [feature, bucket, path, contentType] of [
  ["anime cover", "content-covers", "user-a/covers/anime", "image/webp"],
  ["bookmark cover", "content-covers", "user-a/covers/bookmark", "image/webp"],
  ["note cover", "content-covers", "user-a/covers/note", "image/webp"],
  ["code cover", "content-covers", "user-a/covers/code", "image/webp"],
  ["desktop background", "workspace-backgrounds", "user-a/desktop/image.webp", "image/webp"],
  ["mobile background", "workspace-backgrounds", "user-a/mobile/image.png", "image/png"],
  ["photo", "vault-files", "user-a/photos/photo", "image/jpeg"],
  ["file/attachment", "vault-files", "user-a/file", "application/octet-stream"],
]) {
  test(`${feature}: signed upload uses the same Supabase bucket/key/token and exact bytes`, async () => {
    const { manager, requests } = transportFixture(({ url, method }) => {
      assert.ok(url.pathname.endsWith(`/${bucket}/${path}`));
      return method === "POST"
        ? json({ url: `/object/upload/sign/${bucket}/${path}?token=test-token` })
        : json({ Key: `${bucket}/${path}` });
    });
    const ticket = await manager.createSignedUploadUrl(bucket, path);
    assert.equal(ticket.error, null);
    assert.equal(ticket.data.token, "test-token");
    assert.equal(ticket.data.path, path);
    const bytes = new Uint8Array([0, 128, 255, 33]);
    const uploaded = await manager.uploadToSignedUrl(bucket, path, ticket.data.token, new Blob([bytes], { type: contentType }), { contentType });
    assert.equal(uploaded.error, null);
    assert.equal(uploaded.data.path, path);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].method, "PUT");
    assert.equal(requests[1].url.searchParams.get("token"), "test-token");
    const file = [...requests[1].body.values()].find((value) => value instanceof Blob);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
    assert.equal(file.type, contentType);
    assert.notEqual(new Headers(requests[1].headers).get("x-upsert"), "true");
  });
}

test("upload/download/head/delete retain binary data and do not add extra requests", async () => {
  const bytes = new Uint8Array([0, 255, 12, 0]);
  const { manager, requests } = transportFixture(({ url, method }) => {
    if (url.pathname.includes("/object/info/")) return json({ name: "user-a/file", size: 4, content_type: "application/octet-stream", etag: "test-etag", last_modified: "2026-09-08T00:00:00Z" });
    if (method === "POST") return json({ Id: "object-id", Key: "vault-files/user-a/file" });
    if (method === "DELETE") return json([{ name: "user-a/file", id: "object-id" }]);
    return new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } });
  });
  assert.equal((await manager.upload("vault-files", "user-a/file", bytes.buffer, { contentType: "application/octet-stream" })).error, null);
  const downloaded = await manager.download("vault-files", "user-a/file");
  assert.deepEqual(new Uint8Array(await downloaded.data.arrayBuffer()), bytes);
  assert.deepEqual((await manager.head("vault-files", "user-a/file")).data, {
    name: "user-a/file", byteSize: 4, contentType: "application/octet-stream", etag: "test-etag", lastModified: "2026-09-08T00:00:00Z", checksumSha256: null,
  });
  assert.equal((await manager.delete("vault-files", ["user-a/file"])).error, null);
  assert.equal(requests.length, 4);
  assert.deepEqual(JSON.parse(requests[3].body), { prefixes: ["user-a/file"] });
});

test("head keeps unknown size null instead of claiming zero bytes, and preserves real zero", async () => {
  for (const [response, expected] of [[{ name: "file" }, null], [{ name: "file", size: 0 }, 0], [{ name: "file", metadata: { size: 123, mimetype: "image/png" } }, 123]]) {
    const { manager } = transportFixture(() => json(response));
    assert.equal((await manager.head("vault-files", "file")).data.byteSize, expected);
  }
});

test("signed downloads retain expiry and original filename, including Unicode", async () => {
  const { manager, requests } = transportFixture(() => json({ signedURL: "/object/sign/vault-files/user-a/file?token=read-token" }));
  const result = await manager.getSignedUrl("vault-files", "user-a/file", 60, { download: "研究 筆記(1).pdf" });
  assert.equal(result.error, null);
  // The installed SDK percent-encodes the filename before encoding the whole URL.
  assert.equal(decodeURIComponent(new URL(result.data.signedUrl).searchParams.get("download")), "研究 筆記(1).pdf");
  assert.deepEqual(JSON.parse(requests[0].body), { expiresIn: 60 });
});

test("list preserves search, pagination, ordering, and folder markers", async () => {
  const { manager, requests } = transportFixture(() => json([{ name: "photos", id: null }, { name: "file", id: "object-id" }]));
  const result = await manager.list("vault-files", "user-a", { limit: 20, offset: 100, search: "file", sortBy: { column: "name", order: "asc" } });
  assert.equal(result.data[0].id, null);
  assert.deepEqual(JSON.parse(requests[0].body), { prefix: "user-a", limit: 20, offset: 100, search: "file", sortBy: { column: "name", order: "asc" } });
});

test("provider errors remain errors (including quota, expired upload and missing objects)", async () => {
  for (const [status, message] of [[403, "quota_exceeded:storage"], [400, "Invalid token"], [404, "Object not found"]]) {
    const { manager } = transportFixture(() => json({ message, statusCode: String(status), error: message }, status));
    const operations = [
      () => manager.createSignedUploadUrl("vault-files", "user-a/file"),
      () => manager.uploadToSignedUrl("vault-files", "user-a/file", "bad", new Blob(["file"])),
      () => manager.getSignedUrl("vault-files", "user-a/file", 60),
      () => manager.download("vault-files", "user-a/file"),
      () => manager.head("vault-files", "user-a/file"),
      () => manager.delete("vault-files", ["user-a/file"]),
      () => manager.list("vault-files", "user-a"),
      () => manager.listBuckets(),
    ];
    for (const operation of operations) {
      const result = await operation();
      assert.equal(result.data, null);
      assert.equal(result.error.message, message);
    }
  }
});

function cleanupFixture() {
  const records = new Map([
    ["vault-files", new Set([...Array.from({ length: 205 }, (_, i) => `user-a/file-${String(i).padStart(3, "0")}`), "user-a/photos/nested/image", "user-b/keep", "user-a-other/keep"])],
    ["content-covers", new Set(["user-a/covers/cover", "user-b/covers/keep"])],
    ["workspace-backgrounds", new Set(["user-a/desktop/bg", "user-a/mobile/bg"])],
    ["additional-bucket", new Set(["user-a/attachment", "user-b/keep"])],
  ]);
  const calls = [];
  const provider = {
    listBuckets: async () => ({ data: [...records.keys()].map((id) => ({ id, name: id })), error: null }),
    list: async (bucket, prefix, options) => {
      calls.push(["list", bucket, prefix, options]);
      const rows = new Map();
      for (const key of records.get(bucket)) {
        if (!key.startsWith(`${prefix}/`)) continue;
        const tail = key.slice(prefix.length + 1);
        const name = tail.split("/")[0];
        rows.set(name, { name, id: tail.includes("/") ? null : key });
      }
      return { data: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(options.offset, options.offset + options.limit), error: null };
    },
    delete: async (bucket, paths) => {
      calls.push(["delete", bucket, paths]);
      paths.forEach((path) => records.get(bucket).delete(path));
      return { data: [], error: null };
    },
  };
  return { records, calls, provider, manager: new StorageManager(provider) };
}

test("account cleanup traverses all buckets/pages, batches 100, isolates accounts and is retryable", async () => {
  const { manager, records, calls } = cleanupFixture();
  await removeOwnedStorage(manager, "user-a");
  for (const remaining of records.values()) assert.ok([...remaining].every((key) => !key.startsWith("user-a/")));
  assert.deepEqual([...records.get("vault-files")].sort(), ["user-a-other/keep", "user-b/keep"]);
  assert.ok(calls.filter(([type]) => type === "delete").every(([, , paths]) => paths.length <= 100));
  assert.ok(calls.some(([type, , prefix, options]) => type === "list" && prefix === "user-a" && options.offset === 200));
  const firstDelete = calls.findIndex(([type, bucket]) => type === "delete" && bucket === "vault-files");
  assert.ok(calls.slice(firstDelete).every(([type, bucket]) => !(type === "list" && bucket === "vault-files")));
  const deleteCount = calls.filter(([type]) => type === "delete").length;
  await removeOwnedStorage(manager, "user-a");
  assert.equal(calls.filter(([type]) => type === "delete").length, deleteCount);
});

test("cleanup fails closed on bucket/list/delete errors and allows retry after partial deletion", async () => {
  for (const operation of ["listBuckets", "list", "delete"]) {
    const { provider, records } = cleanupFixture();
    const original = provider[operation];
    let count = 0;
    provider[operation] = async (...args) => {
      count += 1;
      if (operation !== "delete" || count === 2) return { data: null, error: new Error("storage unavailable") };
      return original(...args);
    };
    await assert.rejects(removeOwnedStorage(new StorageManager(provider), "user-a"), /storage unavailable/);
    assert.ok(records.get("vault-files").has("user-b/keep"));
    provider[operation] = original;
    await removeOwnedStorage(new StorageManager(provider), "user-a");
    for (const remaining of records.values()) assert.ok([...remaining].every((key) => !key.startsWith("user-a/")));
  }
});

test("cleanup aborts excessive nesting without deleting anything", async () => {
  let deleted = false;
  const manager = new StorageManager({
    listBuckets: async () => ({ data: [{ id: "bucket" }], error: null }),
    list: async () => ({ data: [{ name: "nested", id: null }], error: null }),
    delete: async () => { deleted = true; return { data: [], error: null }; },
  });
  await assert.rejects(removeOwnedStorage(manager, "user-a"), /nesting is too deep/);
  assert.equal(deleted, false);
});
