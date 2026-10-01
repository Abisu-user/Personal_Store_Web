/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { mkdtempSync, readdirSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve, sep } = require("node:path");

const chunks = join(__dirname, "../../.next/static/chunks");
const cssFiles = readdirSync(chunks).filter((file) => file.endsWith(".css"));
const css = cssFiles
  .map((file) => readFileSync(join(chunks, file), "utf8")).join("\n");
function className(module, name) {
  const match = css.match(new RegExp(`\\.([\\w-]*${module}[\\w-]*__${name})(?=[\\s:{.>])`));
  if (!match) throw new Error(`Missing compiled CSS class: ${module}/${name}`);
  return match[1];
}
const cal = (name) => className("calendar-mobile-module", name);
const option = (name) => className("mobile-option-sheet-module", name);
const swatches = Array.from({ length: 12 }, (_, index) => `<button type="button" class="${cal("colorChoice")}" style="background:#${index % 2 ? "58a5b4" : "5278c7"}"></button>`).join("");
const rows = Array.from({ length: 11 }, (_, index) => `<button type="button" class="${option("option")}"><span>提前 ${index + 1} 分鐘</span><span>○</span></button>`).join("");
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${cssFiles.map((file) => `<link rel="stylesheet" href="/${file}">`).join("")}</head><body>
<div class="modal-dialog-backdrop"><section class="modal-dialog create-item-dialog ${cal("editorDialog")}">
  <header class="modal-dialog-header"><div><p class="eyebrow">CREATE PRIVATE ITEM</p><h2>新增行程</h2></div><button class="modal-dialog-close">×</button></header>
  <div class="modal-dialog-content"><div class="create-item-fields"><form class="${cal("form")}">
    <label>行程名稱<input placeholder="例如：專題討論"></label>
    <div class="${cal("dateSection")}"><label>日期<input type="date" value="2026-10-01"></label><label class="${cal("allDayControl")}"><span>全天</span><input type="checkbox"><span class="${cal("allDaySwitch")}"></span></label></div>
    <div class="${cal("formRow")} ${cal("timeRow")}"><label>開始時間<input type="time" value="09:00"></label><label>結束時間（選填）<input type="time"></label></div>
    <div class="${cal("mobileRecurrence")}"><span>重複</span><button type="button">不重複 <span>›</span></button></div>
    <fieldset class="${cal("reminderSection")}"><legend>提醒</legend><p class="${cal("reminderEmpty")}">無提醒</p><button type="button" class="${cal("addReminder")} ${cal("mobileAddReminder")}">＋ 新增提醒</button></fieldset>
    <label>備註（選填）<textarea placeholder="請勿放入密碼、金鑰或 Recovery Code"></textarea></label>
    <fieldset><legend>行程顏色</legend><div class="${cal("colorChoices")}">${swatches}<button class="${cal("customColorButton")}" type="button">＋ 自訂</button></div></fieldset>
  </form></div></div>
  <div class="create-item-footer"><div class="create-form-actions"><button>取消</button><button>新增行程</button></div></div>
</section></div>
<div class="modal-dialog-backdrop"><section class="modal-dialog mobile-bottom-sheet ${option("sheet")}">
  <header class="modal-dialog-header"><div><p class="eyebrow">選擇</p><h2>新增提醒</h2></div><button class="modal-dialog-close">×</button></header>
  <div class="modal-dialog-content"><div class="${option("groups")}"><section class="${option("group")}"><h3>常用</h3><div>${rows}</div></section></div></div>
  <div class="modal-dialog-footer"><div class="${option("footer")}"><button>完成</button></div></div>
