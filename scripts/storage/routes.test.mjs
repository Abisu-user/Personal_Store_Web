import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server.js";
import { loadApp, queryStub } from "./harness.mjs";

const userId = "11111111-1111-4111-8111-111111111111";
const entryId = "22222222-2222-4222-8222-222222222222";
const request = (path, method = "GET", body) => new NextRequest(`https://vault.invalid${path}`, {
  method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
});

function fixture(options = {}) {
  const calls = [];
  const storage = {
    listBuckets: async () => { calls.push(["buckets"]); return { data: [{ id: "vault-files" }], error: null }; },
    from: (bucket) => ({
      createSignedUploadUrl: async (path) => { calls.push(["sign-upload", bucket, path]); return { data: { path, token: "upload-token", signedUrl: "https://storage.invalid/upload" }, error: null }; },
      uploadToSignedUrl: async (...args) => { calls.push(["upload", bucket, ...args]); return { data: { path: args[0] }, error: null }; },
      createSignedUrl: async (...args) => { calls.push(["sign-read", bucket, ...args]); return { data: { signedUrl: "https://storage.invalid/read" }, error: null }; },
      download: async (path) => { calls.push(["download", bucket, path]); return { data: new Blob(["private-file"], { type: "image/webp" }), error: null }; },
      list: async (prefix, search) => { calls.push(["list", bucket, prefix, search]); return { data: search.search ? [{ name: search.search, id: "object-id" }] : [{ name: "file", id: "object-id" }], error: null }; },
      remove: async (paths) => { calls.push(["remove", bucket, paths]); return options.removeError ? { data: null, error: new Error("remove failed") } : { data: [], error: null }; },
    }),
  };
  const admin = {
    storage,
    rpc: async (name, args) => { calls.push(["rpc", name, args]); return { data: options.capacity ?? { storageUsedBytes: 0, storageQuotaBytes: 100_000_000 }, error: null }; },
    from: (table) => { calls.push(["table", table]); return queryStub({ data: options.row === undefined ? { id: entryId } : options.row, error: null }, calls); },
    auth: { admin: {
      getUserById: async (id) => { calls.push(["get-user", id]); return { data: { user: { id, email: "test@example.invalid" } }, error: null }; },
      deleteUser: async (...args) => { calls.push(["delete-user", ...args]); return { error: null }; },
    } },
  };
  const load = loadApp({
    "@/lib/security/activity": { getSecurityContext: async () => options.unauthorized ? null : { userId, ipHash: "test-ip" } },
    "@/lib/security/adult-content": { hasAdultContentAccess: async () => options.adultAllowed ?? true },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/supabase/client": { createClient: () => ({ storage }) },
    "@/lib/files/data": { getFilesWorkspaceData: async () => { throw new Error("Unexpected workspace reload"); } },
    "@/lib/photos/data": { getPhotosWorkspaceData: async () => { throw new Error("Unexpected workspace reload"); } },
  }, options.globals);
  return { calls, load };
}

const uploadCases = [
  ["files", "/api/files/upload-url", "vault-files", `${userId}/`, { originalFilename: "檔案.pdf", mimeType: "application/pdf", byteSize: 4, sha256: "a".repeat(64) }],
  ["photos", "/api/photos/upload-url", "vault-files", `${userId}/photos/`, { originalFilename: "照片.png", mimeType: "image/png", byteSize: 4, sha256: "b".repeat(64) }],
  ["covers", "/api/content-covers/upload-url", "content-covers", `${userId}/covers/`, { mimeType: "image/webp", byteSize: 4 }],
  ["desktop", "/api/appearance/backgrounds", "workspace-backgrounds", `${userId}/desktop/`, { device: "desktop", mimeType: "image/webp", byteSize: 4 }],
  ["mobile", "/api/appearance/backgrounds", "workspace-backgrounds", `${userId}/mobile/`, { device: "mobile", mimeType: "image/png", byteSize: 4 }],
];

