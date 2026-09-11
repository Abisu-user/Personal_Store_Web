/* eslint-disable @typescript-eslint/no-require-imports */
/* Isolated real React components + synthetic API; never uses real account data.
 * Run with NODE_PATH pointing at bundled playwright modules.
 */
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const root = path.resolve(__dirname, "../.."), out = fs.mkdtempSync(path.join(os.tmpdir(), "vault-mobile-stage1-"));
const baselineFiles = ["src/app/(app)/dashboard/page.tsx", "src/components/layout/create-item-provider.tsx"];
for (const file of baselineFiles) {
  const target = path.join(out, file); fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, execFileSync("git", ["show", "HEAD:" + file], { cwd: root }));
}
async function build(baseline) {
  const stub = path.join(__dirname, "mobile-stage1-stubs.tsx");
  const alias = { "@/lib/supabase/client$": stub, "@/lib/security/require-user$": stub, "@/lib/security/require-mfa$": stub, "next/navigation$": stub, "next/link$": stub };
  if (baseline) for (const file of baselineFiles) alias[file.replace(/^src/, "@").replace(/\.tsx$/, "") + "$"] = path.join(out, file);
  alias["@"] = path.join(root, "src");
  await new Promise((resolve, reject) => webpack({
    mode: "development", devtool: false, entry: path.join(__dirname, "mobile-stage1-fixture.tsx"),
    output: { path: out, filename: baseline ? "before.js" : "after.js", chunkFilename: (baseline ? "before" : "after") + "-[id].js" },
    resolve: { extensions: [".tsx", ".ts", ".js"], alias, modules: [path.join(root, "node_modules"), "node_modules"] },
    module: { rules: [
      { test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "ts-loader.cjs") },
      { test: /\.module\.css$/, use: path.join(__dirname, "mobile-stage1-css-loader.cjs") },
    ] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
}
const summary = {
  counts: { bookmark: 28, anime: 68, note: 36, code: 24, photo: 318, file: 42 },
  capacity: { databaseUsedBytes: 25165824, databaseQuotaBytes: 104857600, databaseUnlimited: false, storageUsedBytes: 47185920, storageQuotaBytes: 209715200, storageUnlimited: false },
  recentAvailable: true,
  recent: ["note", "photo", "bookmark", "anime", "code"].map((kind, i) => ({ id: "item-" + i, kind, title: "測試資料：" + i + "較長的標題也應保持在可用寬度內", href: "/notes", updatedAt: "2026-09-09T12:00:00Z" })),
};
async function main() {
  await build(true); await build(false);
  const globals = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
  const common = fs.readFileSync(path.join(root, "src/app/mobile-design-system.css"), "utf8");
  const moduleCss = fs.readFileSync(path.join(root, "src/app/(app)/dashboard/dashboard-mobile.module.css"), "utf8").replace(/:global\(([^)]+)\)/g, "$1");
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/style.css") { res.setHeader("Content-Type", "text/css"); return res.end(globals + (url.searchParams.has("before") ? "" : "\n" + common + "\n" + moduleCss)); }
    if (url.pathname === "/icon.svg") { res.setHeader("Content-Type", "image/svg+xml"); return res.end(fs.readFileSync(path.join(root, "src/app/icon.svg"))); }
    if (url.pathname.endsWith(".js")) { res.setHeader("Content-Type", "text/javascript"); return res.end(fs.readFileSync(path.join(out, path.basename(url.pathname)))); }
    const before = url.searchParams.has("before");
    res.end('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css' + (before ? "?before" : "") + '"></head><body><div id="root"></div><script src="/' + (before ? "before" : "after") + '.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const report = [];
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(8000);
    let requests = 0, fail = false;
    const errors = []; page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
    await page.route("**/api/dashboard", route => { requests++; return route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: "unavailable" } : summary }); });
    await page.route("https://**", route => route.abort());
    const base = "http://127.0.0.1:" + server.address().port;
    const inspect = () => page.evaluate(() => [...document.querySelectorAll(".mobileDashboard a,.mobileDashboard button,.mobile-bottom-nav>a,.mobile-bottom-nav>button")].filter(el => el.getClientRects().length).map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent, left: r.left, right: r.right, width: r.width, height: r.height }; }));
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 900 }); const initial = requests;
      await page.goto(base); await page.waitForSelector('.mobileDashboard[aria-busy="false"]');
      assert.equal(requests - initial, 1, "StrictMode single GET at " + width);
      assert.equal(await page.locator(".overviewCard").count(), 6);
      assert.equal(await page.locator(".desktopOnly").first().isVisible(), false);
      for (const button of await inspect()) {
        assert.ok(button.left >= -0.5 && button.right <= width + 0.5, "overflow " + width + JSON.stringify(button));
        assert.ok(button.width >= 43.5 && button.height >= 43.5, "touch target " + width + JSON.stringify(button));
      }
      await page.screenshot({ path: path.join(out, "phone-" + width + ".png") });
      await page.evaluate(() => window.setTestNavigation({ itemCount: 7, items: ["bookmarks", "notes", "files", "photos"] }));
      await page.waitForSelector(".has-seven-items");
      for (const button of await inspect()) assert.ok(button.right <= width + 0.5 && button.width >= 43.5, "7-slot " + width + JSON.stringify(button));
      await page.getByRole("button", { name: "更多", exact: true }).click();
      await page.getByRole("dialog", { name: "更多功能" }).waitFor();
      await page.getByRole("dialog").evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
      const rect = await page.getByRole("dialog").boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= width + 0.5 && rect.y + rect.height <= 901, JSON.stringify(rect));
      await page.screenshot({ path: path.join(out, "more-" + width + ".png") }); await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("button", { name: "更多", exact: true }).evaluate(el => el === document.activeElement), true, "sheet restores focus");
      await page.getByRole("button", { name: "新增資料", exact: true }).click();
      await page.getByRole("dialog", { name: "新增資料" }).waitFor();
      for (const button of await page.locator(".create-type-options button").all()) { const r = await button.boundingBox(); assert.ok(r.width >= 44 && r.height >= 44); }
      await page.screenshot({ path: path.join(out, "create-" + width + ".png") }); await page.keyboard.press("Escape");
      report.push({ width, mobile: "pass", requests: requests - initial, navigation: "5 and 7 slots; More and create pass" });
    }
    await page.evaluate(() => window.changeTestPath("/anime"));
    await page.getByRole("button", { name: "新增資料", exact: true }).click();
    assert.equal(await page.evaluate(() => window.newItemCalls), 1);
    await page.evaluate(() => window.changeTestPath("/dashboard"));
    fail = true; await page.reload(); await page.waitForSelector(".loadError");
    assert.equal(await page.locator(".mobileDashboard").getAttribute("aria-busy"), "false");
    assert.equal(await page.locator(".overviewCard strong").first().innerText(), "—");
    fail = false; await page.getByRole("button", { name: "重試", exact: true }).click();
    await page.waitForSelector('.mobileDashboard[aria-busy="false"]');
    assert.equal(await page.locator(".overviewCard strong").first().innerText(), "28");
    await page.setViewportSize({ width: 390, height: 900 });
    await page.evaluate(() => window.setTestAppearance({ theme: "dark", accent: "custom", customColor: "#C35490", density: "compact", fontScale: 120, surfaceOpacity: 0, background: "image", backgroundImages: ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cpath fill='%23354764' d='M0 0h100v100H0z'/%3E%3C/svg%3E"] }));
    const theme = await page.locator(".overviewCard").first().evaluate(el => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopWidth, opacity: getComputedStyle(el).opacity, brand: getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() }));
    assert.match(theme.background, /(?:rgba\(.*,\s*0\)|\/\s*0\))/); assert.equal(theme.opacity, "1"); assert.equal(theme.border, "1px"); assert.ok(theme.brand.toLowerCase().includes("c35490"));
    assert.equal(await page.locator(".quickAction span").first().evaluate(el => getComputedStyle(el).color), await page.locator(".overviewCard strong").first().evaluate(el => getComputedStyle(el).color), "dark quick action text uses theme ink");
    await page.screenshot({ path: path.join(out, "phone-dark-custom-transparent.png") });
    await page.evaluate(() => window.setTestAppearance({ theme: "dark", surfaceOpacity: 100, density: "compact" }));
    assert.doesNotMatch(await page.locator(".overviewCard").first().evaluate(el => getComputedStyle(el).backgroundColor), /\/\s*0\)/);
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.ok(await page.locator(".overviewCard").first().evaluate(el => parseFloat(getComputedStyle(el).transitionDuration) <= 0.001));
    await page.evaluate(() => { Object.defineProperty(visualViewport, "height", { configurable: true, value: 480 }); visualViewport.dispatchEvent(new Event("resize")); });
    assert.equal(await page.locator("html").getAttribute("data-mobile-keyboard"), "open");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".mobile-bottom-nav")).visibility === "hidden");
    assert.equal(await page.locator(".mobile-bottom-nav").isVisible(), false);
    await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event("resize")); });
    await page.getByRole("button", { name: "新增資料", exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.mobileModalOpen === "true");
    await page.evaluate(() => { Object.defineProperty(visualViewport, "height", { configurable: true, value: 480 }); visualViewport.dispatchEvent(new Event("resize")); });
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--mobile-modal-viewport-height") === "480px");
    await page.getByRole("dialog").evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    const keyboardSheet = await page.getByRole("dialog").boundingBox(); assert.ok(keyboardSheet.y >= 0 && keyboardSheet.y + keyboardSheet.height <= 481, JSON.stringify(keyboardSheet));
    await page.keyboard.press("Escape"); await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event("resize")); });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const width of [1366, 1440, 1920, 768, 820]) {
      await page.setViewportSize({ width, height: 1000 }); const initial = requests;
      await page.goto(base + "?before"); await page.locator(".dashboard-hero").waitFor();
      const screenshot = await page.screenshot({ path: path.join(out, "desktop-before-" + width + ".png") });
      await page.locator(".hero-actions button").click(); await page.getByRole("dialog", { name: "新增資料" }).waitFor();
      const chooserBefore = await page.screenshot();
      await page.keyboard.press("Escape");
      await page.goto(base); await page.locator(".dashboard-hero").waitFor(); await page.waitForTimeout(150);
      assert.equal(requests, initial, "desktop/tablet summary requests at " + width);
      const after = await page.screenshot({ path: path.join(out, "desktop-after-" + width + ".png") });
      assert.ok(screenshot.equals(after), "desktop pixels differ at " + width);
      await page.locator(".hero-actions button").click(); await page.getByRole("dialog", { name: "新增資料" }).waitFor();
      assert.equal(await page.locator(".create-type-options button").count(), 6);
      assert.equal(await page.locator(".create-type-options svg").first().isVisible(), false);
      assert.ok(chooserBefore.equals(await page.screenshot()), "desktop chooser pixels differ at " + width);
      await page.keyboard.press("Escape");
      await page.locator('.hero-actions a[href="/bookmarks"]').click(); assert.equal(await page.evaluate(() => window.lastNavigation), "/bookmarks");
      await page.locator(".dashboard-header button").click(); assert.equal(await page.evaluate(() => window.signOutCalls), 1);
      report.push({ width, desktop: "pixel identical", events: "create, close, navigate, sign out", summaryRequests: 0 });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output: out, report, extra: "error/retry, route create, theme/opacity/density, reduced motion, keyboard passed" }, null, 2));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(out, error); process.exitCode = 1; });