</section></div></body></html>`;

const executable = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
  .find((file) => { try { require("node:fs").accessSync(file); return true; } catch { return false; } });
if (!executable) throw new Error("Chrome or Edge is required");
const profile = mkdtempSync(join(tmpdir(), "calendar-modal-layout-"));
const port = 9347;
const server = createServer((request, response) => {
  const cssFile = cssFiles.find((file) => request.url === `/${file}`);
  response.setHeader("Content-Type", cssFile ? "text/css" : "text/html");
  response.end(cssFile ? readFileSync(join(chunks, cssFile)) : html);
});
const browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function retry(operation) {
  let last;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { return await operation(); } catch (error) { last = error; await pause(100); }
  }
  throw last;
}
async function main() {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  const target = await retry(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${address.port}/`)}`, { method: "PUT" });
    return response.json();
  });
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => { const result = JSON.parse(data); if (result.id && pending.has(result.id)) { const callback = pending.get(result.id); pending.delete(result.id); callback(result); } });
  const send = (method, params = {}) => new Promise((done) => { const id = ++nextId; pending.set(id, done); socket.send(JSON.stringify({ id, method, params })); });
  await retry(async () => {
    const ready = await send("Runtime.evaluate", { expression: `document.readyState === 'complete' && document.styleSheets.length === ${cssFiles.length}`, returnByValue: true });
    if (!ready.result.result.value) throw new Error("Stylesheet not loaded yet");
  });
  for (const width of [375, 390, 402, 430]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: width === 375 ? 650 : 844, deviceScaleFactor: 2, mobile: true });
    await pause(350);
    const result = await send("Runtime.evaluate", { expression: `(() => {
      const dialogs = [...document.querySelectorAll('.modal-dialog')];
      const editor = dialogs[0], sheet = dialogs[1];
      const content = editor.querySelector('.modal-dialog-content');
      const footer = editor.querySelector('.create-item-footer');
      content.scrollTop = content.scrollHeight;
      const color = editor.querySelector('fieldset:last-of-type');
      return { width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth,
        editorBottom: editor.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top,
        colorBottom: color.getBoundingClientRect().bottom, editorScrolls: content.scrollHeight > content.clientHeight,
        sheetTop: sheet.getBoundingClientRect().top, sheetBottom: sheet.getBoundingClientRect().bottom,
        sheetScrolls: sheet.querySelector('.modal-dialog-content').scrollHeight > sheet.querySelector('.modal-dialog-content').clientHeight,
        sheetLayer: getComputedStyle(sheet.parentElement).zIndex, editorLayer: getComputedStyle(editor.parentElement).zIndex,
        optionClass: sheet.className, selectorMatches: sheet.parentElement.matches('.modal-dialog-backdrop:has(> .${option("sheet")})'),
        optionAnimation: getComputedStyle(sheet).animationName, optionRules: [...document.styleSheets].flatMap(style => [...style.cssRules]).filter(rule => rule.cssText.includes('option-backdrop-in')).length };
    })()`, returnByValue: true });
    const metrics = result.result.result.value;
    console.log(`${width}px`, metrics);
    if (metrics.overflow > 1 || metrics.colorBottom > metrics.footerTop - 15 || metrics.sheetBottom > (width === 375 ? 650 : 844) + 1 || Number(metrics.sheetLayer) <= Number(metrics.editorLayer)) {
      throw new Error(`${width}px calendar modal layout failed`);
    }
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const keyboardResult = await send("Runtime.evaluate", { expression: `(() => {
    document.documentElement.style.setProperty('--mobile-modal-viewport-height', '480px');
    const editor = document.querySelector('.modal-dialog.create-item-dialog');
    const content = editor.querySelector('.modal-dialog-content');
    const notes = editor.querySelector('textarea');
    notes.scrollIntoView({ block: 'center' });
    return { editorBottom: editor.getBoundingClientRect().bottom, contentBottom: content.getBoundingClientRect().bottom,
      notesTop: notes.getBoundingClientRect().top, notesBottom: notes.getBoundingClientRect().bottom,
      contentTop: content.getBoundingClientRect().top, scrolls: content.scrollHeight > content.clientHeight };
  })()`, returnByValue: true });
  const keyboard = keyboardResult.result.result.value;
  console.log("390px simulated 480px visual viewport", keyboard);
  if (keyboard.editorBottom > 481 || keyboard.notesTop < keyboard.contentTop - 1 || keyboard.notesBottom > keyboard.contentBottom + 1 || !keyboard.scrolls) {
    throw new Error("Calendar modal failed reduced visual viewport layout");
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const desktopResult = await send("Runtime.evaluate", { expression: `(() => {
    const editor = document.querySelector('.modal-dialog.create-item-dialog');
    const date = editor.querySelector('.${cal("dateSection")}');
    const check = date.querySelector('input[type="checkbox"]');
    const mobileSwitch = date.querySelector('.${cal("allDaySwitch")}');
    return { width: editor.getBoundingClientRect().width, dateColumns: getComputedStyle(date).gridTemplateColumns,
      checkboxOpacity: getComputedStyle(check).opacity, switchDisplay: getComputedStyle(mobileSwitch).display };
  })()`, returnByValue: true });
  const desktop = desktopResult.result.result.value;
  console.log("1440px desktop editor", desktop);
  if (desktop.checkboxOpacity !== "1" || desktop.switchDisplay !== "none" || desktop.dateColumns.split(" ").length !== 2) {
    throw new Error("Desktop calendar editor controls changed");
  }
  socket.close();
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  browser.kill(); server.close();
  await pause(800);
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }); }
    catch { /* Chrome may still be releasing its profile on Windows. */ }
  }
});