for (const [label, path, bucket, prefix, body] of uploadCases) {
  test(`${label} upload API: session-owned key, quota before signing, unchanged response/ticket`, async () => {
    const { load, calls } = fixture();
    const response = await load(`src/app${path}/route.ts`).POST(request(path, "POST", { ...body, userId: "attacker", storagePath: "other/file" }));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.token, "upload-token");
    assert.ok(data.storagePath.startsWith(prefix));
    assert.deepEqual(Object.keys(data).sort(), path.includes("backgrounds") ? ["storagePath", "token"] : ["storagePath", "ticket", "token"]);
    assert.match(response.headers.get("Cache-Control"), /private, no-store/);
    assert.deepEqual(calls[0], ["rpc", "vault_user_capacity", { target_user_id: userId }]);
    assert.deepEqual(calls[1], ["sign-upload", bucket, data.storagePath]);
    if (data.ticket) {
      const ticketModule = label === "covers" ? "cover" : "file";
      const verifier = load(`src/lib/security/${ticketModule}-upload-ticket.ts`)[ticketModule === "cover" ? "verifyCoverUploadTicket" : "verifyFileUploadTicket"];
      assert.equal(verifier(data.ticket).ownerId, userId);
      assert.equal(verifier(data.ticket).byteSize, 4);
      assert.equal(verifier(`${data.ticket}tampered`), null);
    }
  });

  test(`${label}: full quota or unauthenticated request never issues an upload token`, async () => {
    for (const [options, expected] of [[{ capacity: { storageUsedBytes: 100, storageQuotaBytes: 100 } }, 413], [{ unauthorized: true }, 401]]) {
      const { load, calls } = fixture(options);
      const response = await load(`src/app${path}/route.ts`).POST(request(path, "POST", body));
      assert.equal(response.status, expected);
      assert.equal(calls.some(([op]) => op === "sign-upload"), false);
      if (expected === 413) assert.equal((await response.json()).code, "STORAGE_QUOTA_EXCEEDED");
    }
  });
}

for (const kind of ["files", "photos"]) {
  test(`${kind} finalize still verifies signed metadata, checks object, and saves original path`, async () => {
    const { load, calls } = fixture();
    const upload = load(`src/app/api/${kind}/upload-url/route.ts`);
    const body = uploadCases.find(([label]) => label === kind)[4];
    const ticket = await (await upload.POST(request(`/api/${kind}/upload-url`, "POST", body))).json();
    const response = await load(`src/app/api/${kind}/route.ts`).POST(request(`/api/${kind}`, "POST", { ticket: ticket.ticket, title: "測試檔案" }));
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { id: entryId });
    assert.ok(calls.some(([op, bucket, prefix, search]) => op === "list" && bucket === "vault-files" && prefix === (kind === "photos" ? `${userId}/photos` : userId) && search.search === ticket.storagePath.split("/").at(-1)));
    assert.ok(calls.some(([op, values]) => op === "insert" && values.storage_path === ticket.storagePath && values.byte_size === 4));
    const invalid = await load(`src/app/api/${kind}/route.ts`).POST(request(`/api/${kind}`, "POST", { ticket: `${ticket.ticket}tampered`, title: "測試" }));
    assert.equal(invalid.status, 400);
  });
}

test("file download retains 60-second signed attachment URL; missing owner record does not read Storage", async () => {
  const { load, calls } = fixture({ row: { file_details: { storage_path: `${userId}/file`, original_filename: "中文 檔案.pdf" } } });
  const response = await load("src/app/api/files/route.ts").GET(request(`/api/files?download=${entryId}`));
  assert.deepEqual(await response.json(), { url: "https://storage.invalid/read" });
  assert.ok(calls.some(([op, name, value]) => op === "eq" && name === "owner_id" && value === userId));
  assert.ok(calls.some(([op, , , expiry, options]) => op === "sign-read" && expiry === 60 && options.download === "中文 檔案.pdf"));
  const missing = fixture({ row: null });
  assert.equal((await missing.load("src/app/api/files/route.ts").GET(request(`/api/files?download=${entryId}`))).status, 404);
  assert.equal(missing.calls.some(([op]) => op === "sign-read"), false);
});

