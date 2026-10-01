/* eslint-disable @typescript-eslint/no-require-imports */
// Execute the unchanged production Reminder Edge handler against isolated doubles.
// No real DB mutations, production keys, push requests, or device receipt claims.
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), ts = require("typescript");
const root = path.resolve(__dirname, "../..");
function fixture({ revision = 7, deleted = false, removedReminder = false, devices = 2, providerStatus = 201, readError = false, claimError = false } = {}) {
  let handler, claims = 0;
  const sends = [], mutations = [], reads = [];
  const claim = { delivery_id: "delivery-fixture", owner_id: "owner-fixture", event_id: "event-fixture", reminder_id: "reminder-fixture",
    occurrence_date: "2026-10-01", event_revision: 7, event_title: "Fixture reminder", offset_minutes: 5 };
  const db = {
    async rpc(name, args) { assert.equal(name, "claim_due_calendar_reminders"); assert.equal(args.p_limit, 200); claims++; return { data: [claim], error: claimError ? { message: "claim failed" } : null }; },
    from(table) {
      const query = { table, filters: [], value: null,
        select() { return this; }, eq(key, value) { this.filters.push([key, value]); return this; }, update(value) { this.value = value; return this; },
        async maybeSingle() { return this.result(); },
        result() {
          if (this.value) { mutations.push({ table, value: this.value, filters: this.filters }); return { error: null }; }
          reads.push({ table, filters: this.filters });
          const data = table === "calendar_events" ? deleted ? null : { id: claim.event_id, reminder_revision: revision } :
            table === "calendar_event_reminders" ? removedReminder ? null : { id: claim.reminder_id } :
              Array.from({ length: devices }, (_, i) => ({ id: "device-" + i, endpoint: "https://provider.test/endpoint-" + i, p256dh: "fixture-key", auth: "fixture-auth" }));
          return { data, error: readError ? { message: "read failed" } : null };
        }, then(resolve) { resolve(this.result()); },
      };
      return query;
    },
  };
  const push = { setVapidDetails() {}, async sendNotification(device, payload, options) {
    sends.push({ device, payload: JSON.parse(payload), options });
    if (providerStatus !== 201) throw { statusCode: providerStatus, body: "provider-body-must-not-log" };
    return { statusCode: 201 };
  } };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, "supabase/functions/send-calendar-reminders/index.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} }, logs = [];
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Response, Date, Promise,
    require(name) { if (name === "npm:web-push@3.6.7") return push; if (name === "npm:@supabase/supabase-js@2.112.3") return { createClient: () => db }; throw new Error(name); },
    Deno: { serve(value) { handler = value; }, env: { get(name) { return name === "SUPABASE_SECRET_KEYS" ? undefined : "fixture-only"; } } },
    console: { error(...args) { logs.push(args); }, warn(...args) { logs.push(args); } },
  });
  return { invoke: (method = "POST", secret = "fixture-only") => handler(new Request("https://edge.test", { method, headers: { "x-calendar-dispatch-secret": secret } })),
    stats: () => ({ claims, sends, mutations, reads, logs }) };
}

test("private cron authorization enforced before claim or push", async () => {
  const f = fixture();
  assert.equal((await f.invoke("GET")).status, 405);
  assert.equal((await f.invoke("POST", "wrong")).status, 401);
  assert.equal(f.stats().claims, 0); assert.equal(f.stats().sends.length, 0);
});
test("formal reminder sends to all enabled devices of the claimed owner", async () => {
  const f = fixture(), response = await f.invoke();
  assert.equal(response.status, 200); assert.equal((await response.json()).claimed, 1);
  const { sends, reads, mutations } = f.stats();
  assert.equal(sends.length, 2);
  for (const read of reads) assert.ok(read.filters.some(([key, value]) => key === "owner_id" && value === "owner-fixture"));
  assert.ok(reads.find(read => read.table === "calendar_push_subscriptions").filters.some(([key, value]) => key === "enabled" && value === true));
  for (const send of sends) {
    assert.equal(send.payload.body, "5 分鐘後開始");
    assert.equal(send.payload.url, "/calendar?date=2026-10-01&event=event-fixture");
    assert.equal(send.payload.tag, "delivery-fixture"); assert.equal(send.options.TTL, 3600);
    assert.ok(!("description" in send.payload));
  }
  assert.equal(mutations[0].value.status, "sent"); assert.ok(mutations[0].value.sent_at);
  assert.ok(mutations[0].filters.some(([key, value]) => key === "status" && value === "claimed"));
});
test("edit/revision mismatch, deleted event, removed offset and no devices cannot send stale claims", async () => {
  for (const options of [{ revision: 8 }, { deleted: true }, { removedReminder: true }, { devices: 0 }]) {
    const f = fixture(options); await f.invoke();
    assert.equal(f.stats().sends.length, 0);
    assert.equal(f.stats().mutations[0].value.status, "skipped");
  }
});
test("DB failures are recorded, not claimed as notification success", async () => {
  const claim = fixture({ claimError: true }); assert.equal((await claim.invoke()).status, 503); assert.equal(claim.stats().sends.length, 0);
  const read = fixture({ readError: true }); await read.invoke(); assert.equal(read.stats().sends.length, 0); assert.equal(read.stats().mutations[0].value.status, "failed");
});
test("expired subscriptions disable only matching devices; provider errors never leak endpoints", async () => {
  for (const providerStatus of [404, 410, 403, 429, 500]) {
    const f = fixture({ devices: 1, providerStatus }); await f.invoke();
    const { mutations, logs } = f.stats();
    const disabled = mutations.filter(row => row.table === "calendar_push_subscriptions");
    assert.equal(disabled.length, [404, 410].includes(providerStatus) ? 1 : 0);
    if (disabled.length) {
      assert.equal(disabled[0].value.enabled, false);
      assert.ok(disabled[0].filters.some(([key, value]) => key === "id" && value === "device-0"));
      assert.ok(disabled[0].filters.some(([key, value]) => key === "owner_id" && value === "owner-fixture"));
    }
    assert.equal(mutations.at(-1).value.status, "failed");
    assert.ok(!/endpoint-0|fixture-auth|provider-body/.test(JSON.stringify(logs)));
  }
});
test("SQL schedule retains Taipei conversion, recurring occurrences, revision dedupe and cascading deletes", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260930090000_calendar_reminders_push.sql"), "utf8");
  assert.match(sql, /default 'Asia\/Taipei'/);
  assert.match(sql, /make_timestamptz[\s\S]*0, e\.time_zone/);
  for (const type of ["none", "daily", "weekly", "yearly"]) assert.ok(sql.includes("e.recurrence_type = '" + type + "'"));
  assert.match(sql, /occurrence\.day::date - e\.event_date\) % 7 = 0/);
  assert.match(sql, /on conflict \(event_id, reminder_id, occurrence_date, event_revision\) do nothing/);
  assert.match(sql, /reminder_revision = v_original\.reminder_revision \+ case when/);
  assert.match(sql, /offset_minutes <> all\(p_reminders\)/);
  assert.match(sql, /event_id uuid not null references public\.calendar_events\(id\) on delete cascade/);
  assert.match(sql, /reminder_id uuid not null references public\.calendar_event_reminders\(id\) on delete cascade/);
});
