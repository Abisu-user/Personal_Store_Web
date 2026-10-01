/* eslint-disable @typescript-eslint/no-require-imports */
// Tests the real React notification settings with mocked browser push/provider APIs.
// This does not assert real Apple Push or iPhone lock-screen delivery.
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { chromium } = require("playwright");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const root = path.resolve(__dirname, "../.."), out = fs.mkdtempSync(path.join(os.tmpdir(), "vault-calendar-push-"));
async function main() {
  await new Promise((resolve, reject) => webpack({ mode: "development", devtool: false, entry: path.join(__dirname, "push-notification-fixture.tsx"), output: { path: out, filename: "test.js" }, resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": path.join(root, "src") } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(root, "scripts/tests/ts-loader.cjs") }, { test: /\.module\.css$/, use: path.join(root, "scripts/tests/global-header-css-loader.cjs") }] } }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const css = ["globals.css", "ui-foundation.css", "mobile-design-system.css"].map(file => fs.readFileSync(path.join(root, "src/app", file), "utf8")).join("\n");
  const server = http.createServer((req, res) => {
    if (req.url === "/test.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(fs.readFileSync(path.join(out, "test.js"))); }
    if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); return res.end(css); }
    res.end('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/test.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage(), errors = [], requests = [];
    let syncs = 0, tests = 0, enabled = true, testStatus = 201, serverMissing = false, failSync = false, unconfigured = false;
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      // Next replaces this constant during production compilation; standalone fixture needs it explicitly.
      window.process = { env: { NEXT_PUBLIC_BUILD_ID: "page-fixture" } };
      const permission = { value: new URL(location.href).searchParams.get("permission") || "granted" };
      const subscription = { endpoint: "https://web.push.apple.com/private-test-endpoint", options: { applicationServerKey: Uint8Array.from([1, 2, 3]).buffer },
        toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "private-key", auth: "private-auth" } }; }, async unsubscribe() { return true; } };
      Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
      Object.defineProperty(window, "Notification", { configurable: true, value: { get permission() { return permission.value; } } });
      const registration = { scope: location.origin + "/", active: { state: "activated", postMessage(_message, ports) { ports[0].postMessage({ buildId: "worker-fixture" }); } },
        pushManager: { getSubscription: async () => subscription, subscribe: async () => { permission.value = "granted"; return subscription; } } };
      Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: async () => registration, ready: Promise.resolve(registration) } });
    });
    await page.route("**/api/calendar/**", route => {
      const request = route.request(), url = new URL(request.url()); requests.push(url.pathname);
      if (url.pathname.endsWith("test-push")) { tests++; return route.fulfill({ status: unconfigured || testStatus !== 201 ? 503 : 200,
        json: unconfigured ? { ok: false, code: "SERVER_NOT_CONFIGURED", serverConfigured: false, subscriptionFound: true, pushAttempted: false, invalidSubscription: false, serverBuild: "server-fixture" } : testStatus === 201 ? { ok: true, code: "PUSH_ACCEPTED", providerStatus: 201, acceptedAt: new Date().toISOString(), serverConfigured: true, subscriptionFound: true, pushAttempted: true, invalidSubscription: false, serverBuild: "server-fixture" } : { ok: false, code: "VAPID_REJECTED", providerStatus: 403 } }); }
      if (request.method() === "GET") return route.fulfill({ json: { publicKey: "AQID", accountId: "account-fixture", buildId: "server-fixture", productionOrigin: null,
        dispatcher: unconfigured ? "unconfigured" : "ready", dispatcherCode: unconfigured ? "SERVER_NOT_CONFIGURED" : null,
        configuration: { vercel: { VAPID_PUBLIC_KEY: "configured", CALENDAR_DISPATCH_SECRET: unconfigured ? "missing" : "configured" }, edge: null } } });
      if (request.method() === "DELETE") { enabled = false; return route.fulfill({ json: { ok: true } }); }
      const body = request.postDataJSON(); if (body.action !== "inspect") {
        syncs++;
        if (failSync) { failSync = false; return route.fulfill({ status: 503, json: { error: "測試DB暫時失敗" } }); }
        enabled = true; serverMissing = false;
      }
      return route.fulfill({ json: { device: serverMissing ? null : { id: "12345678-0000-4000-8000-123456789abc", enabled, lastSyncedAt: new Date().toISOString() } } });
    });
    for (const width of [375,390,430,700,701,768,820,821,1024,1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("http://127.0.0.1:" + server.address().port);
      const dialog = page.getByRole("dialog", { name: "行程通知", exact: true });
      await dialog.getByText("已開啟", { exact: true }).waitFor().catch(async error => { console.error("Fixture state:", await page.locator("body").innerText(), "Page errors:", errors); throw error; });
      await dialog.getByText("通知診斷詳情", { exact: true }).click();
      for (const theme of ["light", "dark"]) {
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        const bounds = await dialog.boundingBox();
        assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1 && bounds.y >= -1 && bounds.y + bounds.height <= 845, "modal fits " + width);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no overflow " + width);
        assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), "no inner overflow " + width);
      }
      const content = await dialog.textContent();
      assert.ok(!content.includes("private-test-endpoint") && !content.includes("private-auth") && !content.includes("private-key"));
      assert.match(content, /12345678…9abc/); assert.match(content, /worker-fixture/);
      await page.screenshot({ path: path.join(out, "push-" + width + ".png") });
      console.log("PASS notification modal", width, "light/dark, masked diagnostics, no overflow");
    }
    await page.getByRole("button", { name: "發送測試通知", exact: true }).click();
    await page.getByText(/伺服器已送出測試通知/).waitFor(); assert.equal(tests, 1);
    assert.match(await page.getByRole("status").textContent(), /不代表手機已顯示/);
    await page.getByRole("button", { name: "我已收到", exact: true }).click();
    await page.getByText(/· 使用者確認/).waitFor();
    await page.reload(); await page.getByText("已開啟", { exact: true }).waitFor();
    await page.getByText("通知診斷詳情", { exact: true }).click();
    await page.getByText(/· Provider 已接受/).waitFor(); await page.getByText(/· 使用者確認/).waitFor();
    assert.equal(await page.getByRole("button", { name: "我已收到", exact: true }).count(), 0, "receipt confirmation persisted");
    testStatus = 403;
    await page.getByRole("button", { name: "發送測試通知", exact: true }).click();
    await page.getByText(/推播服務拒絕 VAPID/).waitFor(); assert.equal(tests, 2);
    unconfigured = true;
    await page.reload(); await page.getByText("伺服器待完成設定", { exact: true }).waitFor();
    await page.getByText("通知診斷詳情", { exact: true }).click();
    await page.getByText("Vercel · CALENDAR_DISPATCH_SECRET", { exact: true }).waitFor();
    await page.getByRole("button", { name: "發送測試通知", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Web Push 伺服器尚未設定完成。" }).waitFor();
    assert.ok(!(await page.getByRole("status").textContent()).includes("伺服器已送出"));
    assert.equal(tests, 3);
    unconfigured = false;
    await page.getByRole("button", { name: "關閉此裝置通知", exact: true }).click();
    await page.getByText("此裝置通知已關閉。", { exact: true }).waitFor();
    const previous = syncs;
    await page.getByRole("button", { name: "重新同步裝置", exact: true }).click();
    await page.getByText(/尚未完成設定，請查看診斷/).waitFor();
    assert.equal(syncs, previous, "explicit opt-out is not automatically re-enabled");
    assert.equal(await page.getByRole("button", { name: "發送測試通知", exact: true }).count(), 0);
    await page.evaluate(() => localStorage.clear());
    serverMissing = true; failSync = true;
    await page.goto("http://127.0.0.1:" + server.address().port + "?permission=default");
    await page.getByRole("button", { name: "開啟行程通知", exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "開啟行程通知", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "測試DB暫時失敗" }).waitFor();
    await page.getByText("通知診斷詳情", { exact: true }).click();
    await page.getByText("已建立", { exact: true }).waitFor();
    assert.equal(await page.getByText("已開啟", { exact: true }).count(), 0, "DB save failure cannot claim enabled");
    await page.getByRole("button", { name: "修復通知", exact: true }).click();
    await page.getByText("已開啟", { exact: true }).waitFor();
    assert.ok(requests.every(url => ["/api/calendar/push-subscription", "/api/calendar/test-push"].includes(url)), "no event CRUD or cron request");
    assert.deepEqual(errors, []);
    console.log("PASS test push acceptance vs receipt, VAPID failure, disable/opt-out, default gesture + DB failure/retry, no event/cron mutations");
    console.log("Screenshots:", out);
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