for (const [label, module, url, row, bucket, path] of [
  ["photo", "src/app/api/photos/route.ts", `/api/photos?image=${entryId}`, { file_details: { storage_path: `${userId}/photos/photo`, mime_type: "image/png" } }, "vault-files", `${userId}/photos/photo`],
  ["content cover", "src/app/api/content-covers/route.ts", `/api/content-covers?entry=${entryId}`, { cover_image_path: `${userId}/covers/cover` }, "content-covers", `${userId}/covers/cover`],
  ["anime cover", "src/app/api/anime/library/[id]/cover/route.ts", `/api/anime/library/${entryId}/cover`, { cover_url: `${userId}/covers/anime`, is_adult: false }, "content-covers", `${userId}/covers/anime`],
]) {
  test(`${label} download remains same-origin private binary response with ownership filter`, async () => {
    const { load, calls } = fixture({ row });
    const response = await load(module).GET(request(url), { params: Promise.resolve({ id: entryId }) });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "private-file");
    assert.match(response.headers.get("Cache-Control"), /private, no-store/);
    assert.ok(calls.some(([op, name, value]) => op === "eq" && ["owner_id", "user_id"].includes(name) && value === userId));
    assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["download", bucket, path])));
  });
}

test("adult cover authorization still prevents a Storage read", async () => {
  const { load, calls } = fixture({ adultAllowed: false, row: { cover_url: `${userId}/covers/adult`, is_adult: true } });
  const response = await load("src/app/api/anime/library/[id]/cover/route.ts").GET(request(`/api/anime/library/${entryId}/cover`), { params: Promise.resolve({ id: entryId }) });
  assert.equal(response.status, 403);
  assert.equal(calls.some(([op]) => op === "download"), false);
});

test("background URLs stay account/device scoped, use existing prefix and one-day expiry", async () => {
  const own = `workspace-storage:${userId}/desktop/bg`;
  const foreign = "workspace-storage:other/desktop/bg";
  const mobile = `workspace-storage:${userId}/mobile/bg`;
  const { load, calls } = fixture();
  const defaults = load("src/lib/appearance/preferences.ts").appearanceDefaults;
  const target = fixture({ row: { preferences: { ...defaults, backgroundImages: [own, foreign, mobile] } } });
  const response = await target.load("src/app/api/appearance/route.ts").GET(request("/api/appearance?device=desktop"));
  const data = await response.json();
  assert.deepEqual(data.appearance.backgroundImages, [own]);
  assert.deepEqual(data.imageUrls, { [own]: "https://storage.invalid/read" });
  assert.deepEqual(target.calls.filter(([op]) => op === "sign-read"), [["sign-read", "workspace-backgrounds", `${userId}/desktop/bg`, 86400, undefined]]);
  assert.equal(calls.length, 0);
});

test("background removal blocks wrong account/device and still removes the owned object", async () => {
  const { load, calls } = fixture({ row: null });
  const route = load("src/app/api/appearance/backgrounds/route.ts");
  for (const reference of [`workspace-storage:other/desktop/bg`, `workspace-storage:${userId}/mobile/bg`]) {
    assert.equal((await route.DELETE(request("/api/appearance/backgrounds", "DELETE", { device: "desktop", reference }))).status, 403);
  }
  assert.equal(calls.length, 0);
  assert.equal((await route.DELETE(request("/api/appearance/backgrounds", "DELETE", { device: "desktop", reference: `workspace-storage:${userId}/desktop/bg` }))).status, 200);
  assert.deepEqual(calls.find(([op]) => op === "remove"), ["remove", "workspace-backgrounds", [`${userId}/desktop/bg`]]);
});

