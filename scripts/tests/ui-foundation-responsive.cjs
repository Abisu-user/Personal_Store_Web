/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");

const chromePaths = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executable = chromePaths.find(existsSync);
const port = 9337;
const origin = "http://127.0.0.1:3010";
const viewports = [
  { width: 1440, height: 900, mobile: false },
  { width: 1024, height: 768, mobile: false },
  { width: 430, height: 932, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 375, height: 812, mobile: true },
];

if (!executable) throw new Error("Chrome or Edge is required for the responsive UI check.");

const browser = spawn(executable, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  "--user-data-dir=" + process.env.TEMP + "\\personal-store-ui-foundation-cdp",
  "about:blank",
], { stdio: "ignore" });

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function retry(callback, attempts = 50) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await callback();
    } catch (error) {
      lastError = error;
      await wait(100);
    }
  }
  throw lastError;
}

async function newTarget(url) {
  return retry(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
    if (!response.ok) throw new Error(`Unable to open Chrome target: ${response.status}`);
    return response.json();
  });
}

function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let sequence = 0;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("error", reject, { once: true });
    socket.addEventListener("open", () => {
      resolve({
        close: () => socket.close(),
        send(method, params = {}) {
          sequence += 1;
          return new Promise((requestResolve, requestReject) => {
            pending.set(sequence, { resolve: requestResolve, reject: requestReject });
            socket.send(JSON.stringify({ id: sequence, method, params }));
          });
        },
      });
    }, { once: true });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const fixture = `
  <main class="app-main">
    <div class="dashboard">
      <section class="dashboard-card">
        <header class="page-heading">
          <div><p class="eyebrow">FOUNDATION</p><h1>介面基礎測試</h1><p>驗證共用間距與控制項。</p></div>
          <button class="button page-create-button" type="button"><span>新增資料</span></button>
        </header>
        <div class="bookmarks-workspace">
          <article class="library-card">
            <div><strong>自然高度卡片</strong><p>內容只佔兩行，不應被固定高度撐開。</p></div><small>剛剛更新</small>
          </article>
          <div class="dialog-actions">
            <button class="secondary-button" type="button"><span>取消</span></button>
            <button class="button" type="button"><span>儲存</span></button>
            <button class="delete-button compact" type="button"><span>刪除</span></button>
          </div>
          <section class="mobile-section">
            <header><h2>手機區塊</h2><button class="mobile-icon-button" aria-label="更多" type="button">•••</button></header>
            <div class="mobile-surface">手機內容</div>
          </section>
        </div>
      </section>
    </div>
  </main>
  <div class="modal-dialog-backdrop">
    <section class="modal-dialog">
      <header class="modal-dialog-header"><div><p class="eyebrow">DIALOG</p><h2>整理資料</h2></div><button class="modal-dialog-close" aria-label="關閉" type="button">×</button></header>
      <div class="modal-dialog-content"><p>簡單操作不應產生超大型視窗或大片空白。</p><div class="dialog-actions"><button class="secondary-button" type="button">取消</button><button class="button" type="button">完成</button></div></div>
    </section>
  </div>`;

async function measure(client, viewport) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await client.send("Page.navigate", { url: origin + "/login" });
  await retry(async () => {
    const state = await client.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
    if (state.result.value !== "complete") throw new Error("Page is still loading");
  });
  await client.send("Runtime.evaluate", {
    expression: `document.body.innerHTML = ${JSON.stringify(fixture)}; document.documentElement.dataset.theme = "light"`,
    returnByValue: true,
  });
  await client.send("Runtime.evaluate", {
    expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    awaitPromise: true,
  });
  const result = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const rect = (selector) => {
        const value = document.querySelector(selector)?.getBoundingClientRect();
        return value ? { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom } : null;
      };
      const style = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const value = getComputedStyle(element);
        return { alignItems: value.alignItems, justifyContent: value.justifyContent, display: value.display, gap: value.gap, padding: value.padding };
      };
      const button = document.querySelector(".page-create-button");
      const buttonText = button.querySelector("span");
      const buttonRect = button.getBoundingClientRect();
      const textRect = buttonText.getBoundingClientRect();
      return {
        innerWidth,
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        dashboard: rect(".dashboard"),
        card: rect(".library-card"),
        modal: rect(".modal-dialog"),
        close: rect(".modal-dialog-close"),
        mobileIcon: rect(".mobile-icon-button"),
        button: rect(".page-create-button"),
        buttonStyle: style(".page-create-button"),
        workspaceStyle: style(".bookmarks-workspace"),
        mobileSectionStyle: style(".mobile-section"),
        buttonCenterDelta: Math.abs((buttonRect.x + buttonRect.width / 2) - (textRect.x + textRect.width / 2)),
      };
    })()`,
    returnByValue: true,
  });
  return result.result.value;
}

(async () => {
  const target = await newTarget(origin + "/login");
  const client = await connect(target.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  const report = [];
  for (const viewport of viewports) {
    const metrics = await measure(client, viewport);
    assert(metrics.scrollWidth <= metrics.innerWidth + 1, `${viewport.width}px has horizontal overflow (${metrics.scrollWidth}px)`);
    assert(metrics.dashboard && metrics.dashboard.x >= -1 && metrics.dashboard.right <= viewport.width + 1, `${viewport.width}px dashboard escapes viewport`);
    assert(metrics.modal && metrics.modal.x >= -1 && metrics.modal.right <= viewport.width + 1, `${viewport.width}px modal escapes viewport`);
    assert(metrics.modal.height < viewport.height, `${viewport.width}px simple modal occupies the full viewport`);
    assert(metrics.button.height >= 44, `${viewport.width}px primary touch target is below 44px`);
    assert(metrics.buttonStyle.display === "flex" || metrics.buttonStyle.display === "inline-flex", `${viewport.width}px button is not flex aligned`);
    assert(metrics.buttonStyle.alignItems === "center" && metrics.buttonStyle.justifyContent === "center", `${viewport.width}px button content is not centered`);
    assert(metrics.buttonCenterDelta <= 1.5, `${viewport.width}px button label is visually off-center`);
    assert(metrics.close && Math.abs(metrics.close.width - metrics.close.height) <= 1, `${viewport.width}px icon close button is not square`);
    assert(metrics.card.height < 180, `${viewport.width}px two-line card is unnecessarily tall`);

    if (viewport.mobile) {
      assert(metrics.mobileSectionStyle.display === "grid", `${viewport.width}px mobile section is not available`);
      assert(metrics.mobileIcon.width >= 44 && metrics.mobileIcon.height >= 44, `${viewport.width}px mobile icon target is below 44px`);
      assert(metrics.workspaceStyle.gap === "12px", `${viewport.width}px mobile workspace gap is not on the spacing scale`);
    } else {
      assert(metrics.modal.width <= 721, `${viewport.width}px default modal exceeds the 720px content width`);
      assert(metrics.mobileSectionStyle.display === "none", `${viewport.width}px mobile-only section leaked into desktop`);
      assert(metrics.workspaceStyle.gap === "16px", `${viewport.width}px desktop workspace gap is not on the spacing scale`);
    }

    report.push({
      viewport: `${viewport.width}x${viewport.height}`,
      horizontalOverflow: false,
      dashboardWidth: Math.round(metrics.dashboard.width),
      modal: `${Math.round(metrics.modal.width)}x${Math.round(metrics.modal.height)}`,
      primaryButtonHeight: Math.round(metrics.button.height),
      cardHeight: Math.round(metrics.card.height),
    });
  }

  console.log(JSON.stringify(report, null, 2));
  client.close();
})().finally(() => {
  browser.kill();
});
