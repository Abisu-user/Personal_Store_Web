/* eslint-disable @typescript-eslint/no-require-imports */
// Runs the real TypeScript helpers/API/Edge handler with isolated browser/provider/DB doubles.
// No production credentials or real notifications are used.
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), ts = require("typescript");
const nodeCrypto = require("node:crypto");
// Deterministic, test-only scalars. Never generate or replace production VAPID secrets.
const privateFixture = Buffer.alloc(32); privateFixture[31] = 1;
const fixtureCurve = nodeCrypto.createECDH("prime256v1"); fixtureCurve.setPrivateKey(privateFixture);
const fixturePublic = fixtureCurve.getPublicKey().toString("base64url");
const root = path.resolve(__dirname, "../..");
function load(file, mocks = {}, globals = {}) {
  const filename = path.join(root, file);
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const requireModule = name => {
    if (name in mocks) return mocks[name];
    if (["node:buffer", "node:crypto"].includes(name)) return require(name);
    if (name.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), name.replace(/\.ts$/, "") + ".ts")), mocks, globals);
    throw new Error("Unmocked dependency: " + name);
  };
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: requireModule, URL, Response, Request, AbortSignal,
    Uint8Array, ArrayBuffer, MessageChannel, Error, atob, setTimeout, clearTimeout, console, crypto: nodeCrypto.webcrypto, process: { env: {} }, ...globals }, { filename });
  return loadedModule.exports;
}
const good = { supported: true, permission: "granted", workerActive: true, subscriptionExists: true, keyMatches: true, server: { enabled: true }, config: { dispatcher: "ready" }, error: null };
test("enabled requires every layer; permission alone never suffices", () => {
  const { notificationEnabled, maskSubscriptionId } = load("src/lib/calendar/push-diagnostics.ts");
  assert.equal(notificationEnabled(good), true);
  for (const key of ["supported", "workerActive", "subscriptionExists", "keyMatches"]) assert.equal(notificationEnabled({ ...good, [key]: false }), false, key);
  for (const permission of ["default", "denied"]) assert.equal(notificationEnabled({ ...good, permission }), false);
  assert.equal(notificationEnabled({ ...good, server: null }), false);
  assert.equal(notificationEnabled({ ...good, server: { enabled: false } }), false);
  assert.equal(notificationEnabled({ ...good, config: { dispatcher: "key-mismatch" } }), false);
  assert.equal(notificationEnabled({ ...good, error: "Sync failed" }), false);
  assert.equal(maskSubscriptionId("12345678-0000-0000-0000-123456789abc"), "12345678…9abc");
});

test("production statuses are friendly and preserve strict health requirements", () => {
  const { notificationStatus, notificationStatusLabels } = load("src/lib/calendar/push-diagnostics.ts");
  assert.equal(notificationStatus(good), "enabled");
  assert.equal(notificationStatus(good, true), "off");
  assert.equal(notificationStatus({ ...good, permission: "default" }), "off");
  assert.equal(notificationStatus({ ...good, permission: "denied" }), "blocked");
  assert.equal(notificationStatus({ ...good, supported: false }), "unsupported");
  assert.equal(notificationStatus({ ...good, config: null }), "unavailable");
  assert.equal(notificationStatus({ ...good, config: { dispatcher: "unreachable" } }), "unavailable");
  for (const key of ["workerActive", "subscriptionExists", "keyMatches"]) {
    assert.equal(notificationStatus({ ...good, [key]: false }), "resync");
  }
  assert.equal(notificationStatus({ ...good, server: null }), "resync");
  assert.equal(notificationStatus({ ...good, server: { enabled: false } }), "resync", "expired server row is not an explicit opt-out");
  assert.equal(notificationStatus({ ...good, error: "HTTP 503 VAPID_CONFIG_INVALID" }), "resync");
  assert.ok(Object.values(notificationStatusLabels).every(label => !/HTTP|VAPID|SUBSCRIPTION|PUSH/.test(label)));
});

