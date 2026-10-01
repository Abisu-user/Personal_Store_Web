/* eslint-disable @typescript-eslint/no-require-imports */
// Real shared React components and queue execution; only search API is mocked.
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { chromium } = require("playwright");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const root = path.resolve(__dirname, "../.."), out = fs.mkdtempSync(path.join(os.tmpdir(), "vault-global-header-"));
async function main() {
  await new Promise((resolve, reject) => webpack({ mode: "development", devtool: false, entry: path.join(__dirname, "global-header-fixture.tsx"), output: { path: out, filename: "test.js" }, resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": path.join(root, "src"), "next/navigation$": path.join(__dirname, "navigation-stub.tsx"), "next/link$": path.join(__dirname, "navigation-stub.tsx") } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "ts-loader.cjs") }, { test: /\.module\.css$/, use: path.join(__dirname, "global-header-css-loader.cjs") }] } }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const css = ["globals.css", "ui-foundation.css", "mobile-design-system.css", "global-header-layout.css"].map(file => fs.readFileSync(path.join(root, "src/app", file), "utf8")).join("\n");
  const server = http.createServer((req, res) => {
    if (req.url === "/test.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(fs.readFileSync(path.join(out, "test.js"))); }
    if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); return res.end(css); }
    res.end('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css"><style>#controls{display:flex;flex-wrap:wrap;gap:4px}section,#route{margin-block:12px}body{margin:0}#controls button{font-size:12px}</style></head><body><div id="root"></div><script src="/test.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage(), errors = [], requests = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/dashboard/desktop?**", route => { requests.push(route.request().url()); return route.fulfill({ json: { items: [{ id: "safe-result", kind: "note", title: "可公開搜尋筆記", href: "/notes?entry=safe-result", at: new Date().toISOString() }] } }); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator("#route [data-global-header-actions]").waitFor();
    for (const width of [375,390,402,430,700,701,768,820,821,1024,1280,1440,1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.body.style.background = theme === "light" ? "linear-gradient(100deg, #fff, #bbdbf0)" : "linear-gradient(100deg, #142338, #334674)"; }, theme);
        const metrics = await page.evaluate(() => [...document.querySelectorAll("[data-global-header-actions]")].filter(el => el.getClientRects().length && getComputedStyle(el).display !== "none" && [...el.parentElement.getClientRects()].some(r => r.width > 0)).map(el => { const r = el.getBoundingClientRect(), header = el.closest("header,.anime-mobile-heading"), h = header.getBoundingClientRect(); return { right: r.right, left: r.left, top: r.top, bottom: r.bottom, headerTop: h.top, headerHeight: h.height, sizes: [...el.querySelectorAll("button")].map(b => { const rect = b.getBoundingClientRect(); return [rect.width, rect.height]; }) }; }));
        for (const metric of metrics) { assert.ok(metric.left >= 0 && metric.right <= width, `${width}/${theme} actions overflow ${JSON.stringify(metric)}`); assert.ok(metric.top >= metric.headerTop && metric.bottom <= metric.headerTop + metric.headerHeight + 1, "buttons stay in header"); for (const [w,h] of metric.sizes) assert.ok(Math.abs(w-h)<1 && w>=40 && w<=44, `button size ${w}/${h}`); }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} horizontal overflow`);
      }
      await page.screenshot({ path: path.join(out, `header-${width}.png`), fullPage: true });
      if (width <= 700) assert.ok(await page.locator('#mobile-library h1').evaluate(el => el.scrollWidth <= el.clientWidth), `${width} ordinary mobile title must remain readable`);
      console.log("PASS responsive", width, "light/dark/background, square actions within headers");
    }
    await page.setViewportSize({ width:390, height:844 });
    const search = page.locator("#route").getByRole("button", { name:"搜尋全部", exact:true });
    await search.click();
    const dialog = page.getByRole("dialog", { name:"搜尋全部", exact:true });
    assert.equal(await page.getByLabel("搜尋資料", {exact:true}).evaluate(el => el === document.activeElement), true);
    await page.getByLabel("搜尋資料", {exact:true}).fill("筆記");
    await dialog.getByText("可公開搜尋筆記", {exact:true}).waitFor();
    await page.keyboard.press("Shift+Tab");
    assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), "search focus remains in the dialog");
    assert.ok(requests.every(url => new URL(url).pathname === "/api/dashboard/desktop"));
    await page.keyboard.press("Escape"); await dialog.waitFor({ state:"detached" });
    assert.equal(await search.evaluate(el => el === document.activeElement),true);
    await page.getByRole("button", {name:"加入測試佇列",exact:true}).click();
    const queue = page.locator("#route").getByRole("button", {name:"儲存佇列",exact:true});
    await page.waitForFunction(() => document.querySelector('#route [aria-label="儲存佇列"]').dataset.tone === "pending");
    await page.waitForFunction(() => document.querySelector('#route [aria-label="儲存佇列"]').dataset.tone === "saving");
    await page.getByRole("button", {name:"切換功能頁",exact:true}).click();
    assert.equal(await queue.getAttribute("data-tone"), "saving");
    await page.waitForFunction(() => document.querySelector('#route [aria-label="儲存佇列"]').dataset.tone === "success");
    await page.waitForFunction(() => document.querySelector('#route [aria-label="儲存佇列"]').dataset.tone === "idle");
    await page.getByRole("button", {name:"加入三筆",exact:true}).click();
    assert.match(await queue.textContent(), /3/);
    await queue.click();
    const panel = page.getByRole("dialog",{name:"背景工作中心"});
    await panel.waitFor();
    await panel.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    assert.equal(await panel.locator("article").count(),4);
    const rect = await panel.boundingBox(); assert.ok(rect.x>=0 && rect.x+rect.width<=390 && rect.y+rect.height<=845, "mobile sheet fits");
    await page.keyboard.press("Escape"); await panel.waitFor({state:"detached"});
    await page.waitForFunction(() => document.querySelector('#route [aria-label="儲存佇列"]').dataset.tone === "idle");
    await page.getByRole("button",{name:"加入失敗",exact:true}).click();
    await search.click(); await dialog.waitFor();
    await panel.getByText("模擬失敗",{exact:true}).waitFor();
    assert.equal(await dialog.count(), 0, "queue auto-open replaces search, with only one focus owner");
    assert.equal(await queue.getAttribute("data-tone"),"failed");
    await page.keyboard.press("Escape");
    await page.getByRole("button",{name:"允許重試成功",exact:true}).click();
    await queue.click(); await panel.getByRole("button",{name:"重試",exact:true}).click();
    await panel.getByText("模擬失敗",{exact:true}).waitFor({state:"detached"});
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector('#route [aria-label="儲存佇列"]').dataset.tone === "success");
    await page.setViewportSize({width:1440,height:900}); await queue.click();
    const desktopRect = await panel.boundingBox(); assert.ok(desktopRect.width<=420 && desktopRect.x+desktopRect.width<=1440);
    await page.keyboard.press("Escape");
    await page.locator('#anime [aria-label="搜尋動漫收藏"]').click();
    assert.equal(await page.locator("#local-state").textContent(),"頁內搜尋已開啟");
    await page.keyboard.press("Control+k"); await dialog.waitFor(); await page.keyboard.press("Escape");
    await page.context().setOffline(true);
    await page.getByRole("button",{name:"加入測試佇列",exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#route [aria-label="儲存佇列"]').dataset.tone === "offline");
    await page.context().setOffline(false);
    await page.waitForFunction(() => document.querySelector('#route [aria-label="儲存佇列"]').dataset.tone === "success");
    await page.evaluate(() => { const lock=document.createElement("div");lock.className="app-lock-overlay";document.body.appendChild(lock); });
    await page.keyboard.press("Control+k"); assert.equal(await dialog.count(),0,"global search cannot open over App Lock");
    assert.deepEqual(errors,[]);
    console.log("PASS search focus/trap/Escape/endpoint/local search; queue pending/saving/multiple/success-expiry/failure/retry/navigation/offline; App Lock shortcut guard");
    console.log("Screenshots:",out);
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
