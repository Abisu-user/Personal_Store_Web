/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const root = path.resolve(__dirname, "../.."), out = fs.mkdtempSync(path.join(os.tmpdir(), "vault-mobile-stage5-"));
const changes = ["src/app/(app)/vault/page.tsx", "src/app/(app)/security/page.tsx", "src/components/vault/vault-workspace.tsx"];
for (const file of changes) {
  const target = path.join(out, file); fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, execFileSync("git", ["show", "HEAD:" + file], { cwd: root }));
}
async function build(before) {
  const commonStub = path.join(__dirname, "mobile-stage5-common-stub.tsx"), dataStub = path.join(__dirname, "mobile-stage5-data-stubs.ts");
  const alias = { "@/lib/supabase/client$": commonStub, "@/lib/security/require-user$": commonStub, "@/lib/security/require-mfa$": commonStub, "@/lib/security/adult-content$": dataStub, "next/navigation$": commonStub, "next/link$": commonStub };
  if (before) for (const file of changes) alias[file.replace(/^src/, "@").replace(/\.tsx$/, "") + "$"] = path.join(out, file);
  alias["@"] = path.join(root, "src");
  await new Promise((resolve, reject) => webpack({
    mode: "development", devtool: false, entry: path.join(__dirname, "mobile-stage5-fixture.tsx"),
    output: { path: out, filename: before ? "before.js" : "after.js", chunkFilename: (before ? "before" : "after") + "-[id].js" },
    resolve: { extensions: [".tsx", ".ts", ".js"], alias, modules: [path.join(root, "node_modules"), "node_modules"] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "ts-loader.cjs") }, { test: /\.module\.css$/, use: path.join(__dirname, "mobile-stage1-css-loader.cjs") }] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
}
async function main() {
  await build(true); await build(false);
  const baseCss = ["src/app/globals.css", "src/app/mobile-design-system.css"].map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  const mobileCss = ["src/components/vault/vault-mobile.module.css", "src/components/security/security-mobile.module.css"].map(file => fs.readFileSync(path.join(root, file), "utf8").replace(/:global\(([^)]+)\)/g, "$1")).join("\n");
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/style.css") { res.setHeader("Content-Type", "text/css"); return res.end(baseCss + (url.searchParams.has("before") ? "" : mobileCss)); }
    if (url.pathname.endsWith(".js")) { res.setHeader("Content-Type", "text/javascript"); return res.end(fs.readFileSync(path.join(out, path.basename(url.pathname)))); }
    const before = url.searchParams.has("before");
    res.end('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css' + (before ? "?before" : "") + '"></head><body><div id="root"></div><script src="/' + (before ? "before" : "after") + '.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, channel: "chrome" }), report = [], errors = [];
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(12000); page.on("pageerror", error => errors.push(error.message));
    let requests = [], initialized = false, encryptedItem = null;
    await page.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method(); requests.push([method, url.pathname]);
      if (url.pathname === "/api/vault") { if (method === "POST") initialized = true; return route.fulfill({ json: { initialized } }); }
      if (url.pathname === "/api/vault/categories") return route.fulfill({ json: { categories: [{ id: "category-1", name: "網站登入", sortOrder: 0, itemCount: encryptedItem ? 1 : 0 }] } });
      if (url.pathname === "/api/vault/items") { if (method === "POST") encryptedItem = JSON.parse(request.postData() || "{}"); return route.fulfill({ json: method === "GET" ? { items: encryptedItem ? [encryptedItem] : [] } : {} }); }
      if (url.pathname === "/api/security/app-lock") return route.fulfill({ json: { configured: false, mode: null, autoLockEnabled: false } });
      if (url.pathname === "/api/security/activity") return route.fulfill({ json: method === "GET" ? { sessions: [{ id: "session-1", label: "iPhone Safari", lastSeenAt: "2026-09-11T08:00:00.000Z", createdAt: "2026-09-10T08:00:00.000Z", revokedAt: null, current: true }], events: [{ id: 1, action: "session_observed", metadata: {}, occurred_at: "2026-09-11T08:00:00.000Z" }] } : {} });
      if (["/api/bookmarks", "/api/notes", "/api/code", "/api/files", "/api/photos"].includes(url.pathname)) return route.fulfill({ json: { folders: [] } });
      return route.fulfill({ status: 500, json: { error: "layout test blocked endpoint" } });
    });
    const base = "http://127.0.0.1:" + server.address().port;
    for (const kind of ["vault", "security"]) for (const width of [320, 375, 390, 430, 520, 700, 701, 760, 768, 820, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 }); initialized = false; encryptedItem = null;
      requests = []; await page.goto(base + "?page=" + kind + "&before"); await page.getByRole("heading", { name: kind === "vault" ? "建立 Vault 密碼" : "裝置與安全活動" }).waitFor(); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(180);
      const desktopMetrics = () => page.evaluate(kind => {
        const selectors = kind === "vault"
          ? [".dashboard", ".dashboard-card", ".vault-gate", ".vault-gate-form"]
          : [".dashboard", ".dashboard-card", ".passkey-settings", ".folder-lock-security"];
        return selectors.map(selector => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const box = element.getBoundingClientRect(), style = getComputedStyle(element);
          return {
            selector, x: box.x, y: box.y, width: box.width, height: box.height,
            display: style.display, padding: style.padding,
            gridTemplateColumns: style.gridTemplateColumns,
          };
        });
      }, kind);
      const beforeRequests = JSON.stringify(requests), beforeMetrics = await desktopMetrics();
      await page.screenshot({ animations: "disabled", caret: "hide", path: path.join(out, kind + "-before-" + width + ".png") });
      initialized = false; encryptedItem = null; requests = []; await page.goto(base + "?page=" + kind); await page.getByRole("heading", { name: kind === "vault" ? "建立 Vault 密碼" : width <= 700 ? "安全中心" : "裝置與安全活動" }).waitFor(); await page.waitForTimeout(180);
      assert.equal(JSON.stringify(requests), beforeRequests, "No extra request from mobile presentation");
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ animations: "disabled", caret: "hide", path: path.join(out, kind + "-after-" + width + ".png") });
      if (width > 700) assert.deepEqual(await desktopMetrics(), beforeMetrics, kind + " desktop layout difference " + width);
      else {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), kind + " page overflow " + width);
        if (kind === "vault") {
          assert.ok(await page.getByRole("button", { name: "建立加密保管庫" }).evaluate(el => el.getBoundingClientRect().height >= 43.5), "vault gate touch target");
        } else {
          assert.ok(await page.getByRole("link", { name: "修改密碼" }).evaluate(el => el.getBoundingClientRect().height >= 43.5), "security quick action touch target");
          assert.ok(await page.getByText("iPhone Safari").isVisible(), "real session visible");
          await page.getByRole("button", { name: "刪除帳號", exact: true }).click(); await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
        }
      }
      report.push({ kind, width, result: width > 700 ? "layout-identical" : "mobile-pass", requests: beforeRequests });
    }
    await page.goto("about:blank");
    await page.setViewportSize({ width: 390, height: 1000 }); initialized = false; encryptedItem = null; await page.goto(base + "?page=vault");
    await page.locator('input[name="password"]').fill("stage-five-password"); await page.locator('input[name="confirmation"]').fill("stage-five-password"); await page.getByRole("button", { name: "建立加密保管庫" }).click();
    await page.getByRole("button", { name: "新增保管項目" }).waitFor(); await page.getByRole("button", { name: "新增保管項目" }).click();
    const dialog = page.getByRole("dialog"); await dialog.getByLabel("項目名稱").fill("GitHub"); await dialog.getByLabel("密碼或敏感內容").fill("never-render-this-by-default"); await dialog.getByRole("button", { name: "加密儲存" }).click();
    await page.getByRole("heading", { name: "GitHub" }).waitFor(); assert.equal(await page.getByLabel("敏感內容已遮蔽").textContent(), "••••••••••••••••••••••••");
    assert.ok(await page.locator(".vault-grid").evaluate(el => el.scrollWidth <= el.clientWidth + 1)); assert.equal(encryptedItem.secret, undefined, "API payload must not contain plaintext secret");
    for (const kind of ["vault", "security"]) for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 1000 }); initialized = false; encryptedItem = null; await page.goto(base + "?page=" + kind); await page.waitForTimeout(180);
      await page.evaluate(() => window.setTestAppearance({ theme: "dark", accent: "custom", customColor: "#C35490", density: "compact", fontScale: 120, surfaceOpacity: 0, background: "image", backgroundImages: ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Cpath fill='%23354764' d='M0 0h10v10H0z'/%3E%3C/svg%3E"] }));
      await page.waitForTimeout(100); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); assert.equal(await page.locator(".dashboard-card").evaluate(el => getComputedStyle(el).opacity), "1");
      await page.screenshot({ path: path.join(out, kind + "-dark-" + width + ".png") });
    }
    assert.deepEqual(errors, []); fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ output: out, report }, null, 2));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(out, error); process.exitCode = 1; });
