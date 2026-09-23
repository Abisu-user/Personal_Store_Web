/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("node:child_process");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const executable = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
const port = 9348;
const viewports = [
  { width: 375, height: 812, mode: "mobile" },
  { width: 390, height: 844, mode: "mobile" },
  { width: 393, height: 852, mode: "mobile" },
  { width: 430, height: 932, mode: "mobile" },
  { width: 768, height: 1024, mode: "tablet" },
  { width: 820, height: 1180, mode: "tablet" },
  { width: 1024, height: 768, mode: "tablet" },
  { width: 1280, height: 800, mode: "desktop" },
  { width: 1440, height: 900, mode: "desktop" },
  { width: 1440, height: 700, mode: "desktop" },
  { width: 1920, height: 1080, mode: "desktop" },
];

if (!executable) throw new Error("Chrome or Edge is required for the Vault responsive check.");

const moduleCss = readFileSync("src/components/vault/vault-lock-screen.module.css", "utf8")
  .replace(/:global\(([^)]+)\)/g, "$1");
const fixtureCss = `
  :root { --brand:#2563eb; --brand-dark:#1d4ed8; --brand-soft:#dbeafe; --canvas:#eef3fb; --surface:#fff; --ink:#14213d; --muted:#64748b; --line:#d9e2ef; }
  * { box-sizing:border-box; }
  html, body { width:100%; min-height:100%; margin:0; color:var(--ink); background:linear-gradient(145deg,#dbeafe,#f8fafc 46%,#ede9fe); font-family:Arial,sans-serif; }
  .app-main { width:100%; min-height:100dvh; }
  .dashboard, .dashboard-card { width:100%; height:100dvh; }
  .dashboard-card { padding:20px; }
  @media (min-width:1100px) { .app-main { width:calc(100% - 80px); margin-left:80px; } }
  ${moduleCss}`;

const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fixtureCss}</style></head><body>
  <main class="app-main"><div class="dashboard"><section class="dashboard-card">
    <section class="lockScreen vault-lock-screen" data-phase="locked"><div class="lockPanel">
      <section class="visualColumn">
        <header class="header"><span class="headerIcon">◆</span><div><p>PERSONAL STORE · PRIVATE VAULT</p><h2>私密保管庫</h2><span>輸入 Vault 密碼，開啟只在這台裝置記憶體中存在的解鎖金鑰。</span></div></header>
        <div class="safeStage"><div class="safe" data-phase="locked"><span class="safeDepth"></span><div class="interior"><span class="interiorLock">◆</span><strong>PRIVATE VAULT</strong><small>安全空間已就緒</small></div><div class="door"><span class="doorInset"></span><span class="brandPlate"><i>PS</i><b>PERSONAL STORE</b><small>ZERO-KNOWLEDGE SECURITY</small></span><span class="handle"><i class="handleRing"></i><i class="handleHub"></i></span></div></div></div>
        <div class="statusRow" data-status="locked"><span class="statusDot"></span><span><strong>LOCKED</strong><small>等待安全驗證</small></span></div>
      </section>
      <form class="authCard"><div class="consoleHeading"><span class="consoleIcon">◆</span><div><p>SECURITY CONSOLE</p><h3>安全身分驗證</h3><span>通過驗證後才會在本機記憶體建立暫時金鑰。</span></div></div><div class="authHeading"><div><strong>Vault 密碼</strong><span>輸入完整密碼以解除保險庫鎖定。</span></div><span class="securityBadge">AES-256</span></div><label class="passwordField"><span>Vault 密碼</span><span class="passwordControl"><input type="password"><button type="button">顯示</button></span></label><button class="unlockButton" type="button">解鎖私密保管庫</button><p class="zeroKnowledge">密碼與解密後內容不會傳送到伺服器。</p><div class="securityRule"></div><div class="securityList"><div><span>◆</span><p><strong>AES-256-GCM 瀏覽器端加密</strong><small>敏感內容只在目前裝置解密。</small></p></div><div><span>◆</span><p><strong>10 分鐘閒置自動鎖定</strong><small>鎖定時立即清除解密後的金鑰。</small></p></div><div><span>◆</span><p><strong>零知識資料保護</strong><small>伺服器不會取得你的 Vault 密碼。</small></p></div></div></form>
    </div></section>
  </section></div></main></body></html>`;

const browser = spawn(executable, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, "--user-data-dir=" + process.env.TEMP + "\\personal-store-vault-layout-cdp", "about:blank"], { stdio: "ignore" });
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function retry(callback, attempts = 50) { let lastError; for (let index = 0; index < attempts; index += 1) { try { return await callback(); } catch (error) { lastError = error; await wait(100); } } throw lastError; }
async function newTarget() { return retry(async () => { const response = await fetch(`http://127.0.0.1:${port}/json/new?about%3Ablank`, { method: "PUT" }); if (!response.ok) throw new Error(`Unable to open browser target: ${response.status}`); return response.json(); }); }
function connect(webSocketUrl) { const socket = new WebSocket(webSocketUrl); let sequence = 0; const pending = new Map(); socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (!message.id) return; const request = pending.get(message.id); if (!request) return; pending.delete(message.id); if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result); }); return new Promise((resolve, reject) => { socket.addEventListener("error", reject, { once:true }); socket.addEventListener("open", () => resolve({ close:() => socket.close(), send(method, params = {}) { sequence += 1; return new Promise((requestResolve, requestReject) => { pending.set(sequence, { resolve:requestResolve, reject:requestReject }); socket.send(JSON.stringify({ id:sequence, method, params })); }); } }), { once:true }); }); }
function assert(condition, message) { if (!condition) throw new Error(message); }
const rounded = (value) => Math.round(value * 10) / 10;

