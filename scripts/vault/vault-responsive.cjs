/* eslint-disable @typescript-eslint/no-require-imports */
/* Static layout fixture using the production CSS; authenticated data-flow needs a signed-in browser. */
const { spawn } = require("node:child_process");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");

const chrome = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
if (!chrome) throw new Error("Chrome or Edge is required");
const css = readdirSync(".next/static/chunks").filter((name) => name.endsWith(".css"))
  .map((name) => readFileSync(path.join(".next/static/chunks", name), "utf8")).join("\n");
if (!css) throw new Error("Build first; vault production CSS was not found");
const cls = (name) => {
  const match = css.match(new RegExp(`\\.([\\w-]*__${name})\\b`));
  if (!match) throw new Error(`Vault CSS class ${name} missing`);
  return match[1];
};
const html = `<main class="app-main"><section class="vault-workspace ${cls("vaultScope")}">
  <section class="vault-status-panel"><div class="vault-status-icon">⌑</div><div><strong>保管庫已解鎖</strong><p>敏感資料目前可使用</p></div><button class="secondary-button compact">立即鎖定</button></section>
  <div class="vault-section-heading"><div><h2>保管項目</h2></div><button class="button vault-add-button">＋ 新增</button></div>
  <div class="vault-toolbar"><input placeholder="搜尋名稱、一般欄位或備註…"><span>1 筆</span><button class="secondary-button compact">整理</button></div>
  <div class="${cls("contentLayout")}"><aside class="${cls("sidebar")}"><div class="${cls("sidebarTitle")}"><strong>分類</strong><button>管理</button></div><div class="${cls("sidebarItems")}"><button>全部</button><button>未分類</button><button>網站</button></div></aside>
  <section class="vault-categories ${cls("mobileCategories")}"><div class="vault-category-heading"><strong>分類</strong><button class="secondary-button compact">管理</button></div><div class="vault-category-row"><div class="vault-filter-chips"><button>全部</button><button>未分類</button><button>網站</button></div></div></section>
  <div class="${cls("records")}"><div class="vault-grid"><article class="vault-item"><header><span class="vault-kind-badge">網站</span><button class="vault-menu-trigger">⋯</button></header><div class="vault-item-content"><h3>測試項目</h3><div class="${cls("itemFields")}"><div class="${cls("itemField")}"><span class="${cls("itemFieldLabel")}">登入 Email</span><span class="${cls("itemFieldValue")}">test@example.com</span><span class="${cls("itemFieldActions")}"><button>複製</button></span></div><div class="${cls("itemField")}"><span class="${cls("itemFieldLabel")}">密碼</span><span class="${cls("itemFieldValue")}">••••••••</span><span class="${cls("itemFieldActions")}"><button>顯示</button><button>複製</button></span></div></div></div></article></div></div></div>
<div class="modal-dialog-backdrop"><section class="modal-dialog create-item-dialog vault-item-dialog"><header class="modal-dialog-header"><div><p class="eyebrow">CREATE PRIVATE ITEM</p><h2>新增保管項目</h2></div><button class="modal-dialog-close">×</button></header><div class="modal-dialog-content"><form class="vault-item-form ${cls("editor")}"><div class="${cls("editorColumns")}"><div class="${cls("editorBasics")}"><label>項目名稱<input placeholder="名稱"></label><div class="taxonomy-section-card">類別（可複選）</div><label>備註<textarea></textarea></label></div><section class="${cls("editorFields")}"><strong>登入資料</strong><article class="${cls("fieldEditorCard")}"><label>欄位名稱<input value="登入 Email"></label><label>欄位內容<input value="example@email.com"></label><div class="${cls("fieldType")}"><button class="${cls("active")}">一般文字</button><button>密碼／敏感</button></div></article><article class="${cls("fieldEditorCard")}"><label>欄位名稱<input value="密碼"></label><label>欄位內容<input type="password" value="password"></label><div class="${cls("fieldType")}"><button>一般文字</button><button class="${cls("active")}">密碼／敏感</button></div></article><button class="${cls("addField")}">＋ 新增自訂欄位</button></section></div></form></div><div class="create-item-footer"><div class="create-form-actions"><button class="secondary-button">取消</button><button class="button">儲存保管項目</button></div></div></section></div></section></main>`;

const browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9341", `--user-data-dir=${process.env.TEMP}\\personal-store-vault-layout-cdp`, "about:blank"], { stdio: "ignore" });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function retry(fn) { for (let i = 0; i < 50; i++) { try { return await fn(); } catch { await wait(100); } } throw new Error("Chrome CDP unavailable"); }
async function connect(url) {
  const socket = new WebSocket(url); let id = 0; const pending = new Map();
  socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); const promise = pending.get(message.id); if (!promise) return; pending.delete(message.id); if (message.error) promise.reject(new Error(message.error.message)); else promise.resolve(message.result); });
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  return { close: () => socket.close(), send(method, params = {}) { return new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); } };
}

(async () => {
  const target = await retry(async () => { const response = await fetch("http://127.0.0.1:9341/json/new?about:blank", { method: "PUT" }); if (!response.ok) throw new Error(); return response.json(); });
  const client = await connect(target.webSocketDebuggerUrl);
  await client.send("Page.enable"); await client.send("Runtime.enable");
  const report = [];
  for (const width of [375, 390, 430, 1024, 1440]) {
    const height = width <= 430 ? 844 : 900;
    await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 430 });
    await client.send("Runtime.evaluate", { expression: `document.head.innerHTML = '<meta name="viewport" content="width=device-width,initial-scale=1">'; document.body.innerHTML = ${JSON.stringify(html)}; const sheet = document.createElement('style'); sheet.textContent = ${JSON.stringify(css)}; document.head.append(sheet); document.documentElement.dataset.theme = 'light';` });
    await client.send("Runtime.evaluate", { expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))", awaitPromise: true });
    await wait(260);
    const { result } = await client.send("Runtime.evaluate", { expression: `(() => { const rect = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; }; return { width: innerWidth, scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth), modal: rect('.vault-item-dialog'), footer: rect('.vault-item-dialog .create-item-footer'), item: rect('.vault-item'), sidebarDisplay: getComputedStyle(document.querySelector('.${cls("sidebar")}')).display, mobileCategoryDisplay: getComputedStyle(document.querySelector('.${cls("mobileCategories")}')).display }; })()`, returnByValue: true });
    const value = result.value;
    if (value.scrollWidth > value.width + 1) throw new Error(`${width}px horizontal overflow: ${value.scrollWidth}px`);
    if (value.modal.left < -1 || value.modal.right > width + 1 || value.modal.bottom > height + 1) throw new Error(`${width}px modal escapes viewport`);
    if (value.footer.bottom > height + 1) throw new Error(`${width}px sticky footer hidden`);
    if (width <= 430 && (value.sidebarDisplay !== "none" || value.mobileCategoryDisplay === "none")) throw new Error(`${width}px mobile navigation mismatch`);
    if (width >= 1024 && (value.sidebarDisplay === "none" || value.mobileCategoryDisplay !== "none")) throw new Error(`${width}px desktop navigation mismatch`);
    if (width === 390) {
      await client.send("Runtime.evaluate", { expression: "document.documentElement.style.setProperty('--mobile-modal-viewport-height', '520px')" });
      await wait(40);
      const keyboard = await client.send("Runtime.evaluate", { expression: "({ modalBottom: document.querySelector('.vault-item-dialog').getBoundingClientRect().bottom, footerBottom: document.querySelector('.vault-item-dialog .create-item-footer').getBoundingClientRect().bottom })", returnByValue: true });
      if (keyboard.result.value.modalBottom > 521 || keyboard.result.value.footerBottom > 521) throw new Error("390px simulated keyboard hides the vault save footer");
      await client.send("Runtime.evaluate", { expression: "document.documentElement.style.removeProperty('--mobile-modal-viewport-height')" });
    }
    report.push({ width, overflow: false, modal: `${Math.round(value.modal.width)}x${Math.round(value.modal.height)}`, cardHeight: Math.round(value.item.height), footerVisible: true });
  }
  console.log(JSON.stringify(report, null, 2)); client.close();
})().finally(() => browser.kill());