function browserFixture({ permission = "granted", exists = true, server = null, keyMismatch = false, optOut = false, syncFails = false, gestureRequired = false, workerActive = true } = {}) {
  let subscription = exists ? makeSubscription() : null;
  let subscribed = 0, synced = 0;
  const permissionCalls = [];
  const calls = [];
  const device = { id: "00000000-0000-0000-0000-000000000001", enabled: true, lastSyncedAt: "2026-10-01T06:00:00Z" };
  function makeSubscription() { return { endpoint: "https://web.push.apple.com/fake-secret-endpoint", options: { applicationServerKey: Uint8Array.from(keyMismatch ? [9, 9, 9] : [1, 2, 3]).buffer }, toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "fake", auth: "fake" } }; } }; }
  const registration = { scope: "https://app.test/", active: workerActive ? { state: "activated", postMessage(_message, ports) { ports[0].postMessage({ buildId: "worker-test" }); } } : null,
    pushManager: { getSubscription: async () => subscription, subscribe: async () => { subscribed++; if (gestureRequired) throw new Error("Gesture required"); subscription = makeSubscription(); return subscription; } } };
  const config = { publicKey: "AQID", accountId: "account-a", dispatcher: "ready" };
  const globals = { isSecureContext: true, location: { origin: "https://app.test" },
    navigator: { serviceWorker: { register: async () => registration, ready: Promise.resolve(registration) } },
    window: { PushManager: {}, Notification: {} }, Notification: { permission, requestPermission() { permissionCalls.push(true); } },
    localStorage: { getItem: () => optOut ? "true" : null },
    fetch: async (url, options) => {
      const body = options?.body ? JSON.parse(options.body) : null; calls.push({ url, body });
      if (!body) return Response.json(config);
      if (body.action === "inspect") return Response.json({ device: server });
      synced++;
      return syncFails ? Response.json({ error: "DB unavailable" }, { status: 503 }) : Response.json({ device });
    },
  };
  return { inspect: load("src/lib/calendar/push-device.ts", {}, globals).inspectPushDevice,
    stats: () => ({ subscribed, synced, permissionCalls, calls }) };
}
test("default/denied never prompt or auto-subscribe", async () => {
  for (const permission of ["default", "denied"]) {
    const fixture = browserFixture({ permission, exists: false });
    const { diagnostics } = await fixture.inspect();
    assert.equal(diagnostics.permission, permission); assert.equal(fixture.stats().subscribed, 0); assert.equal(fixture.stats().synced, 0);
    assert.equal(fixture.stats().permissionCalls.length, 0);
  }
});
test("granted + null repairs, and missing server row is synchronized", async () => {
  const fixture = browserFixture({ exists: false });
  const { diagnostics } = await fixture.inspect();
  assert.equal(fixture.stats().subscribed, 1); assert.equal(fixture.stats().synced, 1);
  assert.equal(diagnostics.server.enabled, true); assert.equal(diagnostics.workerVersion, "worker-test");
  assert.equal(fixture.stats().permissionCalls.length, 0);
  assert.ok(fixture.stats().calls.every(call => !call.url.includes("endpoint=")), "endpoint never in a GET URL");
});
test("existing subscription is reused, not regenerated, after sync/deploy", async () => {
  const fixture = browserFixture({ server: { enabled: true } });
  await fixture.inspect(); await fixture.inspect();
  assert.equal(fixture.stats().subscribed, 0); assert.equal(fixture.stats().synced, 2);
});
test("disabled server row, opt-out, inactive SW, and mismatched key do not auto-enable", async () => {
  for (const options of [{ server: { enabled: false } }, { optOut: true, exists: false }, { workerActive: false, exists: false }, { keyMismatch: true }]) {
    const fixture = browserFixture(options); await fixture.inspect();
    assert.equal(fixture.stats().synced, 0); assert.equal(fixture.stats().subscribed, 0);
  }
});
test("DB failure preserves subscription; Safari gesture rejection is actionable, not enabled", async () => {
  const fixture = browserFixture({ syncFails: true });
  const result = await fixture.inspect(); assert.equal(result.diagnostics.subscriptionExists, true); assert.equal(result.diagnostics.server, null); assert.match(result.diagnostics.error, /DB unavailable/);
  const safari = browserFixture({ exists: false, gestureRequired: true });
  const failed = await safari.inspect(); assert.equal(failed.diagnostics.subscriptionExists, false); assert.match(failed.diagnostics.error, /Gesture/);
});