async function measure(client, viewport) {
  await client.send("Emulation.setDeviceMetricsOverride", { width:viewport.width, height:viewport.height, deviceScaleFactor:1, mobile:viewport.mode === "mobile" });
  await client.send("Runtime.evaluate", { expression:`document.open();document.write(${JSON.stringify(fixture)});document.close();`, returnByValue:true });
  await client.send("Runtime.evaluate", { expression:"new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))", awaitPromise:true });
  const response = await client.send("Runtime.evaluate", { expression:`(() => { const rect = (selector) => { const value = document.querySelector(selector)?.getBoundingClientRect(); return value ? { x:value.x, y:value.y, width:value.width, height:value.height, right:value.right, bottom:value.bottom } : null; }; const display = (selector) => getComputedStyle(document.querySelector(selector)).display; return { innerWidth, scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth), card:rect('.dashboard-card'), lockScreen:rect('.lockScreen'), panel:rect('.lockPanel'), visual:rect('.visualColumn'), safe:rect('.safe'), auth:rect('.authCard'), input:rect('.passwordControl input'), statusDisplay:display('.statusRow'), consoleDisplay:display('.consoleHeading'), gridColumns:getComputedStyle(document.querySelector('.lockPanel')).gridTemplateColumns }; })()`, returnByValue:true });
  if ([390, 1024, 1440].includes(viewport.width) && viewport.height !== 700) { const screenshot = await client.send("Page.captureScreenshot", { format:"png", fromSurface:true }); writeFileSync(join(process.env.TEMP, `vault-lock-${viewport.width}.png`), Buffer.from(screenshot.data, "base64")); }
  return response.result.value;
}

(async () => {
  const target = await newTarget(); const client = await connect(target.webSocketDebuggerUrl); await client.send("Page.enable"); await client.send("Runtime.enable"); const report = [];
  for (const viewport of viewports) {
    const metrics = await measure(client, viewport);
    assert(metrics.scrollWidth <= metrics.innerWidth + 1, `${viewport.width}x${viewport.height} has horizontal overflow`);
    assert(metrics.panel.x >= -1 && metrics.panel.right <= viewport.width + 1, `${viewport.width}x${viewport.height} panel escapes viewport`);
    assert(metrics.input.height >= 44, `${viewport.width}x${viewport.height} password control is below 44px`);
    const columns = metrics.gridColumns.trim().split(/\s+/).length;
    if (viewport.mode === "mobile") { assert(columns === 1, `${viewport.width}px mobile layout is not stacked`); assert(metrics.safe.width <= 411, `${viewport.width}px mobile safe grew beyond the existing limit`); assert(metrics.statusDisplay === "none" && metrics.consoleDisplay === "none", `${viewport.width}px desktop-only security details leaked into mobile`); }
    if (viewport.mode === "tablet") { assert(columns === 1, `${viewport.width}px tablet layout is not stacked`); assert(metrics.safe.width <= 591, `${viewport.width}px tablet safe exceeds 590px`); assert(metrics.auth.width <= 561, `${viewport.width}px tablet console exceeds 560px`); assert(metrics.statusDisplay !== "none", `${viewport.width}px tablet status is missing`); }
    if (viewport.mode === "desktop") { assert(columns === 2, `${viewport.width}px desktop layout is not two-column`); assert(metrics.safe.width <= 651, `${viewport.width}px desktop safe exceeds 650px`); assert(metrics.auth.width <= 481, `${viewport.width}px desktop console exceeds 480px`); assert(metrics.visual.right < metrics.auth.x, `${viewport.width}px visual and console columns overlap`); assert(metrics.card.width <= 1321, `${viewport.width}px glass workspace exceeds 1320px`); }
    if (viewport.width === 1440 && viewport.height === 700) { assert(metrics.card.bottom <= 701 && metrics.auth.bottom <= metrics.card.bottom + 1 && metrics.safe.bottom <= metrics.card.bottom + 1, "1440x700 layout is vertically clipped"); }
    report.push({ viewport:`${viewport.width}x${viewport.height}`, mode:viewport.mode, panelColumns:columns, workspaceWidth:rounded(metrics.card.width), safeWidth:rounded(metrics.safe.width), consoleWidth:rounded(metrics.auth.width), horizontalOverflow:false });
  }
  console.log(JSON.stringify(report, null, 2)); client.close();
})().finally(() => browser.kill());
