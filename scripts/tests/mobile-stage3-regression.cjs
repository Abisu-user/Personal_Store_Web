/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const root = path.resolve(__dirname, "../.."), out = fs.mkdtempSync(path.join(os.tmpdir(), "vault-mobile-stage3-"));
const changes = ["src/app/(app)/notes/page.tsx", "src/app/(app)/code/page.tsx", "src/components/notes/notes-workspace.tsx", "src/components/code/code-workspace.tsx"];
for (const file of changes) {
  const target = path.join(out, file); fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, execFileSync("git", ["show", "HEAD:" + file], { cwd: root }));
}
async function build(before) {
  const commonStub = path.join(__dirname, "mobile-stage1-stubs.tsx"), dataStub = path.join(__dirname, "mobile-stage3-data-stubs.ts");
  const alias = { "@/lib/supabase/client$": commonStub, "@/lib/security/require-user$": commonStub, "@/lib/security/require-mfa$": commonStub, "@/lib/notes/data$": dataStub, "@/lib/code/data$": dataStub, "next/navigation$": commonStub, "next/link$": commonStub };
  if (before) for (const file of changes) alias[file.replace(/^src/, "@").replace(/\.tsx$/, "") + "$"] = path.join(out, file);
  alias["@"] = path.join(root, "src");
  await new Promise((resolve, reject) => webpack({
    mode: "development", devtool: false, entry: path.join(__dirname, "mobile-stage3-fixture.tsx"),
    output: { path: out, filename: before ? "before.js" : "after.js", chunkFilename: (before ? "before" : "after") + "-[id].js" },
    resolve: { extensions: [".tsx", ".ts", ".js"], alias, modules: [path.join(root, "node_modules"), "node_modules"] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "ts-loader.cjs") }, { test: /\.module\.css$/, use: path.join(__dirname, "mobile-stage1-css-loader.cjs") }] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
}
async function main() {
  await build(true); await build(false);
  const baseCss = ["src/app/globals.css", "src/app/mobile-design-system.css", "src/components/ui/mobile-collection.module.css"].map(file => fs.readFileSync(path.join(root, file), "utf8").replace(/:global\(([^)]+)\)/g, "$1")).join("\n");
  const mobileCss = fs.readFileSync(path.join(root, "src/components/ui/mobile-library.module.css"), "utf8").replace(/:global\(([^)]+)\)/g, "$1");
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/style.css") { res.setHeader("Content-Type", "text/css"); return res.end(baseCss + (url.searchParams.has("before") ? "" : mobileCss)); }
    if (url.pathname === "/icon.svg") { res.setHeader("Content-Type", "image/svg+xml"); return res.end(fs.readFileSync(path.join(root, "src/app/icon.svg"))); }
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
    const categories = Array.from({ length: 16 }, (_, index) => ({ id: `category-${index}`, name: `類別${index}`, sort_order: index, folder_id: null }));
    const folders = Array.from({ length: 10 }, (_, index) => ({ id: `folder-${index}`, name: `資料夾${index}`, sort_order: index, is_visible: true, is_locked: false, lock_method: null, lock_setup_required: false }));
    const items = Array.from({ length: 12 }, (_, index) => ({ id: `item-${index}`, title: `測試項目${index}`, description: `摘要內容 ${index}`, favorite: index % 4 === 0, pinned: index === 0, archived: false, deletedAt: null, folder: null, coverImageUrl: null, category: categories[index % 5], tags: [], updatedAt: `2026-09-0${index % 9 + 1}T12:00:00.000Z` }));
    await page.route("**/api/**", route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      requests.push([request.method(), pathname]);
      assert.equal(request.method(), "GET", "No mutation during layout test");
      return route.fulfill({ json: pathname === "/api/notes" ? { categories, folders, tags: [], notes: items.map((item, index) => ({ ...item, content: `筆記內容 ${index}`, currentVersion: index + 1 })) } : { categories, folders, tags: [], snippets: items.map((item, index) => ({ ...item, language: ["TypeScript", "Python", "HTML"][index % 3], sourceCode: `const item${index} = true;` })) } });
    });
    const base = "http://127.0.0.1:" + server.address().port;
    for (const kind of ["notes", "code"]) for (const width of [320, 375, 390, 430, 520, 700, 701, 760, 768, 820, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      requests = []; await page.goto(base + "?page=" + kind + "&before"); await page.locator(".content-item-card").first().waitFor(); await page.waitForTimeout(120);
      const beforeRequests = JSON.stringify(requests);
      const before = await page.screenshot({ path: path.join(out, kind + "-before-" + width + ".png") });
      const beforeTop = await page.locator(".content-item-list").evaluate(el => el.getBoundingClientRect().top);
      requests = []; await page.goto(base + "?page=" + kind); await page.locator(".content-item-card").first().waitFor(); await page.waitForTimeout(120);
      assert.equal(JSON.stringify(requests), beforeRequests, "No extra mobile data request");
      const after = await page.screenshot({ path: path.join(out, kind + "-after-" + width + ".png") });
      const afterTop = await page.locator(".content-item-list").evaluate(el => el.getBoundingClientRect().top);
      if (width > 700) assert.ok(before.equals(after), kind + " desktop pixel difference " + width);
      else {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "page overflow");
        assert.equal(await page.getByRole("button", { name: "新增", exact: true }).first().evaluate(el => el.getBoundingClientRect().height >= 43.5), true);
        const card = page.locator(".content-item-card").first();
        assert.ok(await card.getAttribute("data-pinned"), "pinned marker retained");
        assert.ok(await card.locator("time").isVisible(), "real updated date visible");
        assert.ok(await card.locator(".app-icon").isVisible(), "SVG type icon visible");
        const rails = await page.locator(".responsive-chip-overflow-row:not(.responsive-chip-overflow-measure)").evaluateAll(elements => elements.map(el => ({ right: el.getBoundingClientRect().right, tops: [...el.children].map(child => child.getBoundingClientRect().top), rights: [...el.children].map(child => child.getBoundingClientRect().right) })));
        for (const rail of rails) { assert.ok(new Set(rail.tops).size <= 1); assert.ok(rail.rights.every(value => value <= rail.right + 1)); }
      }
      const input = page.getByRole("textbox", { name: kind === "notes" ? "搜尋筆記" : "搜尋程式碼" });
      await input.fill("測試項目0"); assert.equal(await page.locator(".content-item-card").count(), 1); await input.fill("");
      await page.locator(".content-item-open").first().click(); await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
      await page.locator(".page-create-button").first().click(); await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
      report.push({ kind, width, result: width > 700 ? "pixel-identical" : "mobile-pass", beforeTop, afterTop, requests: beforeRequests });
    }
    for (const kind of ["notes", "code"]) {
      await page.setViewportSize({ width: 390, height: 1000 }); await page.goto(base + "?page=" + kind); await page.locator(".content-item-card").first().waitFor();
      const categoryMore = page.getByRole("button", { name: "查看更多類別" });
      await categoryMore.click(); await page.getByRole("dialog").getByRole("button", { name: /^類別15/ }).click();
      assert.ok((await categoryMore.getAttribute("class")).includes("active"), "hidden active category marks More");
      await categoryMore.click(); await page.getByRole("dialog").getByRole("button", { name: /^類別15/ }).click();
      assert.ok(!(await categoryMore.getAttribute("class")).includes("active"), "active category toggles to all");
      const folderSection = page.locator(".collection-navigation-section").first();
      await folderSection.getByRole("button", { name: "管理" }).click(); await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
      await folderSection.getByRole("button", { name: /新增/ }).click(); await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
    }
    for (const kind of ["notes", "code"]) for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto(base + "?page=" + kind); await page.locator(".content-item-card").first().waitFor();
      for (const display of ["list", "grid", "text"]) {
        await page.evaluate(display => window.setTestAppearance({ theme: "dark", accent: "custom", customColor: "#C35490", density: "compact", fontScale: 120, surfaceOpacity: 0, background: "image", backgroundImages: ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Cpath fill='%23354764' d='M0 0h10v10H0z'/%3E%3C/svg%3E"], bookmarkDisplay: display, bookmarkGridColumns: 2 }), display);
        await page.waitForTimeout(100); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.equal(await page.locator(".dashboard-card").evaluate(el => getComputedStyle(el).opacity), "1");
        assert.ok(await page.locator(".content-item-list").evaluate(el => el.scrollWidth <= el.clientWidth + 1), kind + " " + display + " list overflow");
        await page.screenshot({ path: path.join(out, kind + "-" + display + "-dark-" + width + ".png") });
      }
    }
    assert.deepEqual(errors, []); fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output: out, report }, null, 2));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(out, error); process.exitCode = 1; });