for (const kind of ["files", "photos"]) {
  test(`${kind} permanent deletion stops before DB deletion when Storage fails`, async () => {
    for (const removeError of [false, true]) {
      const path = `${userId}/${kind === "photos" ? "photos/" : ""}file`;
      const { load, calls } = fixture({ removeError, row: { id: entryId, file_details: { storage_path: path }, cover_image_path: null } });
      const response = await load(`src/app/api/${kind}/route.ts`).DELETE(request(`/api/${kind}`, "DELETE", { id: entryId }));
      assert.equal(response.status, removeError ? 503 : 200);
      assert.deepEqual(calls.find(([op]) => op === "remove"), ["remove", "vault-files", [path]]);
      assert.equal(calls.some(([op]) => op === "delete"), !removeError);
    }
  });
}

test("account deletion still removes Storage before verification flows and Auth, and stops on errors", async () => {
  for (const removeError of [false, true]) {
    const { load, calls } = fixture({ removeError });
    const run = load("src/lib/security/account-deletion.ts").permanentlyDeleteAccount(userId);
    if (removeError) await assert.rejects(run, /remove failed/);
    else await run;
    const removed = calls.findIndex(([op]) => op === "remove");
    const authDeleted = calls.findIndex(([op]) => op === "delete-user");
    assert.ok(removed >= 0);
    if (removeError) { assert.equal(authDeleted, -1); assert.equal(calls.some(([op]) => op === "delete"), false); }
    else {
      assert.ok(authDeleted > removed);
      assert.deepEqual(calls[authDeleted], ["delete-user", userId, false]);
      assert.ok(calls.some(([op, table]) => op === "table" && table === "auth_verification_flows"));
    }
  }
});

for (const device of ["desktop", "mobile"]) {
  test(`${device} background client uses shared browser manager without changing persisted reference`, async () => {
    let preparation;
    const blob = new Blob(["background"], { type: "image/webp" });
    const { load, calls } = fixture({ globals: {
      window: { matchMedia: () => ({ matches: device === "mobile" }) },
      URL: { createObjectURL: () => "blob:test" },
      fetch: async (url, options) => { preparation = [url, JSON.parse(options.body)]; return Response.json({ storagePath: `${userId}/${device}/bg.webp`, token: "upload-token" }); },
    } });
    const preferences = load("src/lib/appearance/preferences.ts");
    preferences.setAppearanceIdentity(userId);
    assert.equal(await preferences.storeBackgroundImage(blob), `workspace-storage:${userId}/${device}/bg.webp`);
    assert.deepEqual(preparation, ["/api/appearance/backgrounds", { device, byteSize: blob.size, mimeType: "image/webp" }]);
    assert.deepEqual(calls.find(([op]) => op === "upload"), ["upload", "workspace-backgrounds", `${userId}/${device}/bg.webp`, "upload-token", blob, { contentType: "image/webp" }]);
  });
}

test("shared cover client still crops to WebP and returns the existing signed finalize ticket", async () => {
  const blob = new Blob(["cropped-cover"], { type: "image/webp" });
  const { load, calls } = fixture({ globals: {
    Image: class { naturalWidth = 100; naturalHeight = 100; set src(value) { queueMicrotask(() => this.onload()); } },
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: (callback) => callback(blob) }) },
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    fetch: async () => Response.json({ storagePath: `${userId}/covers/cropped`, token: "upload-token", ticket: "finalize-ticket" }),
  } });
  const result = await load("src/components/content/cover-image-field.tsx").uploadCover({ file: new File(["original"], "cover.jpg"), crop: { x: 50, y: 50, zoom: 100 } });
  assert.equal(result, "finalize-ticket");
  assert.deepEqual(calls.find(([op]) => op === "upload"), ["upload", "content-covers", `${userId}/covers/cropped`, "upload-token", blob, { contentType: "image/webp" }]);
});