function edgeFixture({ status = 201, ownerMismatch = false, disableFails = false, missing = [], overrides = {}, libraryError = null } = {}) {
  let handler, sends = 0; const filters = [], updates = [];
  const env = { CALENDAR_DISPATCH_SECRET: "private-dispatch", VAPID_PUBLIC_KEY: fixturePublic, VAPID_PRIVATE_KEY: privateFixture.toString("base64url"), VAPID_SUBJECT: "mailto:contact@example.test", SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service-key", ...overrides };
  for (const name of missing) delete env[name];
  const device = { id: "00000000-0000-0000-0000-000000000001", endpoint: "https://web.push.apple.com/secret", auth: "secret-auth", p256dh: "secret-key" };
  const db = { from(table) { assert.equal(table, "calendar_push_subscriptions", "test push cannot query reminders or deliveries"); const query = {
    select() { return this; }, eq(field, value) { filters.push([field, value]); return this; },
    maybeSingle: async () => ({ data: ownerMismatch ? null : device, error: null }),
    update(value) { updates.push(value); return this; }, then(resolve) { resolve({ error: disableFails ? { code: "DB" } : null }); },
  }; return query; } };
  const push = { setVapidDetails() { if (libraryError) throw libraryError; }, async sendNotification(_device, payload) { sends++; const body = JSON.parse(payload); assert.equal(body.type, "calendar-test"); assert.equal(body.url, "/calendar"); assert.equal("description" in body, false); if (status !== 201) throw { statusCode: status, body: "secret-provider-response" }; return { statusCode: 201 }; } };
  load("supabase/functions/send-calendar-test-push/index.ts", { "npm:@supabase/supabase-js@2.112.3": { createClient: () => db }, "npm:web-push@3.6.7": push },
    { Deno: { env: { get: name => env[name] }, serve: value => { handler = value; } }, console: { info() {}, warn() {}, error() {} } });
  return { invoke: (body, secret = "private-dispatch") => handler(new Request("https://edge.test", { method: "POST", headers: { "x-calendar-dispatch-secret": secret }, body: JSON.stringify(body) })), stats: () => ({ sends, filters, updates }) };
}
const testBody = { action: "test", expectedPublicKey: fixturePublic, ownerId: "00000000-0000-4000-8000-000000000002", subscriptionId: "00000000-0000-4000-8000-000000000001" };
test("Edge diagnostics never send; rejects unauthorized and mismatched VAPID", async () => {
  const f = edgeFixture();
  assert.equal((await f.invoke({ action: "diagnostics", expectedPublicKey: fixturePublic })).status, 200);
  assert.equal((await f.invoke(testBody, "wrong")).status, 401);
  assert.equal((await f.invoke({ ...testBody, expectedPublicKey: "wrong" })).status, 409);
  assert.equal(f.stats().sends, 0);
});
test("Edge test sends only to authenticated owner's selected device and returns provider acceptance", async () => {
  const f = edgeFixture(), result = await (await f.invoke(testBody)).json();
  assert.equal(result.code, "PUSH_ACCEPTED"); assert.equal(result.providerStatus, 201); assert.equal(f.stats().sends, 1);
  assert.equal(result.serverConfigured, true); assert.equal(result.subscriptionFound, true); assert.equal(result.pushAttempted, true); assert.equal(result.invalidSubscription, false);
  assert.ok(f.stats().filters.some(([key, value]) => key === "owner_id" && value === testBody.ownerId));
  assert.ok(!JSON.stringify(result).includes("secret"));
  const other = edgeFixture({ ownerMismatch: true }); assert.equal((await other.invoke(testBody)).status, 404); assert.equal(other.stats().sends, 0);
});
test("expired endpoint disabled; VAPID errors preserved without leaking provider body", async () => {
  for (const status of [404, 410, 401, 403, 429, 500]) {
    const f = edgeFixture({ status }), response = await f.invoke(testBody), result = await response.json();
    assert.equal(result.providerStatus, status); assert.equal(result.ok, false);
    assert.equal(f.stats().updates.length, [404, 410].includes(status) ? 1 : 0);
    if ([404, 410].includes(status)) { assert.equal(result.code, "SUBSCRIPTION_EXPIRED"); assert.equal(f.stats().updates[0].enabled, false); }
    if ([401, 403].includes(status)) assert.equal(result.code, "VAPID_REJECTED");
    assert.ok(!JSON.stringify(result).includes("secret"));
  }
});

test("Next test route enforces auth, origin and ownership before forwarding", async () => {
  let owner = null, allowed = true, forwarded = 0; const filters = [];
  const db = { from() { return { select() { return this; }, eq(field, value) { filters.push([field, value]); return this; }, maybeSingle: async () => ({ data: allowed ? { id: testBody.subscriptionId } : null, error: null }) }; } };
  const route = load("src/app/api/calendar/test-push/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "zod": require("zod"), "@/lib/security/activity": { getSecurityContext: async () => owner },
    "@/lib/supabase/admin": { createAdminClient: () => db }, "@/lib/calendar/push-dispatcher": {
      pushServerConfiguration: () => ({ NEXT_PUBLIC_SUPABASE_URL: "configured", CALENDAR_DISPATCH_SECRET: "configured", VAPID_PUBLIC_KEY: "configured" }),
      callPushDispatcher: async () => { forwarded++; return { ok: true, code: "PUSH_ACCEPTED", providerStatus: 201, serverConfigured: true, pushAttempted: true }; } },
  }, { console: { info() {} } });
  const req = origin => Object.assign(new Request("https://app.test/api/calendar/test-push", { method: "POST", headers: { origin }, body: JSON.stringify({ subscriptionId: testBody.subscriptionId }) }), { nextUrl: new URL("https://app.test/api/calendar/test-push") });
  assert.equal((await route.POST(req("https://app.test"))).status, 401);
  owner = { userId: testBody.ownerId };
  assert.equal((await route.POST(req("https://evil.test"))).status, 403);
  allowed = false; assert.equal((await route.POST(req("https://app.test"))).status, 404);
  allowed = true; const response = await route.POST(req("https://app.test")); assert.equal(response.status, 200);
  const outcome = await response.json();
  assert.equal(outcome.subscriptionFound, true); assert.equal(outcome.pushAttempted, true); assert.equal(outcome.pushProviderStatus, 201); assert.equal(outcome.serverBuild, "unknown");
  assert.equal((await route.POST(req("https://app.test"))).status, 429);
  assert.equal(forwarded, 1); assert.ok(filters.some(([key, value]) => key === "owner_id" && value === owner.userId));
});

