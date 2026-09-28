/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const root = path.resolve(__dirname, "../..");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "vault-calendar-browser-"));

async function main() {
  await new Promise((resolve, reject) => webpack({
    mode: "development", devtool: false, entry: path.join(__dirname, "calendar-fixture.tsx"),
    output: { path: output, filename: "fixture.js" },
    resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "next/navigation$": path.join(root, "scripts/tests/mobile-stage1-stubs.tsx"), "@": path.join(root, "src") }, modules: [path.join(root, "node_modules"), "node_modules"] },
    module: { rules: [
      { test: /\.tsx?$/, exclude: /node_modules/, use: path.join(root, "scripts/tests/ts-loader.cjs") },
      { test: /\.module\.css$/, use: path.join(root, "scripts/tests/mobile-stage1-css-loader.cjs") },
    ] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));

  const css = ["src/app/globals.css", "src/app/mobile-design-system.css", "src/components/calendar/calendar-mobile.module.css"].map((file) => fs.readFileSync(path.join(root, file), "utf8").replace(/:global\(([^)]+)\)/g, "$1")).join("\n");
  const server = http.createServer((request, response) => {
    if (request.url === "/style.css") { response.setHeader("Content-Type", "text/css"); return response.end(css); }
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); return response.end(fs.readFileSync(path.join(output, "fixture.js"))); }
    response.end('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const errors = [];
  const results = [];
  const mutations = [];
  let failNextPost = false;
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/calendar**", (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === "GET") return route.fulfill({ json: { events: [], calendarDays: [], range: { from: url.searchParams.get("from"), to: url.searchParams.get("to") } } });
      mutations.push({ method: route.request().method(), body: route.request().postDataJSON() });
      if (route.request().method() === "POST" && failNextPost) { failNextPost = false; return route.fulfill({ status: 400, json: { error: "測試儲存失敗" } }); }
      return route.fulfill({ json: { ok: true } });
    });
    for (const width of [390, 430, 700, 701, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("http://127.0.0.1:" + server.address().port);
      await page.locator(".grid").waitFor();
      await page.waitForTimeout(75);
      const dimensions = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, grid: document.querySelector(".grid").scrollWidth, gridClient: document.querySelector(".grid").clientWidth, columns: getComputedStyle(document.querySelector(".layout")).gridTemplateColumns.split(" ").length }));
      assert.ok(dimensions.page <= width + 1, "horizontal overflow at " + width + ": " + JSON.stringify(dimensions));
      assert.ok(dimensions.grid <= dimensions.gridClient + 1, "calendar grid overflow at " + width);
      assert.equal(dimensions.columns, width <= 700 ? 1 : 2, "layout columns at " + width);
      assert.equal(await page.locator(".rest").count(), 1, "only connected official rest is marked at " + width);
      assert.equal(await page.getByText("普通週末").count(), 0, "ordinary weekend is not labeled at " + width);
      assert.match(await page.locator(".selectedMeta").textContent(), /休/, "selected day knows official rest status");
      await page.screenshot({ path: path.join(output, "calendar-" + width + ".png") });
      await page.getByRole("button", { name: "＋ 新行程" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, "dialog overflow at " + width);
      await page.keyboard.press("Escape");
      const monthBefore = await page.locator(".calendarHeader h2").textContent();
      await page.getByRole("button", { name: "下一個月" }).click();
      await page.waitForFunction((previous) => document.querySelector(".calendarHeader h2")?.textContent !== previous, monthBefore);
      results.push({ width, columns: dimensions.columns, overflow: false, modalFits: true });
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("http://127.0.0.1:" + server.address().port);
    await page.getByRole("button", { name: "＋ 新行程" }).click();
    await page.getByLabel("行程名稱").fill("生日 測試");
    await page.getByLabel("全天").check();
    await page.getByLabel("重複").selectOption("yearly");
    await page.getByRole("button", { name: "選擇紫色" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "新增行程" }).click();
    await page.waitForFunction(() => [...document.querySelectorAll(".timelineEvent")].some((item) => item.textContent.includes("生日 測試")));
    await page.waitForTimeout(100);
    assert.equal(mutations.at(-1)?.method, "POST");
    assert.equal(mutations.at(-1)?.body.recurrenceType, "yearly");
    assert.equal(mutations.at(-1)?.body.allDay, true);
    assert.equal(mutations.at(-1)?.body.color, "#9B76C5");
    await page.locator(".timelineEvent").filter({ hasText: "生日 測試" }).click();
    const current = new Date();
    const changed = new Date(current);
    changed.setDate(current.getDate() < 28 ? current.getDate() + 1 : current.getDate() - 1);
    const changedDate = [changed.getFullYear(), String(changed.getMonth() + 1).padStart(2, "0"), String(changed.getDate()).padStart(2, "0")].join("-");
    await page.getByLabel("行程名稱").fill("生日 更新");
    await page.getByLabel("日期").fill(changedDate);
    await page.getByRole("button", { name: "自訂行程顏色" }).click();
    await page.getByLabel("Hex 色碼").fill("#F8E989");
    await page.getByRole("dialog").getByRole("button", { name: "儲存修改" }).click();
    await page.waitForFunction(() => [...document.querySelectorAll(".timelineEvent")].some((item) => item.textContent.includes("生日 更新")));
    await page.waitForTimeout(100);
    assert.equal(mutations.at(-1)?.method, "PATCH");
    assert.equal(mutations.at(-1)?.body.eventDate, changedDate);
    assert.equal(mutations.at(-1)?.body.color, "#F8E989");
    await page.locator(".timelineEvent").filter({ hasText: "生日 更新" }).click();
    await page.getByLabel("重複").selectOption("none");
    await page.getByRole("dialog").getByRole("button", { name: "儲存修改" }).click();
    await page.waitForTimeout(100);
    assert.equal(mutations.at(-1)?.body.recurrenceType, "none");
    await page.locator(".timelineEvent").filter({ hasText: "生日 更新" }).click();
    await page.getByLabel("重複").selectOption("yearly");
    await page.getByRole("dialog").getByRole("button", { name: "儲存修改" }).click();
    await page.waitForTimeout(100);
    assert.equal(mutations.at(-1)?.body.recurrenceType, "yearly");
    await page.locator(".timelineEvent").filter({ hasText: "生日 更新" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "刪除每年重複行程" }).click();
    assert.match(await page.getByRole("alertdialog").textContent(), /每一年都不會再顯示/);
    await page.getByRole("alertdialog").getByRole("button", { name: "確認刪除" }).click();
    await page.waitForTimeout(100);
    assert.equal(mutations.at(-1)?.method, "DELETE");
    assert.equal(await page.locator(".timelineEvent").filter({ hasText: "生日 更新" }).count(), 0);
    failNextPost = true;
    await page.getByRole("button", { name: "＋ 新行程" }).click();
    await page.getByLabel("行程名稱").fill("失敗重試");
    await page.getByRole("dialog").getByRole("button", { name: "新增行程" }).click();
    await page.getByText("測試儲存失敗").first().waitFor();
    assert.equal(await page.locator(".timelineDetail").filter({ hasText: "失敗重試" }).count(), 0, "failed save rolled back");
    await page.getByRole("button", { name: "重試", exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll(".timelineDetail")].some((item) => item.textContent.includes("失敗重試")));
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
      document.querySelector(".app-main").style.backgroundImage = "linear-gradient(45deg, #14233b, #334c76)";
    });
    const darkBackground = await page.locator(".dashboard-card").evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.equal(darkBackground, "rgba(0, 0, 0, 0)", "dark custom background remains visible behind calendar panels");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ output, results, crud: "POST/PATCH/DELETE optimistic flow and failed-save retry passed" }, null, 2));
  } finally { await browser.close(); server.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
