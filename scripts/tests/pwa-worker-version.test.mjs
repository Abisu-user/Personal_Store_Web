import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { renderServiceWorker } from "../../src/lib/pwa/service-worker-source.ts";

test("service worker cache is build-specific and only old shell caches are removed", async () => {
  const events = new Map();
  const removed = [];
  const current = "personal-vault-shell-build-b";
  const worker = renderServiceWorker("build-b");
  const self = {
    addEventListener(name, handler) { events.set(name, handler); },
    registration: { navigationPreload: { enable: async () => undefined } },
    clients: { claim: async () => undefined },
    location: { origin: "https://example.test" },
  };
  runInNewContext(worker, {
    self,
    URL,
    caches: {
      keys: async () => ["personal-vault-shell-build-a", current, "unrelated-cache"],
      delete: async (key) => { removed.push(key); return true; },
    },
  });
  let activation;
  events.get("activate")({ waitUntil(promise) { activation = promise; } });
  await activation;

  assert.deepEqual(removed, ["personal-vault-shell-build-a"]);
  assert.match(worker, /const CACHE_NAME = "personal-vault-shell-build-b";/);
  assert.notEqual(worker, renderServiceWorker("build-a"));
  let version;
  events.get("message")({
    data: { type: "PERSONAL_VAULT_VERSION" },
    ports: [{ postMessage(value) { version = value; } }],
  });
  assert.equal(version.buildId, "build-b");
  assert.equal(version.cacheName, current);
  let responded = false;
  events.get("fetch")({ request: { method: "GET", url: "https://example.test/api/calendar" }, respondWith() { responded = true; } });
  assert.equal(responded, false, "private API requests must bypass the worker cache");
});
