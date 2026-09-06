/* eslint-disable @typescript-eslint/no-require-imports */
/* Run: NODE_PATH=<directory containing playwright> node scripts/tests/quiz-browser-regression.cjs
 * Uses a local, isolated browser with fake API data. Never accesses user data.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../..");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "vault-quiz-regression-"));
async function main() {
  await new Promise((resolve, reject) => webpack({
    mode: "development", devtool: false, entry: path.join(__dirname, "quiz-fixture.tsx"),
    output: { path: output, filename: "test.js" },
    resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@/lib/supabase/client$": path.join(__dirname, "storage-stub.ts"), "@": path.join(root, "src"), "next/navigation$": path.join(__dirname, "navigation-stub.tsx"), "next/link$": path.join(__dirname, "navigation-stub.tsx") } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "ts-loader.cjs") }] },
  }, (err, stats) => err || stats.hasErrors() ? reject(err || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const server = http.createServer((req, res) => {
    if (req.url === "/test.js") { res.setHeader("Content-Type", "text/javascript"); res.end(fs.readFileSync(path.join(output, "test.js"))); }
    else if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(fs.readFileSync(path.join(root, "src/app/globals.css"))); }
    else res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/test.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || "msedge" }).catch(error => { server.close(); throw error; });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on("pageerror", e => { errors.push(e.message); console.error("Browser:", e.message); });
    let saves = 0, failSave = false, delaySave = 0;
    const createRequests = [];
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      if (route.request().method() === "POST") createRequests.push(url.pathname);
      if (url.pathname === "/api/vocabulary/review") {
        saves++; if (delaySave) await new Promise(r => setTimeout(r, delaySave));
        return route.fulfill({ status: failSave ? 500 : 200, json: failSave ? { error: "模擬儲存失敗" } : { cardUpdates: [] } });
      }
      if (url.pathname === "/api/vocabulary") return route.fulfill({ json: await page.evaluate(() => window.testData) });
      if (url.pathname.endsWith("/upload-url")) return route.fulfill({ json: { ticket: "test", token: "test", storagePath: "test" } });
      return route.fulfill({ json: { folders: [], categories: [], items: [], files: [], photos: [], bookmarks: [], tags: [] } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator(".vocabulary-workspace").waitFor();
    console.log("Tabs:", await page.locator(".vocabulary-tabs").innerText());
    console.log("Errors:", errors);
    await page.getByRole("button", { name: /複習與測驗/ }).click();
    await page.getByRole("button", { name: /測驗模式/ }).click();
    const count = page.getByLabel("本次單字數");
    await count.fill(""); await count.fill("20"); assert.equal(await count.inputValue(), "20");
    await count.fill("2"); assert.equal(await count.inputValue(), "2");
    await count.blur(); assert.equal(await count.inputValue(), "5");
    await count.fill("999"); assert.equal(await count.inputValue(), "999");
    await count.blur(); assert.equal(await count.inputValue(), "30");
    assert.equal(await count.getAttribute("inputmode"), "numeric");
    await count.fill("5"); await page.getByRole("button", { name: "開始測驗", exact: true }).click();
    const words = () => page.locator(".vocabulary-quiz-card h2").textContent();
    async function finish() {
      const prompts = [];
      for (let i = 0; i < 5; i++) {
        prompts.push(await words());
        await page.getByRole("button", { name: "不會，跳過這個單字" }).click();
        assert.match(await page.locator(".vocabulary-quiz-card [role=status]").textContent(), /正確答案/);
        await page.getByRole("button", { name: "下一題", exact: true }).click();
      }
      return prompts;
    }
    delaySave = 700; const first = await finish();
    await page.locator("#test-nav").getByRole("button", { name: "away", exact: true }).click();
    await page.locator("#test-nav").getByRole("button", { name: "quiz", exact: true }).click();
    await page.locator(".quiz-result-actions").waitFor();
    assert.equal(saves, 1, "remount during saving must not duplicate POST");
    assert.deepEqual(await page.locator(".quiz-result-actions button").allTextContents(), ["回到首頁", "重新設定", "繼續"]);
    assert.equal(await page.locator(".quiz-result-actions").evaluate(el => getComputedStyle(el).position), "static");
    for (const width of [1440,390,320]) {
      await page.setViewportSize({width,height:900});
      await page.locator(".quiz-result-actions").scrollIntoViewIfNeeded();
      assert.ok(await page.locator(".quiz-result-actions").evaluate(el => {
        const rect = el.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth + 1 && [...el.children].every(button => button.scrollWidth <= button.clientWidth);
      }));
      await page.screenshot({path:path.join(output,`quiz-result-${width}.png`)});
    }
    await page.setViewportSize({width:1440,height:1000});
    const result = await page.locator(".vocabulary-quiz-results").textContent();
    await page.locator("#test-nav").getByRole("button", { name: "away", exact: true }).click();
    await page.locator("#test-nav").getByRole("button", { name: "quiz", exact: true }).click();
    assert.equal(await page.locator(".vocabulary-quiz-results").textContent(), result);
    await page.getByRole("button", { name: "繼續", exact: true }).click();
    assert.ok(!first.includes(await words()), "continue prefers fresh questions");
    failSave = true; delaySave = 0; await finish();
    await page.getByRole("button", { name: "重試儲存" }).waitFor();
    failSave = false; await page.getByRole("button", { name: "重試儲存" }).click();
    await page.locator(".quiz-result-actions").waitFor();
    await page.getByRole("button", { name: "重新設定", exact: true }).click();
    assert.equal(await count.inputValue(), "5");
    await page.getByRole("button", { name: "開始測驗", exact: true }).click(); await finish();
    await page.getByRole("button", { name: "回到首頁", exact: true }).click();
    await page.getByRole("button", { name: /測驗模式/ }).waitFor();
    const metrics = await page.evaluate(() => {
      const h = window.quizHelpers, base = window.testData.cards[0], counts = [0,0,0,0,0,0];
      // Seeded PRNG makes this distribution check repeatable.
      let seed = 12345; const original = Math.random;
      Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const pool = counts.map((_, i) => ({ ...base, id: String(i), currentLevel: i, totalAttempts: i ? 10 : 0 }));
      for (let i = 0; i < 30000; i++) counts[Number(h.drawQuizCards(pool, 1, "smart", "random")[0].id)]++;
      Math.random = original;
      const a = { ...base, id: "a", word: "収める", reading: "おさめる" }, b = { ...base, id: "b", word: "収納する", reading: "シュウノウスル" };
      return { counts, hints: h.ambiguousHints([a,b]), duplicateHints: h.ambiguousHints([a,{ ...a,id:"copy" }]), uniqueHints: h.ambiguousHints([a]), dedup: h.drawQuizCards([a,a,b],99,"smart","random").map(c=>c.id), filtered: h.eligibleStudyCards(pool, { language:"en", query:"", deckId:null, mastery:null, kana:null },true).length };
    });
    assert.ok(metrics.counts.every((v,i,a) => i === 0 || a[i-1] > v));
    assert.ok(metrics.counts[5] > 0); assert.deepEqual(metrics.hints,{a:"お",b:"し"});
    assert.deepEqual(metrics.duplicateHints,{}); assert.deepEqual(metrics.uniqueHints,{});
    assert.equal(metrics.dedup.length,2); assert.equal(metrics.filtered,0);
    console.log("PASS quiz lifecycle, remount, saving retry, input UX, filters, hints and weighted draws:",metrics.counts);
    for (const width of [1440,390]) {
      await page.setViewportSize({width,height:900});
      for (const kind of ["bookmark","file","photo"]) {
        await page.locator("#test-nav").getByRole("button",{name:kind,exact:true}).click();
        const submit = page.locator(".create-form-actions button[type=submit]");
        await submit.scrollIntoViewIfNeeded();
        assert.ok(await submit.isVisible()); assert.equal(await submit.isEnabled(),true);
        const geometry = await submit.evaluate(el=>{ const r=el.getBoundingClientRect(),s=getComputedStyle(el); return { x:r.x,right:r.right,bottom:r.bottom,height:r.height,color:s.color,bg:s.backgroundColor }; });
        assert.ok(geometry.x>=0 && geometry.right<=width+1);
        assert.ok(geometry.height>=36);
        assert.notEqual(geometry.color,geometry.bg);
        await page.screenshot({path:path.join(output,`${kind}-${width}.png`)});
        const before = createRequests.length;
        if (kind === "bookmark") {
          await page.locator('input[name=url]').fill("https://example.com/test");
          await page.locator('input[name=title]').fill("測試網站收藏");
        } else {
          await page.locator(`input[name=${kind === "file" ? "file" : "photo"}]`).setInputFiles({
            name: kind === "file" ? "test.txt" : "test.png", mimeType: kind === "file" ? "text/plain" : "image/png",
            buffer: kind === "file" ? Buffer.from("test") : Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC3sAAAAASUVORK5CYII=","base64"),
          });
        }
        const api = kind === "bookmark" ? "/api/bookmarks" : `/api/${kind}s`;
        await Promise.all([page.waitForResponse(response => response.url().endsWith(api) && response.request().method() === "POST"), submit.click()]);
        assert.ok(createRequests.slice(before).includes(api), "save button must submit the existing form");
      }
    }
    assert.deepEqual(errors,[]);
    console.log("PASS three create-form action rows at desktop/mobile. Screenshots:",output);
  } finally { await browser.close(); server.close(); }
}
main().catch(e=>{ console.error(e);process.exitCode=1; });