test("Vercel missing configuration names are safe; no Edge request or subscription mutation", async () => {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "CALENDAR_DISPATCH_SECRET", "VAPID_PUBLIC_KEY"];
  for (const missing of required) {
    let requests = 0;
    const env = { NEXT_PUBLIC_SUPABASE_URL: "https://db.test", CALENDAR_DISPATCH_SECRET: "private-dispatch", VAPID_PUBLIC_KEY: "public-key" };
    delete env[missing];
    const helper = load("src/lib/calendar/push-dispatcher.ts", { "server-only": {} }, { process: { env }, fetch: async () => { requests++; } });
    assert.equal(helper.pushServerConfiguration()[missing], "missing");
    assert.equal(helper.pushServerConfiguration().NEXT_PUBLIC_APP_URL, "missing");
    const result = await helper.callPushDispatcher(testBody);
    assert.equal(result.code, "SERVER_NOT_CONFIGURED"); assert.equal(result.pushAttempted, false); assert.equal(result.serverConfigured, false);
    assert.equal(requests, 0); assert.ok(!JSON.stringify(helper.pushServerConfiguration()).includes("private-dispatch"));
  }
});

test("Edge missing VAPID fields are diagnosed individually without exposing secrets", async () => {
  for (const name of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const fixture = edgeFixture({ missing: [name] });
    const body = await (await fixture.invoke({ action: "diagnostics", expectedPublicKey: "public-key" })).json();
    assert.equal(body.code, "EDGE_NOT_CONFIGURED"); assert.equal(body.configuration[name], "missing");
    assert.equal(body.serverConfigured, false); assert.equal(body.pushAttempted, false); assert.equal(fixture.stats().sends, 0);
    assert.ok(!JSON.stringify(body).includes("private-key")); assert.ok(!JSON.stringify(body).includes("service-key"));
  }
  const denied = await (await edgeFixture().invoke(testBody, "wrong")).json();
  assert.equal(denied.configuration, undefined, "configuration unavailable before authentication");
});

