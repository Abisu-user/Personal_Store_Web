/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const fixture = require("./mobile-stage2-data.cjs");
const root = path.resolve(__dirname, "../.."), out = fs.mkdtempSync(path.join(os.tmpdir(), "vault-mobile-stage2-"));
const changes = ["src/app/(app)/anime/page.tsx", "src/app/(app)/bookmarks/page.tsx", "src/components/anime/anime-workspace.tsx", "src/components/bookmarks/bookmarks-workspace.tsx"];
for (const file of changes) {
  const target = path.join(out, file); fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, execFileSync("git", ["show", "HEAD:" + file], { cwd: root }));
}
async function build(before) {
  const stub = path.join(__dirname, "mobile-stage1-stubs.tsx");
  const alias = { "@/lib/supabase/client$": stub, "@/lib/security/require-user$": stub, "@/lib/security/require-mfa$": stub, "next/navigation$": stub, "next/link$": stub };
  if (before) for (const file of changes) alias[file.replace(/^src/, "@").replace(/\.tsx$/, "") + "$"] = path.join(out, file);
  alias["@"] = path.join(root, "src");
  await new Promise((resolve, reject) => webpack({
    mode: "development", devtool: false, entry: path.join(__dirname, "mobile-stage2-fixture.tsx"),
    output: { path: out, filename: before ? "before.js" : "after.js", chunkFilename: (before ? "before" : "after") + "-[id].js" },
    resolve: { extensions: [".tsx", ".ts", ".js"], alias, modules: [path.join(root, "node_modules"), "node_modules"] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "ts-loader.cjs") }, { test: /\.module\.css$/, use: path.join(__dirname, "mobile-stage1-css-loader.cjs") }] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
}
async function main() {
  await build(true); await build(false);
  const css = ["src/app/globals.css", "src/app/mobile-design-system.css"].map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  const additions = ["src/components/ui/mobile-collection.module.css", "src/components/anime/anime-mobile.module.css", "src/components/bookmarks/bookmarks-mobile.module.css"].map(file => fs.readFileSync(path.join(root, file), "utf8").replace(/:global\(([^)]+)\)/g, "$1")).join("\n");
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/style.css") { res.setHeader("Content-Type", "text/css"); return res.end(css + (url.searchParams.has("before") ? "" : additions)); }
    if (url.pathname.startsWith("/covers/")) { res.setHeader("Content-Type", "image/svg+xml"); return res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><defs><linearGradient id="a" x2="1" y2="1"><stop stop-color="#7b93cd"/><stop offset="1" stop-color="#34436f"/></linearGradient></defs><path fill="url(#a)" d="M0 0h200v300H0z"/><circle cx="145" cy="70" r="35" fill="#f4d8b0"/><path fill="#cedce5" d="m0 250 70-100 40 45 35-30 55 85v50H0Z"/></svg>'); }
    if (url.pathname === "/icon.svg") { res.setHeader("Content-Type", "image/svg+xml"); return res.end(fs.readFileSync(path.join(root, "src/app/icon.svg"))); }
    if (url.pathname.endsWith(".js")) { res.setHeader("Content-Type", "text/javascript"); return res.end(fs.readFileSync(path.join(out, path.basename(url.pathname)))); }
    const before = url.searchParams.has("before");
    res.end('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css' + (before ? "?before" : "") + '"></head><body><div id="root"></div><script src="/' + (before ? "before" : "after") + '.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const report = [], errors = [];
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(9000);
    page.on("pageerror", error => errors.push(error.message));
    let requests = [], shortTaxonomy = false;
    await page.route("**/api/**", route => {
      const request = route.request(); requests.push([request.method(), new URL(request.url()).pathname]);
      assert.equal(request.method(), "GET", "No live mutations in UI checks");
      let data = request.url().includes("/anime/library") ? fixture.anime : request.url().includes("/bookmarks") ? fixture.bookmarks : {};
      if (shortTaxonomy) data = { ...data, tags: [], categories: [], folders: [] };
      return route.fulfill({ json: data });
    });
    await page.route("https://**", route => route.abort());
    const base = "http://127.0.0.1:" + server.address().port;
    const ready = async kind => {
      await page.locator(kind === "anime" ? ".anime-card" : ".bookmark-card").first().waitFor();
      await page.evaluate(() => Promise.all([...document.images].filter(image => { const box = image.getBoundingClientRect(); return box.top < innerHeight && box.bottom > 0; }).map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = resolve; image.onerror = resolve; }))));
      await page.waitForTimeout(150);
    };
    for (const kind of ["anime", "bookmarks"]) {
      for (const width of [320, 375, 390, 430, 520, 700, 701, 760, 768, 820, 1366, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        requests = []; await page.goto(base + "?page=" + kind + "&before"); await ready(kind);
        const beforeRequests = JSON.stringify(requests);
        const before = await page.screenshot({ path: path.join(out, kind + "-before-" + width + ".png") });
        const beforeTop = await page.locator(kind === "anime" ? ".anime-grid" : ".bookmark-list").first().evaluate(el => el.getBoundingClientRect().top);
        requests = []; await page.goto(base + "?page=" + kind); await ready(kind);
        assert.equal(JSON.stringify(requests), beforeRequests, "No extra requests");
        const after = await page.screenshot({ path: path.join(out, kind + "-after-" + width + ".png") });
        const afterTop = await page.locator(kind === "anime" ? ".anime-grid" : ".bookmark-list").first().evaluate(el => el.getBoundingClientRect().top);
        if (width > 700) assert.ok(before.equals(after), kind + " desktop pixel difference " + width);
        else {
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "page overflow");
          const rails = await page.locator(".responsive-chip-overflow-row:not(.responsive-chip-overflow-measure)").evaluateAll(elements => elements.map(el => {
            const box = el.getBoundingClientRect(), root = el.parentElement, measure = root.querySelector(".responsive-chip-overflow-measure");
            return { width: box.width, tops: [...el.children].map(child => child.getBoundingClientRect().top), rights: [...el.children].map(child => child.getBoundingClientRect().right), right: box.right,
              root: {width:root.getBoundingClientRect().width,padding:getComputedStyle(root).padding,border:getComputedStyle(root).borderWidth},
              measured: [...measure.children].slice(0,4).map(child => ({text:child.textContent,width:child.getBoundingClientRect().width})),gap:getComputedStyle(measure).gap,
              actual: [...el.children].map(child => ({text:child.textContent,width:child.getBoundingClientRect().width})) };
          }));
          for (const rail of rails) { assert.ok(new Set(rail.tops).size <= 1, "no second row"); assert.ok(rail.rights.every(right => right <= rail.right + 1), "chips stay inside outer rail: " + JSON.stringify(rail)); }
          assert.equal(await page.getByRole("button", { name: /查看更多.*類別/ }).filter({ visible: true }).count(), 1);
          const sizes = await page.locator(".collection-navigation-action,.responsive-chip-overflow-row:not(.responsive-chip-overflow-measure)>button,.anime-mobile-heading button,.anime-tabs button").evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => ({ text: el.textContent, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
          for (const size of sizes) assert.ok(size.width >= 43.5 && size.height >= 43.5, "touch " + kind + width + JSON.stringify(size));
          if (kind === "anime") {
            await page.getByRole("button", { name: "搜尋自己的動漫", exact: true }).click();
            assert.equal(await page.getByRole("textbox", { name: "搜尋自己的動漫" }).evaluate(el => el === document.activeElement), true);
            const heading = await page.locator(".anime-mobile-heading").boundingBox(), add = await page.locator(".anime-mobile-create-button").boundingBox();
            assert.ok(Math.abs((heading.y + heading.height / 2) - (add.y + add.height / 2)) < 2, "title and add aligned");
            assert.ok(await page.locator(".episodeProgress").first().isVisible());
          }
        }
        await page.getByRole("textbox", { name: kind === "anime" ? "搜尋自己的動漫" : "搜尋網站收藏", exact: true }).fill(kind === "anime" ? "測試作品0" : "網站測試0");
        assert.equal(await page.locator(kind === "anime" ? ".anime-card" : ".bookmark-card").count(), 1, "search same state");
        await page.getByRole("textbox", { name: kind === "anime" ? "搜尋自己的動漫" : "搜尋網站收藏", exact: true }).fill("");
        report.push({ kind, width, result: width > 700 ? "pixel-identical" : "mobile pass", beforeTop, afterTop, requests: beforeRequests });
      }
    }
    for (const kind of ["anime", "bookmarks"]) {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(base + "?page=" + kind); await ready(kind);
        const more = page.getByRole("button", { name: /查看更多.*類別/ });
        await more.click();
        await page.getByRole("dialog").getByRole("button", { name: /^類別23/ }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.ok((await more.getAttribute("class")).includes("active"), "hidden active selection");
        await more.click();
        await page.getByRole("dialog").getByRole("button", { name: /^類別23/ }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.ok(!(await more.getAttribute("class")).includes("active"), "toggle selection off");
        const folders = page.locator(".collection-navigation-section").first();
        await folders.getByRole("button", { name: /更多.*資料夾/ }).click();
        await page.getByRole("dialog").getByRole("button", { name: /^資料夾11/ }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await folders.getByRole("button", { name: /更多.*資料夾/ }).click();
        await page.getByRole("dialog").getByRole("button", { name: /^資料夾11/ }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await folders.getByRole("button", { name: /管理/ }).click();
        await page.getByRole("dialog").waitFor();
        await page.keyboard.press("Escape");
        await folders.getByRole("button", { name: /新增/ }).click();
        await page.getByRole("dialog").waitFor();
        await page.keyboard.press("Escape");
        const add = kind === "anime" ? page.locator(width <= 700 ? ".anime-mobile-create-button" : ".anime-create-button") : page.locator(".page-heading .page-create-button");
        await add.click(); await page.getByRole("dialog").waitFor();
        await page.keyboard.press("Escape");
        if (kind === "anime") {
          await page.locator(".anime-tabs").getByRole("button", { name: "統計", exact: true }).click();
          await page.locator(".anime-stats-panel").first().waitFor();
          await page.locator(".anime-tabs").getByRole("button", { name: "我的動漫", exact: true }).click();
          assert.equal(await page.locator(".anime-tabs").getByRole("button", { name: "成人內容", exact: true }).count(), 0, "adult permission preserved");
        }
      }
      await page.setViewportSize({ width: 390, height: 1000 });
      shortTaxonomy = true; await page.goto(base + "?page=" + kind); await ready(kind);
      assert.equal(await page.locator(".collection-navigation-section").getByRole("button", { name: /更多/ }).count(), 0, "No More when all fit");
      shortTaxonomy = false;
    }
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto(base + "?page=bookmarks"); await ready("bookmarks");
      for (const display of ["list", "grid", "text"]) {
        await page.evaluate(display => window.setTestAppearance({ theme: "dark", accent: "custom", customColor: "#C35490", density: "compact", fontScale: 120, bookmarkDisplay: display, bookmarkGridColumns: 2, surfaceOpacity: 0, background: "image", backgroundImages: ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Cpath fill='%23354764' d='M0 0h10v10H0z'/%3E%3C/svg%3E"] }), display);
        await page.locator(".bookmark-list-" + display).waitFor();
        assert.equal(await page.locator(".collection-navigation-section .responsive-chip-overflow-row:not(.responsive-chip-overflow-measure) > button:not(.active)").first().evaluate(el => {
          const probe = document.createElement("span"); probe.style.backgroundColor = "var(--surface)"; el.append(probe);
          const matches = getComputedStyle(el).backgroundColor === getComputedStyle(probe).backgroundColor; probe.remove(); return matches;
        }), true, "dark chips use shared surface");
        assert.ok(await page.locator(".bookmark-list").evaluate(el => el.scrollWidth <= el.clientWidth + 1), "bookmark display overflow " + width + display);
        await page.screenshot({ path: path.join(out, "bookmarks-" + display + "-dark-" + width + ".png") });
      }
    }
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto(base + "?page=anime"); await ready("anime");
      await page.evaluate(() => window.setTestAppearance({ theme: "dark", accent: "custom", customColor: "#C35490", density: "compact", fontScale: 120, surfaceOpacity: 0, background: "image", backgroundImages: ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Cpath fill='%23354764' d='M0 0h10v10H0z'/%3E%3C/svg%3E"] }));
      await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "dark anime overflow");
      assert.equal(await page.locator(".dashboard-card").first().evaluate(el => getComputedStyle(el).opacity), "1", "surface opacity does not fade children");
      await page.screenshot({ path: path.join(out, "anime-dark-" + width + ".png") });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output: out, report }, null, 2));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(out, error); process.exitCode = 1; });
