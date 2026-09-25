/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");

const browserPath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
if (!browserPath) throw new Error("Chrome or Edge is required.");

const port = 9342;
const origin = "http://127.0.0.1:3010";
const browser = spawn(browserPath, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${process.env.TEMP}\\personal-store-anime-layout-cdp`,
  "about:blank",
], { stdio: "ignore" });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function retry(fn) {
  let last;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { return await fn(); } catch (error) { last = error; await wait(100); }
  }
  throw last;
}
async function target(url) {
  return retry(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
    if (!response.ok) throw new Error(`CDP target: ${response.status}`);
    return response.json();
  });
}
function connect(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener("error", reject, { once: true });
    socket.addEventListener("open", () => resolve({
      close: () => socket.close(),
      send(method, params = {}) {
        id += 1;
        return new Promise((done, fail) => {
          pending.set(id, { resolve: done, reject: fail });
          socket.send(JSON.stringify({ id, method, params }));
        });
      },
    }), { once: true });
  });
}

const fixture = `<main class="app-main"><div class="dashboard anime-dashboard"><section class="dashboard-card"><div class="anime-workspace">
<header class="anime-toolbar anime-shared-header"><div class="anime-header-title"><p class="eyebrow">ANIME LIBRARY</p><h1>動漫收藏</h1><p>收藏、整理與探索自己的動漫資料庫。</p></div>
<div class="anime-tabs bookmark-view-tabs"><button>首頁</button><button class="active">我的收藏</button><button>探索</button><button>統計</button><button>成人內容</button></div>
<div class="anime-toolbar-actions"><button class="button compact page-create-button anime-create-button">＋ 新增動漫</button></div></header>
<div class="anime-library-layout"><aside class="anime-desktop-filter-rail"><section class="anime-filter-rail-group"><h2>觀看狀態</h2><button class="active"><span>全部</span><small>8</small></button><button><span>正在觀看</span><small>2</small></button></section><section class="anime-filter-rail-group"><h2>資料夾</h2><button><span>本季收藏</span></button></section></aside>
<div class="anime-library-main"><div class="anime-filter-bar"><div class="anime-filter-scroll"><button>全部</button></div><input placeholder="搜尋收藏" /></div><div class="anime-grid">
${Array.from({ length: 8 }, (_, index) => `<article class="anime-card"><div class="anime-card-main"><div class="anime-cover"></div><div class="anime-card-copy"><h3>測試動漫標題 ${index + 1}</h3><p>類別與觀看狀態</p></div></div></article>`).join("")}
</div></div></div></div></section></div></main>`;

(async () => {
  const tab = await target(origin + "/login");
  const client = await connect(tab.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  const result = [];
  for (const width of [1920, 1600, 1440, 1366, 1280, 1024, 821, 820, 768, 701, 700, 430, 390]) {
    await client.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width <= 700 });
    await client.send("Page.navigate", { url: origin + "/login" });
    await retry(async () => {
      const response = await client.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
      if (response.result.value !== "complete") throw new Error("Page loading");
    });
    await client.send("Runtime.evaluate", { expression: `document.body.innerHTML = ${JSON.stringify(fixture)}`, returnByValue: true });
    await client.send("Runtime.evaluate", { expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))", awaitPromise: true });
    const response = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const box = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; };
        return { innerWidth, scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), railDisplay: getComputedStyle(document.querySelector('.anime-desktop-filter-rail')).display, layout: box('.anime-library-layout'), main: box('.anime-library-main'), gridColumns: getComputedStyle(document.querySelector('.anime-grid')).gridTemplateColumns.split(' ').length };
      })()`,
      returnByValue: true,
    });
    const metrics = response.result.value;
    if (metrics.scrollWidth > width + 1 || metrics.layout.left < -1 || metrics.layout.right > width + 1 || metrics.main.width < 0) throw new Error(`${width}px overflow: ${JSON.stringify(metrics)}`);
    if (width >= 701 && metrics.railDisplay !== "grid") throw new Error(`${width}px desktop rail missing`);
    if (width <= 700 && metrics.railDisplay !== "none") throw new Error(`${width}px desktop rail visible on mobile`);
    result.push({ width, rail: metrics.railDisplay, columns: metrics.gridColumns, overflow: false });
  }
  console.log(JSON.stringify(result, null, 2));
  client.close();
})().finally(() => browser.kill());