test("forwarder allowlists configuration and preserves unknown timeout outcome", async () => {
  const format = { exists: true, formatValid: true, base64urlValid: true, structuralValid: true, importValidation: "valid", length: 43, decodedLength: 32 };
  const validation = { publicKey: { ...format, firstByte: 4, pointOnCurve: true, length: 87, decodedLength: 65 }, privateKey: format, subject: format, pairMatch: true, publicKeyMatch: true, libraryValidation: "valid", failure: null };
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://db.test", CALENDAR_DISPATCH_SECRET: "private-dispatch", VAPID_PUBLIC_KEY: "public-key" };
  const helper = load("src/lib/calendar/push-dispatcher.ts", { "server-only": {} }, { process: { env }, fetch: async () => Response.json({
    ok: true, code: "PUSH_ACCEPTED", providerStatus: 201, serverConfigured: true, pushAttempted: true,
    vapidValidation: validation,
    configuration: { VAPID_PRIVATE_KEY: "configured", VAPID_SUBJECT: "private-subject", unknown: "private-auth" }, auth: "private-auth" }) });
  const outcome = await helper.callPushDispatcher(testBody);
  assert.equal(outcome.ok, true); assert.equal(outcome.configuration.VAPID_PRIVATE_KEY, "configured");
  assert.ok(!JSON.stringify(outcome).includes("private-auth")); assert.ok(!JSON.stringify(outcome).includes("private-subject"));
  const timeout = load("src/lib/calendar/push-dispatcher.ts", { "server-only": {} }, { process: { env }, fetch: async () => { throw new Error("timeout"); } });
  assert.equal((await timeout.callPushDispatcher(testBody)).pushAttempted, null);
  const fake = load("src/lib/calendar/push-dispatcher.ts", { "server-only": {} }, { process: { env }, fetch: async () => Response.json({ ok: true, code: "PUSH_ACCEPTED" }) });
  assert.equal((await fake.callPushDispatcher(testBody)).ok, false, "missing provider status cannot claim success");
  const legacy = load("src/lib/calendar/push-dispatcher.ts", { "server-only": {} }, { process: { env }, fetch: async () => Response.json({ ok: true, code: "DISPATCH_READY", serverConfigured: true }) });
  const old = await legacy.callPushDispatcher({ action: "diagnostics" });
  assert.equal(old.ok, false); assert.equal(old.code, "EDGE_UPDATE_REQUIRED"); assert.equal(old.serverConfigured, null);
  const incomplete = load("src/lib/calendar/push-dispatcher.ts", { "server-only": {} }, { process: { env }, fetch: async () => Response.json({
    ok: true, code: "DISPATCH_READY", serverConfigured: true,
    vapidValidation: { ...validation, publicKey: { ...validation.publicKey, importValidation: "not-checked" } },
  }) });
  const unchecked = await incomplete.callPushDispatcher({ action: "diagnostics" });
  assert.equal(unchecked.ok, false); assert.equal(unchecked.code, "EDGE_UPDATE_REQUIRED"); assert.equal(unchecked.serverConfigured, false);
});

