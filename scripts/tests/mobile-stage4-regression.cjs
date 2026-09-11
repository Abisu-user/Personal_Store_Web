/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const root = path.resolve(__dirname, "../.."), out = fs.mkdtempSync(path.join(os.tmpdir(), "vault-mobile-stage4-"));
const changes = ["src/app/(app)/calendar/page.tsx", "src/app/(app)/photos/page.tsx", "src/components/calendar/calendar-workspace.tsx", "src/components/photos/photos-workspace.tsx"];
for (const file of changes) {
  const target = path.join(out, file); fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, execFileSync("git", ["show", "HEAD:" + file], { cwd: root }));
}
async function build(before) {
  const commonStub = path.join(__dirname, "mobile-stage1-stubs.tsx"), dataStub = path.join(__dirname, "mobile-stage4-data-stubs.ts");
  const alias = { "@/lib/supabase/client$": commonStub, "@/lib/security/require-user$": commonStub, "@/lib/security/require-mfa$": commonStub, "@/lib/photos/data$": dataStub, "@/lib/calendar/data$": dataStub, "next/navigation$": commonStub, "next/link$": commonStub };
  if (before) for (const file of changes) alias[file.replace(/^src/, "@").replace(/\.tsx$/, "") + "$"] = path.join(out, file);
  alias["@"] = path.join(root, "src");
  await new Promise((resolve, reject) => webpack({
    mode: "development", devtool: false, entry: path.join(__dirname, "mobile-stage4-fixture.tsx"),
    output: { path: out, filename: before ? "before.js" : "after.js", chunkFilename: (before ? "before" : "after") + "-[id].js" },
    resolve: { extensions: [".tsx", ".ts", ".js"], alias, modules: [path.join(root, "node_modules"), "node_modules"] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "ts-loader.cjs") }, { test: /\.module\.css$/, use: path.join(__dirname, "mobile-stage1-css-loader.cjs") }] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
}
async function main() {
  await build(true); await build(false);
  const baseCss = ["src/app/globals.css", "src/app/mobile-design-system.css", "src/components/ui/mobile-collection.module.css"].map(file => fs.readFileSync(path.join(root, file), "utf8").replace(/:global\(([^)]+)\)/g, "$1")).join("\n");
  const mobileCss = ["src/components/calendar/calendar-mobile.module.css", "src/components/photos/photos-mobile.module.css"].map(file => fs.readFileSync(path.join(root, file), "utf8").replace(/:global\(([^)]+)\)/g, "$1")).join("\n");
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
    const page = await browser.newPage(); page.setDefaultTimeout(9000);
    page.on("pageerror", error => errors.push(error.message));
    let requests = [];
    await page.route("**/api/**", route => { requests.push([route.request().method(), new URL(route.request().url()).pathname]); return route.fulfill({ status: 500, json: { error: "layout test blocks APIs" } }); });
    const base = "http://127.0.0.1:" + server.address().port;
    for (const kind of ["calendar", "photos"]) for (const width of [320, 375, 390, 430, 520, 700, 701, 760, 768, 820, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      requests = []; await page.goto(base + "?page=" + kind + "&before"); await page.locator(kind === "calendar" ? ".calendar-grid" : ".photo-grid").waitFor(); await page.waitForTimeout(150);
      const beforeRequests = JSON.stringify(requests), before = await page.screenshot({ path: path.join(out, kind + "-before-" + width + ".png") });
      requests = []; await page.goto(base + "?page=" + kind); await page.locator(kind === "calendar" ? ".calendar-grid" : ".photo-grid").waitFor(); await page.waitForTimeout(150);
      assert.equal(JSON.stringify(requests), beforeRequests, "No extra mobile request");
      const after = await page.screenshot({ path: path.join(out, kind + "-after-" + width + ".png") });
      if (width > 700) assert.ok(before.equals(after), kind + " desktop pixel difference " + width);
      else {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), kind + " page overflow " + width);
        if (kind === "calendar") {
          const grid = page.locator(".calendar-grid"); assert.ok(await grid.evaluate(el => el.scrollWidth <= el.clientWidth + 1), "calendar grid overflow");
          assert.ok(await page.getByRole("button", { name: "新行程" }).evaluate(el => el.getBoundingClientRect().height >= 43.5), "calendar add touch target");
          assert.equal(await page.locator(".calendar-event").count(), 3, "real selected-day events shown");
        } else {
          assert.equal(await page.locator(".photo-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length), 3, "three-column phone photo grid");
          assert.ok(await page.locator(".photo-grid").evaluate(el => el.scrollWidth <= el.clientWidth + 1), "photo grid overflow");
          assert.ok(await page.getByRole("button", { name: "上傳", exact: true }).evaluate(el => el.getBoundingClientRect().height >= 43.5), "photo upload touch target");
          const rails = await page.locator(".responsive-chip-overflow-row:not(.responsive-chip-overflow-measure)").evaluateAll(elements => elements.map(el => ({ right: el.getBoundingClientRect().right, tops: [...el.children].map(child => child.getBoundingClientRect().top), rights: [...el.children].map(child => child.getBoundingClientRect().right) })));
          for (const rail of rails) { assert.ok(new Set(rail.tops).size <= 1); assert.ok(rail.rights.every(value => value <= rail.right + 1)); }
        }
      }
      if (kind === "calendar") {
        await page.getByRole("button", { name: "新行程" }).click(); await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "下個月" }).click();
      } else {
        const input = page.getByRole("textbox", { name: "搜尋照片" }); await input.fill("照片 1"); assert.ok(await page.locator(".photo-card-wrap").count() > 0); await input.fill("");
        await page.locator(".photo-card").first().click(); await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
        await page.locator(".page-create-button").first().click(); await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
      }
      report.push({ kind, width, result: width > 700 ? "pixel-identical" : "mobile-pass", requests: beforeRequests });
    }
    for (const kind of ["calendar", "photos"]) for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto(base + "?page=" + kind); await page.locator(kind === "calendar" ? ".calendar-grid" : ".photo-grid").waitFor();
      await page.evaluate(() => window.setTestAppearance({ theme: "dark", accent: "custom", customColor: "#C35490", density: "compact", fontScale: 120, surfaceOpacity: 0, background: "image", backgroundImages: ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Cpath fill='%23354764' d='M0 0h10v10H0z'/%3E%3C/svg%3E"] }));
      await page.waitForTimeout(100); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(await page.locator(".dashboard-card").evaluate(el => getComputedStyle(el).opacity), "1");
      await page.screenshot({ path: path.join(out, kind + "-dark-" + width + ".png") });
    }
    assert.deepEqual(errors, []); fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output: out, report }, null, 2));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(out, error); process.exitCode = 1; });
