/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

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
<div class="anime-library-layout anime-standard-library-layout"><aside class="anime-desktop-filter-rail"><section class="anime-filter-rail-group"><h2>觀看狀態</h2><button class="active"><span>全部</span><small>8</small></button><button><span>正在觀看</span><small>2</small></button></section><section class="anime-filter-rail-group"><h2>類別</h2>${Array.from({ length: 24 }, (_, index) => `<button>類別 ${index + 1}</button>`).join("")}</section></aside>
<div class="anime-library-main"><section class="anime-folder-navigation" data-anime-scope="standard"><header>資料夾</header><div class="responsive-chip-overflow scrollable-desktop"><div class="responsive-chip-overflow-row"><button>全部</button><button>本季收藏</button><button>其他資料夾</button></div></div></section><div class="anime-filter-bar"><div class="anime-filter-scroll"><button>全部</button><button class="anime-mobile-filter">篩選</button></div></div><div class="anime-bulk-toolbar"><button>選取</button><div class="anime-bulk-toolbar-search"><div class="anime-search-box anime-library-search-box"><span class="app-icon">⌕</span><input placeholder="搜尋收藏" /></div></div></div><div class="anime-grid">
${Array.from({ length: 8 }, (_, index) => `<article class="anime-card"><div class="anime-card-main"><div class="anime-cover"></div><div class="anime-card-copy"><h3>測試動漫標題 ${index + 1}</h3><p>類別與觀看狀態</p></div></div></article>`).join("")}
</div></div></div></div></section></div></main>`;
const discoveryFixture = `<main class="app-main"><div class="dashboard anime-dashboard"><section class="dashboard-card"><div class="anime-workspace"><section class="anime-discovery">
<div class="anime-discovery-tabs anime-discovery-view-tabs"><button class="active">探索</button><button>時間表</button></div>
<div class="anime-discovery-layout"><aside class="anime-desktop-filter-rail anime-discovery-filter-rail"><h3>季度</h3><div class="anime-discovery-rail-options"><button>目前季度</button></div><h3>狀態</h3><div class="anime-discovery-rail-options"><button>全部</button></div></aside>
<div class="anime-discovery-results"><div class="anime-all-heading"><h2>探索動漫</h2><button class="anime-discovery-mobile-filter">篩選</button></div><form class="anime-search-box anime-catalogue-search"><input placeholder="搜尋動漫名稱" /><button>搜尋</button></form><div class="anime-discovery-grid">
${Array.from({ length: 8 }, (_, index) => `<article class="anime-catalogue-card"><div class="anime-catalogue-main"><div class="anime-catalogue-cover-fallback"></div><div><h3>測試動漫 ${index + 1}</h3></div></div></article>`).join("")}
</div></div></div></section></div></section></div></main>`;
const homeFixture = '<main class="home"><section class="section"><header><h2>最近更新</h2></header><div class="rail">'
  + Array.from({ length: 12 }, (_, index) => '<article class="card"><div class="cover"></div><div class="copy"><h3>動漫 ' + (index + 1) + '</h3></div></article>').join("")
  + '</div></section></main>';
const homeCss = readFileSync(join(__dirname, "../../src/components/anime/anime-home.module.css"), "utf8");

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
        const rail = document.querySelector('.anime-desktop-filter-rail');
        const search = document.querySelector('.anime-library-search-box');
        return { innerWidth, scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), railDisplay: getComputedStyle(rail).display, railOverflow: rail.scrollHeight - rail.clientHeight, railHeight: rail.clientHeight, searchWidth: search.getBoundingClientRect().width, searchHeight: search.getBoundingClientRect().height, layout: box('.anime-library-layout'), main: box('.anime-library-main'), gridColumns: getComputedStyle(document.querySelector('.anime-grid')).gridTemplateColumns.split(' ').length };
      })()`,
      returnByValue: true,
    });
    const metrics = response.result.value;
    if (metrics.scrollWidth > width + 1 || metrics.layout.left < -1 || metrics.layout.right > width + 1 || metrics.main.width < 0) throw new Error(`${width}px overflow: ${JSON.stringify(metrics)}`);
    if (width >= 821 && metrics.railDisplay !== "grid") throw new Error(`${width}px desktop rail missing`);
    if (width >= 821 && metrics.railOverflow < 100) throw new Error(`${width}px rail cannot scroll independently: ${JSON.stringify(metrics)}`);
    if (width >= 701 && (metrics.searchWidth < 170 || metrics.searchHeight < 44)) throw new Error(`${width}px desktop search is too small: ${JSON.stringify(metrics)}`);
    if (width >= 701 && width <= 820 && metrics.railDisplay !== "none") throw new Error(`${width}px compact filter should replace rail`);
    if (width >= 701 && width <= 820 && metrics.gridColumns < 2) throw new Error(`${width}px grid is too narrow`);
    if (width <= 700 && metrics.railDisplay !== "none") throw new Error(`${width}px desktop rail visible on mobile`);
    if (width === 1440) {
      const railBox = await client.send("Runtime.evaluate", {
        expression: "(() => { const box = document.querySelector('.anime-desktop-filter-rail').getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 160) }; })()",
        returnByValue: true,
      });
      await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: railBox.result.value.x, y: railBox.result.value.y, deltaX: 0, deltaY: 240, pointerType: "mouse" });
      await wait(100);
      const afterWheel = await client.send("Runtime.evaluate", { expression: "document.querySelector('.anime-desktop-filter-rail').scrollTop", returnByValue: true });
      if (afterWheel.result.value < 20) throw new Error("Desktop filter rail did not respond to mouse wheel");
    }
    result.push({ width, rail: metrics.railDisplay, columns: metrics.gridColumns, overflow: false });
  }
  for (const width of [1440, 1024, 821, 820, 768, 701, 700, 430, 390]) {
    await client.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width <= 700 });
    await client.send("Runtime.evaluate", { expression: `document.body.innerHTML = ${JSON.stringify(discoveryFixture)}`, returnByValue: true });
    await client.send("Runtime.evaluate", { expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))", awaitPromise: true });
    const response = await client.send("Runtime.evaluate", {
      expression: `(() => ({
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        rail: getComputedStyle(document.querySelector('.anime-discovery-filter-rail')).display,
        columns: getComputedStyle(document.querySelector('.anime-discovery-grid')).gridTemplateColumns.split(' ').length
      }))()`,
      returnByValue: true,
    });
    const metrics = response.result.value;
    if (metrics.scrollWidth > width + 1) throw new Error(`${width}px discovery overflow: ${JSON.stringify(metrics)}`);
    if (width >= 821 && metrics.rail !== "grid") throw new Error(`${width}px discovery rail missing`);
    if (width <= 820 && metrics.rail !== "none") throw new Error(`${width}px discovery rail should collapse`);
    result.push({ width, discoveryRail: metrics.rail, discoveryColumns: metrics.columns, overflow: false });
  }
  for (const width of [1920, 1440, 1280, 820, 701]) {
    await client.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.send("Runtime.evaluate", { expression: "document.body.innerHTML = " + JSON.stringify(homeFixture) + "; document.head.querySelector('#anime-home-style')?.remove(); const style = document.createElement('style'); style.id = 'anime-home-style'; style.textContent = " + JSON.stringify(homeCss) + "; document.head.append(style)", returnByValue: true });
    await client.send("Runtime.evaluate", { expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))", awaitPromise: true });
    const response = await client.send("Runtime.evaluate", {
      expression: "(() => { const rail = document.querySelector('.rail'); return { overflow: rail.scrollWidth - rail.clientWidth, display: getComputedStyle(rail).display, visibleCards: [...rail.children].filter((item) => getComputedStyle(item).display !== 'none').length, pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }; })()",
      returnByValue: true,
    });
    const metrics = response.result.value;
    if (metrics.display !== "flex" || metrics.overflow < 200 || metrics.visibleCards !== 12 || metrics.pageWidth > width + 1) throw new Error(width + "px Home rail regression: " + JSON.stringify(metrics));
    result.push({ width, homeRail: metrics });
  }
  console.log(JSON.stringify(result, null, 2));
  client.close();
})().finally(() => browser.kill());
