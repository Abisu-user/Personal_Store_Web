/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { mkdtempSync, readdirSync, readFileSync, rmSync, accessSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve, basename, sep } = require("node:path");

const chunks = join(__dirname, "../../.next/static/chunks");
const cssFiles = readdirSync(chunks).filter((file) => file.endsWith(".css"));
const css = cssFiles.map((file) => readFileSync(join(chunks, file), "utf8")).join("\n");
function cls(module, name) {
  const match = css.match(new RegExp(`\\.([\\w-]*${module}[\\w-]*__${name})(?=[\\s:{.>])`));
  if (!match) throw new Error(`Missing compiled CSS class ${module}/${name}`);
  return match[1];
}
const desktop = (name) => cls("desktop-dashboard-module", name);
const mobile = (name) => cls("dashboard-mobile-module", name);
const today = (name) => cls("today-schedule-module", name);
const title = "很長很長的私人行程名稱，用來確認窄版 Hero 和手機首頁可以正確省略且不產生水平捲軸";
const rows = `<div class="${today("list")}">${["全天", "09:00", "14:00"].map((time) => `<a class="${today("row")}" href="/calendar?date=2026-10-01"><span class="${today("dot")}" style="--event-color:#C86A6C"></span><span class="${today("time")}">${time}</span><span class="${today("title")}">${title}</span></a>`).join("")}<a class="${today("more")}" href="/calendar?date=2026-10-01">＋2 個行程 · 查看全部</a></div>`;
const desktopHero = (withSchedule) => `<section data-hero="${withSchedule ? "yes" : "no"}" class="${desktop("hero")} ${withSchedule ? desktop("heroWithSchedule") : ""}"><div class="${desktop("heroCopy")}"><p class="${desktop("eyebrow")}">YOUR PERSONAL SPACE</p><h1>下午好，Abisu</h1><p>你的資料都在這裡。</p><div class="${desktop("heroActions")}"><button class="${desktop("primaryButton")}">快速新增</button><button class="${desktop("secondaryButton")}">搜尋全部</button></div></div><div class="${desktop("today")}"><span class="${desktop("todayCaption")}">今日概覽</span><strong>今天</strong><div><span>安全狀態</span><b>App Lock 已啟用</b></div><div><span>最近開啟</span><b>2 筆</b></div><div><span>儲存空間</span><b>15.6 MB / 800 MB</b></div></div>${withSchedule ? `<section class="${desktop("schedule")}"><a class="${desktop("scheduleHeading")}" href="/calendar?date=2026-10-01">今日行程</a>${rows}</section>` : ""}</section>`;
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${cssFiles.map((file) => `<link rel="stylesheet" href="/${file}">`).join("")}<style>body{margin:0}.desktop-fixture{width:calc(100% - 64px);margin:auto}.mobile-fixture{padding:8px 16px}</style></head><body><div class="desktop-fixture ${desktop("desktopDashboard")}">${desktopHero(true)}${desktopHero(false)}</div><div class="mobile-fixture ${mobile("mobileDashboard")}"><header class="${mobile("personalHeader")}">PERSONAL DASHBOARD</header><section class="mobile-section"><header><h2>今日行程</h2><a href="/calendar?date=2026-10-01">全部</a></header><div class="${mobile("scheduleCard")} mobile-surface">${rows}</div></section><section class="mobile-section"><header><h2>資料概覽</h2></header><div class="${mobile("overviewGrid")}">${[1, 2, 3].map(() => `<div class="${mobile("overviewCard")} mobile-surface">網站收藏</div>`).join("")}</div></section></div></body></html>`;

const executable = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
  .find((file) => { try { accessSync(file); return true; } catch { return false; } });
if (!executable) throw new Error("Chrome or Edge is required");
const profile = mkdtempSync(join(tmpdir(), "dashboard-today-layout-"));
const debuggerPort = 9351;
const server = createServer((request, response) => {
  const file = cssFiles.find((candidate) => request.url === `/${candidate}`);
  response.setHeader("Content-Type", file ? "text/css; charset=utf-8" : "text/html; charset=utf-8");
  response.end(file ? readFileSync(join(chunks, file)) : html);
});
const browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${debuggerPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function retry(fn) {
  let last;
  for (let index = 0; index < 60; index += 1) { try { return await fn(); } catch (error) { last = error; await pause(100); } }
  throw last;
}
async function main() {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const target = await retry(async () => {
    const response = await fetch(`http://127.0.0.1:${debuggerPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/`)}`, { method: "PUT" });
    return response.json();
  });
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => { const result = JSON.parse(data); if (result.id && pending.has(result.id)) { pending.get(result.id)(result); pending.delete(result.id); } });
  const send = (method, params = {}) => new Promise((done) => { const id = ++nextId; pending.set(id, done); socket.send(JSON.stringify({ id, method, params })); });
  await retry(async () => {
    const result = await send("Runtime.evaluate", { expression: `document.readyState === 'complete' && document.styleSheets.length === ${cssFiles.length + 1}`, returnByValue: true });
    if (!result.result.result.value) throw new Error("CSS not loaded");
  });
  for (const width of [375, 390, 402, 430, 700, 1024, 1280, 1440, 1920]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: width <= 700 });
    await pause(120);
    const result = await send("Runtime.evaluate", { expression: `(() => {
      const desktop = document.querySelector('.${desktop("desktopDashboard")}');
      const mobile = document.querySelector('.${mobile("mobileDashboard")}');
      const hero = document.querySelector('[data-hero="yes"]');
      const plain = document.querySelector('[data-hero="no"]');
      const visible = innerWidth <= 700 ? mobile : desktop;
      const section = innerWidth <= 700 ? mobile.querySelector('.mobile-section') : hero;
      const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; };
      return { overflow: document.documentElement.scrollWidth - innerWidth,
        display: getComputedStyle(visible).display, heroColumns: getComputedStyle(hero).gridTemplateColumns.split(' ').length,
        plainColumns: getComputedStyle(plain).gridTemplateColumns.split(' ').length,
        parent: rect(section), schedule: rect(innerWidth <= 700 ? mobile.querySelector('.${mobile("scheduleCard")}') : hero.querySelector('.${desktop("schedule")}')),
        rows: [...visible.querySelectorAll('.${today("row")}')].slice(0, 3).map(rect),
        titleClipped: [...visible.querySelectorAll('.${today("title")}')].some(node => node.scrollWidth > node.clientWidth && getComputedStyle(node).textOverflow === 'ellipsis'),
        dotColor: getComputedStyle(visible.querySelector('.${today("dot")}')).backgroundColor,
        mobileSections: [...mobile.querySelectorAll('.mobile-section > header h2')].map(node => node.textContent) };
    })()`, returnByValue: true });
    const value = result.result.result.value;
    console.log(`${width}px`, JSON.stringify(value));
    if (value.overflow > 1 || value.display === "none" || value.schedule.right > width + 1 || value.schedule.left < -1
      || (width <= 430 && !value.titleClipped) || value.dotColor !== "rgb(200, 106, 108)" || value.mobileSections.join(",") !== "今日行程,資料概覽"
      || (width > 1200 && value.heroColumns !== 3) || (width > 900 && value.plainColumns !== 2)
      || value.rows.some((row) => row.right > value.schedule.right + 1)) throw new Error(`${width}px dashboard schedule layout failed`);
  }
  socket.close();
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  browser.kill(); await new Promise((done) => server.close(done));
  const target = resolve(profile);
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith("dashboard-today-layout-")) {
    console.warn("Temporary browser profile path did not pass the safety check.");
    return;
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { rmSync(target, { recursive: true, force: true }); break; }
    catch (error) { if (attempt === 19) console.warn("Temporary browser profile could not be removed:", error.message); else await pause(150); }
  }
});
