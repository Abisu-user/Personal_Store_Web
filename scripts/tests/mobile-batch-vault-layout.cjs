/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../.."), out = fs.mkdtempSync(path.join(os.tmpdir(), "vault-mobile-batch-vault-"));
const clean = value => value.replace(/:global\(([^)]+)\)/g, "$1");
const current = clean(fs.readFileSync(path.join(root, "src/components/vault/vault-mobile.module.css"), "utf8"));
const before = clean(execFileSync("git", ["show", "HEAD:src/components/vault/vault-mobile.module.css"], { cwd: root }).toString());
const common = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8") + "\n" + fs.readFileSync(path.join(root, "src/app/mobile-design-system.css"), "utf8");
const markup = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css"></head><body><main class="app-main"><section class="vaultWorkspace"><div class="vault-grid"><article class="vault-item"><header><span class="vault-kind-badge">網站</span><button class="vault-menu-trigger">⋯</button></header><div class="vault-item-content"><h3>Cloudflare</h3><p class="vault-username">99135ddd@gmail.com</p><code>••••••••••</code></div><footer><button class="secondary-button">顯示</button><button class="secondary-button">複製</button></footer></article></div></section></main><aside class="mobile-batch-action-bar"><strong>已選 1 筆</strong><button class="mobile-batch-cancel">取消</button><div class="mobile-batch-actions"><button class="secondary-button">整理</button><button class="delete-button">刪除</button></div></aside><nav class="mobile-bottom-nav"><a><i></i><span>首頁</span></a><button class="mobile-create">新增</button><a><i></i><span>更多</span></a></nav></body></html>`;

async function main() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/style.css") { res.setHeader("Content-Type", "text/css"); return res.end(common + "\n" + (url.searchParams.has("before") ? before : current)); }
    res.end(markup.replace("/style.css", "/style.css" + (url.searchParams.has("before") ? "?before" : "")));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, channel: "chrome" }), report = [];
  try {
    const page = await browser.newPage(), base = `http://127.0.0.1:${server.address().port}`;
    for (const width of [375, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + "?before"); const beforeHeight = (await page.locator(".vault-item").boundingBox()).height;
      await page.goto(base); await page.locator(".mobile-batch-action-bar").evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
      const cardHeight = (await page.locator(".vault-item").boundingBox()).height;
      const bar = await page.locator(".mobile-batch-action-bar").boundingBox(), nav = await page.locator(".mobile-bottom-nav").boundingBox();
      assert.ok(cardHeight < beforeHeight, `vault card was not compacted at ${width}`);
      assert.ok(bar.x >= 0 && bar.x + bar.width <= width && bar.y + bar.height <= nav.y - 7.5, `batch geometry ${width}`);
      for (const button of await page.locator(".mobile-batch-action-bar button").all()) assert.ok((await button.boundingBox()).height >= 44);
      await page.evaluate(() => { document.documentElement.style.setProperty("--mobile-nav-safe-bottom", "34px"); document.documentElement.style.setProperty("--mobile-nav-height", "86px"); });
      const safeBar = await page.locator(".mobile-batch-action-bar").boundingBox(), safeNav = await page.locator(".mobile-bottom-nav").boundingBox();
      assert.ok(safeBar.y + safeBar.height <= safeNav.y - 7.5, `safe-area batch geometry ${width}`);
      await page.evaluate(() => document.body.insertAdjacentHTML("beforeend", "<div class=\"modal-dialog-backdrop\"></div>"));
      assert.equal(await page.locator(".mobile-batch-action-bar").evaluate(el => getComputedStyle(el).pointerEvents), "none");
      await page.screenshot({ path: path.join(out, `vault-batch-${width}.png`), animations: "disabled" });
      report.push({ width, beforeHeight, afterHeight: cardHeight, reduction: beforeHeight - cardHeight, safeArea: "34px pass" });
    }
    for (const width of [1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto(base + "?before"); const oldShot = await page.screenshot();
      await page.goto(base); const newShot = await page.screenshot(); assert.ok(oldShot.equals(newShot), `desktop changed at ${width}`);
    }
    console.log(JSON.stringify({ output: out, report }, null, 2));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(out, error); process.exitCode = 1; });
