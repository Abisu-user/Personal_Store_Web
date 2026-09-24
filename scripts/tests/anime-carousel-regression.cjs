/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;

const root = path.resolve(__dirname, "../..");
const out = fs.mkdtempSync(path.join(os.tmpdir(), "anime-carousel-"));

async function compile() {
  await new Promise((resolve, reject) => webpack({
    mode: "development",
    devtool: false,
    entry: path.join(__dirname, "anime-carousel-fixture.tsx"),
    output: { path: out, filename: "fixture.js" },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      alias: { "@": path.join(root, "src") },
      modules: [path.join(root, "node_modules"), "node_modules"],
    },
    module: {
      rules: [{
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: path.join(__dirname, "ts-loader.cjs"),
      }],
    },
  }, (error, stats) => {
    if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ all: false, errors: true })));
    else resolve();
  }));
}

function createServer() {
  const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
  return http.createServer((request, response) => {
    if (request.url === "/fixture.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(fs.readFileSync(path.join(out, "fixture.js")));
      return;
    }
    if (request.url === "/style.css") {
      response.setHeader("Content-Type", "text/css");
      response.end(css);
      return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end('<!doctype html><html lang="zh-Hant"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
}

async function mobileSwipe(page) {
  const box = await page.getByRole("region", { name: "動漫測試輪播" }).boundingBox();
  assert.ok(box, "carousel must have a box");
  const session = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2;
  const startX = box.x + Math.min(box.width - 24, 330);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
  for (let step = 1; step <= 8; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: startX - step * 28, y }],
    });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(180);
}

async function main() {
  await compile();
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || "chrome" });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const report = [];
  try {
    for (const width of [390, 430]) {
      const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width, height: 900 } });
      const page = await context.newPage();
      await page.goto(origin);
      const rail = page.getByRole("region", { name: "動漫測試輪播" });
      await rail.waitFor();
      const overflow = await rail.evaluate((node) => node.scrollWidth - node.clientWidth);
      assert.ok(overflow > 200, `${width}px carousel must have real overflow`);
      await mobileSwipe(page);
      const after = await rail.evaluate((node) => node.scrollLeft);
      assert.ok(after > 20, `${width}px touch swipe must move cards`);
      report.push({ width, input: "touch", overflow, moved: Math.round(after) });
      await context.close();
    }

    for (const width of [1440, 1920]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(origin);
      const rail = page.getByRole("region", { name: "動漫測試輪播" });
      const box = await rail.boundingBox();
      assert.ok(box, "desktop carousel must have a box");
      const overflow = await rail.evaluate((node) => node.scrollWidth - node.clientWidth);
      assert.ok(overflow > 200, `${width}px carousel must have real overflow`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 280);
      await page.waitForTimeout(50);
      const wheelMoved = await rail.evaluate((node) => node.scrollLeft);
      assert.ok(wheelMoved > 20, `${width}px mouse wheel must move cards`);

      await rail.evaluate((node) => { node.scrollLeft = 0; });
      await page.mouse.move(box.x + Math.min(500, box.width - 40), box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      const dragMoved = await rail.evaluate((node) => node.scrollLeft);
      const clicks = Number(await page.getByTestId("clicks").textContent());
      assert.ok(dragMoved > 20, `${width}px mouse drag must move cards`);
      assert.equal(clicks, 0, `${width}px drag must not activate a card`);
      report.push({ width, input: "wheel+drag", overflow, wheelMoved: Math.round(wheelMoved), dragMoved: Math.round(dragMoved), accidentalClicks: clicks });
      await page.close();
    }
    console.log(JSON.stringify({ output: out, report }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(out, error);
  process.exitCode = 1;
});
