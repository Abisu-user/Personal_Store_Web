/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const bookmarkFixture = require("./mobile-stage2-data.cjs");
const root = path.resolve(__dirname, "../.."), out = fs.mkdtempSync(path.join(os.tmpdir(), "vault-mobile-collections-app-"));
const changes = [
  "src/app/(app)/bookmarks/page.tsx", "src/app/(app)/notes/page.tsx", "src/app/(app)/photos/page.tsx",
  "src/components/bookmarks/bookmarks-workspace.tsx", "src/components/notes/notes-workspace.tsx",
  "src/components/photos/photos-workspace.tsx", "src/components/content/collection-navigation.tsx",
];
for (const file of changes) {
  const target = path.join(out, file); fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, execFileSync("git", ["show", "HEAD:" + file], { cwd: root }));
}
async function build(before) {
  const common = path.join(__dirname, "mobile-stage1-stubs.tsx");
  const alias = {
    "@/lib/supabase/client$": common, "@/lib/security/require-user$": common,
    "@/lib/security/require-mfa$": common, "next/navigation$": common, "next/link$": common,
    "@/lib/notes/data$": path.join(__dirname, "mobile-collections-app-data-stubs.ts"),
    "@/lib/photos/data$": path.join(__dirname, "mobile-collections-app-data-stubs.ts"),
  };
  if (before) for (const file of changes) alias[file.replace(/^src/, "@").replace(/\.tsx$/, "") + "$"] = path.join(out, file);
  alias["@"] = path.join(root, "src");
  await new Promise((resolve, reject) => webpack({
    mode: "development", devtool: false, entry: path.join(__dirname, "mobile-collections-app-fixture.tsx"),
    output: { path: out, filename: before ? "before.js" : "after.js", chunkFilename: (before ? "before" : "after") + "-[id].js" },
    resolve: { extensions: [".tsx", ".ts", ".js"], alias, modules: [path.join(root, "node_modules"), "node_modules"] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "ts-loader.cjs") }, { test: /\.module\.css$/, use: path.join(__dirname, "mobile-stage1-css-loader.cjs") }] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
}
async function main() {
  await build(true); await build(false);
  const cssFiles = [
    "src/app/globals.css", "src/app/mobile-design-system.css", "src/components/ui/mobile-collection.module.css",
    "src/components/ui/mobile-library.module.css", "src/components/bookmarks/bookmarks-mobile.module.css",
    "src/components/photos/photos-mobile.module.css",
  ];
  const css = cssFiles.map(file => fs.readFileSync(path.join(root, file), "utf8").replace(/:global\(([^)]+)\)/g, "$1")).join("\n");
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/style.css") { res.setHeader("Content-Type", "text/css"); return res.end(css); }
    if (url.pathname.endsWith(".js")) { res.setHeader("Content-Type", "text/javascript"); return res.end(fs.readFileSync(path.join(out, path.basename(url.pathname)))); }
    const before = url.searchParams.has("before");
    res.end('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/' + (before ? "before" : "after") + '.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const errors = [], report = [];
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(12000);
    page.on("pageerror", error => errors.push(error.message));
    let requests = [];
    await page.route("**/api/**", route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      requests.push([request.method(), pathname]);
      if (pathname === "/api/bookmarks") {
        const data = bookmarkFixture.bookmarks;
        return route.fulfill({ json: { ...data, bookmarks: data.bookmarks.map(item => ({
          ...item,
          categories: item.category ? [item.category] : [],
          folders: item.folder ? [item.folder] : [],
        })) } });
      }
      return route.fulfill({ status: 500, json: { error: "layout test blocks mutations" } });
    });
    const base = "http://127.0.0.1:" + server.address().port;
    const readySelector = { bookmarks: ".bookmark-card", notes: ".content-item-card", photos: ".photo-card" };
    const createLabel = { bookmarks: "新增網站收藏", notes: "新增筆記", photos: "上傳照片" };
    for (const kind of ["bookmarks", "notes", "photos"]) {
      for (const width of [320, 375, 390, 430, 700, 701, 1366, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        requests = []; await page.goto(base + "?page=" + kind + "&before"); await page.locator(readySelector[kind]).first().waitFor().catch(async error => {
          console.error({ kind, width, phase: "before", requests, pageErrors: errors, body: (await page.locator("body").innerText()).slice(0, 1200) });
          throw error;
        }); await page.waitForTimeout(100);
        const beforeRequests = JSON.stringify(requests);
        const before = await page.screenshot({ animations: "disabled", caret: "hide" });
        requests = []; await page.goto(base + "?page=" + kind); await page.locator(readySelector[kind]).first().waitFor(); await page.waitForTimeout(100);
        assert.equal(JSON.stringify(requests), beforeRequests, kind + " must not add data requests");
        const after = await page.screenshot({ animations: "disabled", caret: "hide" });
        if (width === 390) fs.writeFileSync(path.join(out, kind + "-390.png"), after);
        if (width > 700) {
          assert.ok(before.equals(after), kind + " desktop pixel difference at " + width);
          assert.equal(await page.locator(".mobile-page-header").evaluate(el => getComputedStyle(el).display), "none");
          assert.notEqual(await page.locator(".page-heading").evaluate(el => getComputedStyle(el).display), "none");
        } else {
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), kind + " overflow at " + width);
          assert.notEqual(await page.locator(".mobile-page-header").evaluate(el => getComputedStyle(el).display), "none");
          assert.equal(await page.locator(".page-heading").evaluate(el => getComputedStyle(el).display), "none");
          const shell = await page.locator(".dashboard-card").evaluate(el => {
            const style = getComputedStyle(el); return { border: style.borderTopWidth, radius: style.borderRadius, background: style.backgroundColor };
          });
          assert.deepEqual(shell, { border: "0px", radius: "0px", background: "rgba(0, 0, 0, 0)" });
          assert.equal(await page.locator(".collection-navigation-desktop-actions:visible").count(), 0);
          assert.equal(await page.locator(".mobile-section-actions-trigger:visible").count(), 2);
          const create = page.getByRole("button", { name: createLabel[kind], exact: true });
          assert.ok(await create.evaluate(el => el.getBoundingClientRect().height >= 43.5));
          const firstCard = page.locator(readySelector[kind]).first();
          if (kind === "notes" || kind === "bookmarks" && await page.locator(".bookmark-list-list").count()) {
            assert.ok((await firstCard.boundingBox()).height <= 80, kind + " list card remains too tall");
          }
          const fab = page.locator(".mobile-bottom-nav .mobile-create");
          assert.ok((await fab.boundingBox()).height <= 56.5, "mobile create FAB not reduced");
        }
        report.push({ kind, width, requests: beforeRequests, result: width > 700 ? "desktop-pixel-identical" : "mobile-pass" });
      }
      await page.setViewportSize({ width: 390, height: 1000 }); await page.goto(base + "?page=" + kind); await page.locator(readySelector[kind]).first().waitFor();
      await page.getByRole("button", { name: "資料夾操作" }).click();
      const sheet = page.getByRole("dialog");
      await sheet.getByRole("button", { name: /新增資料夾/ }).click();
      await page.getByRole("dialog").getByRole("heading", { name: /新增.*資料夾/ }).waitFor();
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.setTestAppearance({ theme: "dark", accent: "custom", customColor: "#C35490", density: "compact", fontScale: 120, surfaceOpacity: 0, background: "image", backgroundImages: [] }));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    for (const kind of ["bookmarks", "notes", "photos"]) for (const width of [375, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + "?page=" + kind); await page.locator(readySelector[kind]).first().waitFor();
      const list = page.locator(kind === "bookmarks" ? ".bookmark-list" : kind === "photos" ? ".photo-grid" : ".content-item-list");
      const beforeTop = await list.evaluate(el => el.getBoundingClientRect().top);
      await page.locator(".item-select input").first().check();
      const bar = page.locator(".mobile-batch-action-bar"); await bar.waitFor();
      await bar.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
      assert.equal(await bar.getByText(/已選 1 筆/).count(), 1);
      const barRect = await bar.boundingBox(), navRect = await page.locator(".mobile-bottom-nav").boundingBox();
      assert.ok(barRect.x >= 0 && barRect.x + barRect.width <= width + .5, `${kind} batch overflow ${width}`);
      assert.ok(barRect.y + barRect.height <= navRect.y - 4, `${kind} batch/nav overlap ${width} ${JSON.stringify({ barRect, navRect })}`);
      assert.ok(Math.abs(await list.evaluate(el => el.getBoundingClientRect().top) - beforeTop) < 1, `${kind} list was pushed down`);
      for (const button of await bar.locator("button").all()) assert.ok((await button.boundingBox()).height >= 43.5, `${kind} batch touch target`);
      await page.screenshot({ path: path.join(out, `${kind}-batch-${width}.png`), animations: "disabled" });
      await bar.getByRole("button", { name: "整理", exact: true }).click(); await page.getByRole("dialog").waitFor();
      assert.equal(await bar.evaluate(el => getComputedStyle(el).pointerEvents), "none", `${kind} batch remains interactive over modal`);
      await page.keyboard.press("Escape");
      await bar.getByRole("button", { name: "取消", exact: true }).click();
      assert.equal(await page.locator(".mobile-batch-action-bar").count(), 0);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output: out, report }, null, 2));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(out, error); process.exitCode = 1; });
