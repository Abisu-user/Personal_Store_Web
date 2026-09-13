/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "../..");
function load(file, dependencies) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    assert.ok(name in dependencies, "Unexpected dependency: " + name);
    return dependencies[name];
  }, AbortSignal, setTimeout, clearTimeout, console });
  return exports;
}
function fixture(fail = "") {
  const stamp = "2026-09-10T12:00:00Z";
  const entry = (id, extra = {}) => ({ id, kind: "note", owner_id: "alice", title: id, updated_at: stamp, deleted_at: null, security_level: "standard", ...extra });
  const anime = (id, extra = {}) => ({ id, user_id: "alice", title: id, updated_at: stamp, deleted_at: null, is_adult: false, ...extra });
  const tables = {
    entries: [entry("visible"), entry("locked", { content_folder_id: "secret", folderLinks: ["secret"] }), entry("hidden", { content_folder_id: "hidden", hiddenFolders: ["hidden"], folderLinks: ["hidden"] }),
      entry("mixed", { content_folder_id: "public", folderLinks: ["public", "secret"] }),
      entry("secure", { security_level: "sensitive" }), entry("bookmark", { kind: "bookmark" }),
      entry("other-user", { owner_id: "bob" }), entry("trash", { deleted_at: stamp })],
    anime_library: [anime("normal"), anime("adult", { is_adult: true }), anime("other-anime", { user_id: "bob" }),
      anime("hidden-anime", { folderLinks: ["private"], hiddenFolders: ["private"] })],
    folder_locks: [{ id: "l1", owner_id: "alice", folder_kind: "note", folder_id: "secret" }, { id: "l2", owner_id: "bob", folder_kind: "note", folder_id: "other" }],
  };
  const calls = [];
  function from(table) {
    let rows = tables[table], start = 0, end = Infinity;
    const filters = []; let selection = ""; let head = false;
    const builder = {
      select(columns, options = {}) { selection = columns; head = Boolean(options.head); return builder; },
      eq(key, value) { filters.push([key, value]); rows = rows.filter(row => row[key] === value); return builder; },
      in(key, values) { rows = rows.filter(row => values.includes(row[key])); return builder; },
      is(key, value) { rows = rows.filter(row => row[key] === value); return builder; },
      or(value) { assert.equal(value, "is_adult.is.null,is_adult.eq.false"); rows = rows.filter(row => !row.is_adult); return builder; },
      order() { return builder; },
      range(a, b) { start = a; end = b + 1; return builder; },
      limit(n) { end = n; return builder; },
      abortSignal() { return builder; },
      then(resolve, reject) {
        calls.push({ table, filters, start, selection });
        assert.ok(filters.some(([key, value]) => ["owner_id", "user_id"].includes(key) && value === "alice"), "All reads owner-scoped");
        const privacyKind = filters.find(([key]) => key === "kind")?.[1];
        const failed = fail === table || fail === `${privacyKind}-privacy` && selection.includes("all_folder_links:");
        if (failed) return Promise.resolve({ error: new Error("offline"), data: null, count: null }).then(resolve, reject);
        let data = rows;
        if (selection.includes("primary_folder:")) data = rows.map(row => ({
          ...row,
          primary_folder: row.content_folder_id || row.folder_id ? { id: row.content_folder_id ?? row.folder_id, is_visible: !(row.hiddenFolders ?? []).includes(row.content_folder_id ?? row.folder_id) } : null,
          all_folder_links: (row.folderLinks ?? []).map(folder_id => ({ folder_id, folder: { id: folder_id, is_visible: !(row.hiddenFolders ?? []).includes(folder_id) } })),
        }));
        const cap = table === "entries" && selection.includes("security_level") && !head ? 2 : 1000;
        return Promise.resolve({ error: null, data: head ? null : data.slice(start, Math.min(end, start + cap)), count: rows.length }).then(resolve, reject);
      },
    };
    return builder;
  }
  const { getDashboardData } = load("src/lib/dashboard/data.ts", {
    "server-only": {},
    "@/lib/supabase/admin": { createAdminClient: () => ({ from }) },
    "@/lib/system/quota": { getUserCapacity: async userId => {
      assert.equal(userId, "alice"); calls.push({ table: "capacity" });
      if (fail === "capacity") throw new Error("offline");
      return { databaseUsedBytes: 24, databaseQuotaBytes: 100, storageUsedBytes: 45, storageQuotaBytes: 200 };
    } },
  });
  return { getDashboardData, calls };
}
test("Real metadata aggregation: capped pagination, ownership, trash/adult exclusion and protected previews", async () => {
  const { getDashboardData, calls } = fixture();
  const data = await getDashboardData("alice");
  assert.equal(data.counts.note, 5); assert.equal(data.counts.bookmark, 1); assert.equal(data.counts.anime, 2);
  assert.equal(data.counts.file, 0);
  assert.deepEqual(Array.from(data.recent, row => row.id).sort(), ["bookmark", "normal", "visible"]);
  assert.deepEqual(calls.filter(call => call.table === "entries" && call.selection.includes("security_level")).map(call => call.start), [0, 2, 4]);
  assert.equal(calls.filter(call => call.table === "capacity").length, 1);
});
test("Protection lookup fails closed without converting unknown counts into fake zero", async () => {
  const locked = await fixture("folder_locks").getDashboardData("alice");
  assert.deepEqual(Array.from(locked.recent, row => row.id), ["normal"]); assert.equal(locked.recentAvailable, false); assert.equal(locked.counts.note, 5);
  assert.deepEqual(Array.from(locked.recentUnavailableKinds).sort(), ["bookmark", "code", "file", "note", "photo"]);
  const missing = await fixture("entries").getDashboardData("alice");
  assert.equal(missing.counts.note, null); assert.equal(missing.counts.anime, 2);
});
test("Mixed locked and unlocked membership is hidden, while one privacy failure stays type-local", async () => {
  const normal = await fixture().getDashboardData("alice");
  assert.equal(normal.recent.some(row => row.id === "mixed"), false);
  const partial = await fixture("note-privacy").getDashboardData("alice");
  assert.equal(partial.recent.some(row => row.kind === "note"), false);
  assert.equal(partial.recent.some(row => row.kind === "bookmark"), true);
  assert.equal(partial.recent.some(row => row.kind === "anime"), true);
  assert.deepEqual(Array.from(partial.recentUnavailableKinds), ["note"]);
});
test("Nonessential capacity failure preserves available data", async () => {
  const data = await fixture("capacity").getDashboardData("alice");
  assert.equal(data.capacity, null); assert.equal(data.counts.note, 5); assert.equal(data.recentAvailable, true);
});
test("Summary API rejects invalid sessions and uncompleted MFA before reading data", async () => {
  for (const scenario of ["signed-out", "mismatch", "mfa", "valid"]) {
    let reads = 0;
    const user = scenario === "signed-out" ? null : { id: "alice", factors: scenario === "mfa" ? [{ factor_type: "totp", status: "verified" }] : [] };
    const { GET } = load("src/app/api/dashboard/route.ts", {
      "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
      "@/lib/supabase/server": { createClient: async () => ({ auth: {
        getUser: async () => ({ data: { user }, error: null }),
        getClaims: async () => ({ data: { claims: { sub: scenario === "mismatch" ? "bob" : "alice", session_id: "s", aal: "aal1" } }, error: null }),
      } }) },
      "@/lib/dashboard/data": { getDashboardData: async id => { assert.equal(id, "alice"); reads++; return { counts: {} }; } },
    });
    const response = await GET();
    assert.equal(response.status, scenario === "valid" ? 200 : scenario === "mfa" ? 403 : 401);
    assert.equal(reads, scenario === "valid" ? 1 : 0);
    if (scenario === "valid") assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
});