test("last sent and user-confirmed receipt persist separately and remain account/device scoped", () => {
  const storage = new Map();
  const history = load("src/lib/calendar/push-test-history.ts", {}, { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  const acceptedAt = "2026-10-01T12:00:00Z", received = "2026-10-01T12:00:30Z";
  history.writePushTestHistory("a", "device", { acceptedAt, last_confirmed_received_at: null, auth: "must-not-store" });
  assert.equal(history.readPushTestHistory("a", "device").last_confirmed_received_at, null);
  assert.equal(history.readPushTestHistory("b", "device"), null); assert.equal(history.readPushTestHistory("a", "other"), null);
  history.writePushTestHistory("a", "device", { acceptedAt, last_confirmed_received_at: received });
  assert.equal(history.readPushTestHistory("a", "device").last_confirmed_received_at, received);
  assert.ok(![...storage.values()].join().includes("must-not-store"));
});

test("VAPID format reports quotes, whitespace, newline, PEM, encoding and decoded lengths without secrets", async () => {
  const { validateVapid } = load("supabase/functions/send-calendar-test-push/vapid-validation.ts");
  const privateKey = privateFixture.toString("base64url"), subject = "https://personal-store-web.vercel.app";
  const good = await validateVapid(fixturePublic, privateKey, subject, fixturePublic);
  assert.equal(good.publicKey.length, 87); assert.equal(good.publicKey.decodedLength, 65);
  assert.equal(good.publicKey.firstByte, 4); assert.equal(good.publicKey.pointOnCurve, true);
  assert.equal(good.publicKey.structuralValid, true); assert.equal(good.publicKey.importValidation, "valid");
  assert.equal(good.privateKey.length, 43); assert.equal(good.privateKey.decodedLength, 32);
  assert.equal(good.privateKey.importValidation, "valid"); assert.equal(good.subject.uriType, "https");
  assert.equal(good.pairMatch, true); assert.equal(good.publicKeyMatch, true); assert.equal(good.failure, null);
  assert.equal(good.fingerprints.expectedPublic, good.fingerprints.edgePublic);
  for (const value of ['"' + privateKey + '"', "'" + privateKey + "'", privateKey + "=", "\r\n" + privateKey, privateKey + "\n", "-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----", "abc+def/", "AQID"]) {
    const result = await validateVapid(fixturePublic, value, subject, fixturePublic);
    assert.equal(result.failure, "PRIVATE_KEY"); assert.equal(result.pairMatch, null);
    assert.ok(!JSON.stringify(result).includes(value));
  }
  const whitespace = await validateVapid(fixturePublic, "\n" + privateKey + "\r", subject, fixturePublic);
  assert.equal(whitespace.privateKey.leadingWhitespace, true); assert.equal(whitespace.privateKey.trailingWhitespace, true);
  assert.equal(whitespace.privateKey.containsNewline, true);
  const zero = await validateVapid(fixturePublic, Buffer.alloc(32).toString("base64url"), subject, fixturePublic);
  assert.equal(zero.failure, "PRIVATE_KEY"); assert.ok(zero.privateKey.issues.includes("PRIVATE_KEY_SCALAR_OUT_OF_RANGE"));
});

test("public validator accepts unpadded 87-char points even if convertKey is unimplemented", async () => {
  const { validateVapid } = load("supabase/functions/send-calendar-test-push/vapid-validation.ts", {
    "node:crypto": { ...nodeCrypto, ECDH: { convertKey() { throw new Error("Not implemented"); } } },
  });
  const result = await validateVapid(fixturePublic, privateFixture.toString("base64url"), "https://personal-store-web.vercel.app", fixturePublic);
  assert.equal(result.publicKey.importValidation, "valid"); assert.equal(result.pairMatch, true); assert.equal(result.failure, null);
});

test("WebCrypto public import failure is distinct from encoding and curve validation", async () => {
  const { validateVapid } = load("supabase/functions/send-calendar-test-push/vapid-validation.ts", {}, {
    crypto: { subtle: { importKey: async (format, ...args) => {
      if (format === "raw") throw new Error("runtime failure that must not leak");
      return nodeCrypto.webcrypto.subtle.importKey(format, ...args);
    } } },
  });
  const result = await validateVapid(fixturePublic, privateFixture.toString("base64url"), "https://personal-store-web.vercel.app", fixturePublic);
  assert.equal(result.publicKey.structuralValid, true); assert.equal(result.publicKey.pointOnCurve, true);
  assert.equal(result.publicKey.importValidation, "invalid"); assert.equal(result.failure, "PUBLIC_KEY");
  assert.ok(result.publicKey.issues.includes("PUBLIC_KEY_P256_IMPORT_FAILED"));
  assert.ok(!JSON.stringify(result).includes("must not leak"));
});

test("private JWK import failure cannot pass configuration or pair validation", async () => {
  const { validateVapid } = load("supabase/functions/send-calendar-test-push/vapid-validation.ts", {}, {
    crypto: { subtle: { importKey: async (format, ...args) => {
      if (format === "jwk") throw new Error("private import exception must not leak");
      return nodeCrypto.webcrypto.subtle.importKey(format, ...args);
    } } },
  });
  const result = await validateVapid(fixturePublic, privateFixture.toString("base64url"), "https://personal-store-web.vercel.app", fixturePublic);
  assert.equal(result.publicKey.importValidation, "valid"); assert.equal(result.privateKey.structuralValid, true);
  assert.equal(result.privateKey.importValidation, "invalid"); assert.equal(result.failure, "PRIVATE_KEY"); assert.equal(result.pairMatch, null);
  assert.ok(result.privateKey.issues.includes("P256_PRIVATE_IMPORT_FAILED"));
  assert.ok(!JSON.stringify(result).includes("exception must not leak"));
});

test("VAPID validates the curve, pair and real contact URI before any provider call", async () => {
  const secondPrivate = Buffer.alloc(32); secondPrivate[31] = 2;
  const mismatch = edgeFixture({ overrides: { VAPID_PRIVATE_KEY: secondPrivate.toString("base64url") } });
  const result = await (await mismatch.invoke(testBody)).json();
  assert.equal(result.vapidValidation.failure, "PAIR"); assert.equal(result.vapidValidation.pairMatch, false);
  assert.equal(result.serverConfigured, false); assert.equal(result.pushAttempted, false); assert.equal(mismatch.stats().sends, 0);
  for (const subject of ["personal-store", "user@example.test", '"mailto:user@example.test"', "https://localhost", "https://example.test\n"]) {
    const f = edgeFixture({ overrides: { VAPID_SUBJECT: subject } }); const body = await (await f.invoke(testBody)).json();
    assert.equal(body.vapidValidation.failure, "SUBJECT"); assert.equal(f.stats().sends, 0);
    assert.ok(!JSON.stringify(body).includes(subject));
  }
  const publicBytes = Buffer.alloc(65); publicBytes[0] = 4;
  const offCurve = edgeFixture({ overrides: { VAPID_PUBLIC_KEY: publicBytes.toString("base64url") } });
  const body = await (await offCurve.invoke(testBody)).json();
  assert.equal(body.vapidValidation.failure, "PUBLIC_KEY"); assert.equal(offCurve.stats().sends, 0);
  const library = edgeFixture({ libraryError: new Error("Vapid subject is not a valid URL. secret-embedded-contact") });
  const response = await (await library.invoke(testBody)).json();
  assert.equal(response.vapidValidation.failure, "SUBJECT"); assert.equal(response.vapidValidation.libraryValidation, "invalid");
  assert.ok(!JSON.stringify(response).includes("secret-embedded-contact")); assert.equal(library.stats().sends, 0);
});

test("server sanitizes nested VAPID diagnostics rather than trusting raw Edge objects", () => {
  const { safeVapidValidation } = load("src/lib/calendar/push-dispatcher.ts", { "server-only": {} });
  const safe = safeVapidValidation({ publicKey: { value: "raw-public", firstByte: 4, pointOnCurve: true, issues: ["INVALID_BASE64URL", "private-secret"] },
    privateKey: { value: "raw-private", firstByte: 123, importValidation: "private-secret", formatValid: true, length: 43 }, subject: { raw: "private-contact", uriType: "private-contact" },
    fingerprints: { expectedPublic: "private-secret", edgePublic: "a".repeat(64) }, failure: "private-secret", privateKeyValue: "raw-private" });
  assert.equal(safe.privateKey.length, 43); assert.equal(safe.fingerprints.expectedPublic, null);
  assert.equal(safe.publicKey.firstByte, 4); assert.equal(safe.publicKey.pointOnCurve, true);
  assert.equal("firstByte" in safe.privateKey, false); assert.equal(safe.privateKey.importValidation, "not-checked");
  assert.equal(safe.subject.uriType, "invalid");
  assert.equal(safe.fingerprints.edgePublic, "a".repeat(64)); assert.equal(safe.failure, null);
  assert.ok(!JSON.stringify(safe).includes("raw-private")); assert.ok(!JSON.stringify(safe).includes("private-secret"));
  assert.ok(!JSON.stringify(safe).includes("private-contact"));
});

test("existing SW push waits for showNotification and click focuses/navigates calendar", async () => {
  const { renderServiceWorker } = load("src/lib/pwa/service-worker-source.ts");
  const events = new Map(), displayed = [], navigated = [], opened = [];
  let focused = 0, closed = 0;
  const existing = { url: "https://app.test/dashboard", navigate: async url => { navigated.push(url); }, focus: async () => { focused++; } };
  const self = { location: { origin: "https://app.test" }, addEventListener: (name, fn) => events.set(name, fn),
    registration: { showNotification: async (title, options) => { displayed.push({ title, options }); } },
    clients: { matchAll: async () => [existing], openWindow: async url => { opened.push(url); } } };
  vm.runInNewContext(renderServiceWorker("test-build"), { self, URL });
  let work;
  events.get("push")({ data: { json: () => ({ title: "測試通知", body: "測試", url: "/calendar?date=2026-10-01&event=fake", tag: "test" }) }, waitUntil: promise => { work = promise; } });
  await work;
  assert.equal(displayed.length, 1); assert.equal(displayed[0].title, "測試通知");
  assert.equal(displayed[0].options.data.url, "/calendar?date=2026-10-01&event=fake");
  events.get("notificationclick")({ notification: { close() { closed++; }, data: displayed[0].options.data }, waitUntil: promise => { work = promise; } });
  await work; assert.equal(closed, 1); assert.equal(focused, 1); assert.equal(opened.length, 0);
  assert.equal(navigated[0], "https://app.test/calendar?date=2026-10-01&event=fake");
  self.clients.matchAll = async () => [];
  events.get("notificationclick")({ notification: { close() {}, data: { url: "/calendar" } }, waitUntil: promise => { work = promise; } });
  await work; assert.equal(opened[0], "https://app.test/calendar");
  events.get("push")({ data: { json() { throw new Error("bad payload"); } }, waitUntil: promise => { work = promise; } });
  await work; assert.equal(displayed[1].title, "行程提醒");
});
