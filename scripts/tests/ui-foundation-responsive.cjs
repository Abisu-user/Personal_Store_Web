/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");

const chromePaths = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executable = chromePaths.find(existsSync);
const port = 9337;
const origin = "http://localhost:3010";
const viewports = [
  { width: 1920, height: 1080, mobile: false },
  { width: 1440, height: 900, mobile: false },
  { width: 1366, height: 768, mobile: false },
  { width: 1024, height: 768, mobile: false },
  { width: 820, height: 900, mobile: false },
  { width: 701, height: 820, mobile: false },
  { width: 700, height: 820, mobile: true },
  { width: 430, height: 932, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 375, height: 812, mobile: true },
];

if (!executable) throw new Error("Chrome or Edge is required for the responsive UI check.");

const browser = spawn(executable, [
  "--headless=new",
  "--disable-gpu",
  "--disable-cache",
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
          <div class="desktop-collection-workspace">
            <div class="desktop-collection-layout">
            <aside class="desktop-collection-sidebar">
              <header><strong>類別</strong><div><button type="button">＋</button><button type="button">管理</button></div></header>
              <div class="desktop-collection-category-list">
                <button class="desktop-collection-category" aria-pressed="true" type="button"><span>所有類別</span><small>12</small></button>
                <button class="desktop-collection-category" aria-pressed="false" type="button"><span>測試類別</span><small>3</small></button>
                ${Array.from({ length: 30 }, (_, index) => `<button class="desktop-collection-category" type="button"><span>分類 ${index + 1}</span></button>`).join("")}
              </div>
              <div class="desktop-collection-sidebar-footer"><button class="desktop-collection-category" type="button"><span>垃圾桶</span></button></div>
            </aside>
            <div class="desktop-collection-main">
            <section aria-label="資料夾" class="collection-navigation-section"><header><strong>資料夾</strong></header><div class="bookmark-view-tabs"><button>未整理</button><button>工作</button></div></section>
            <section aria-label="類別" class="collection-navigation-section"><header><strong>類別</strong></header><div class="category-strip"><button>所有類別</button></div></section>
            <input class="note-search" aria-label="搜尋" placeholder="搜尋名稱" />
            <div class="bulk-toolbar"><label><input type="checkbox" /> 全選目前清單</label></div>
            <div class="content-item-list">${Array.from({ length: 45 }, (_, index) => `<article class="content-item-card">測試內容 ${index + 1}</article>`).join("")}</div>
            </div>
            </div>
            <div class="modal-dialog-backdrop">
    <section class="modal-dialog">
      <header class="modal-dialog-header"><div><p class="eyebrow">DIALOG</p><h2>整理資料</h2></div><button class="modal-dialog-close" aria-label="關閉" type="button">×</button></header>
      <div class="modal-dialog-content"><p>簡單操作不應產生超大型視窗或大片空白。</p><div class="dialog-actions"><button class="secondary-button" type="button">取消</button><button class="button" type="button">完成</button></div></div>
    </section>
            </div>
          </div>
        </div>
      </section>
    </div>
  </main>`;

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
  await wait(350);
  await client.send("Runtime.evaluate", {
    expression: `document.querySelectorAll('link[rel="stylesheet"]').forEach(link => { if (link.parentElement !== document.head) document.head.appendChild(link.cloneNode(true)); }); document.body.innerHTML = ${JSON.stringify(fixture)}; document.documentElement.dataset.theme = "light"`,
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
        dashboardCardPadding: (() => { const value = getComputedStyle(document.querySelector(".dashboard-card")); return { top: value.paddingTop, right: value.paddingRight, bottom: value.paddingBottom, left: value.paddingLeft }; })(),
        card: rect(".library-card"),
        modal: rect(".modal-dialog"),
        modalVisibleAtCenter: (() => { const dialog = document.querySelector('.modal-dialog'); const bounds = dialog.getBoundingClientRect(); return dialog.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)); })(),
        close: rect(".modal-dialog-close"),
        mobileIcon: rect(".mobile-icon-button"),
        button: rect(".page-create-button"),
        buttonStyle: style(".page-create-button"),
        workspaceStyle: style(".bookmarks-workspace"),
        mobileSectionStyle: style(".mobile-section"),
        collection: rect(".desktop-collection-workspace"),
        collectionSidebar: rect(".desktop-collection-sidebar"),
        collectionSidebarStyle: style(".desktop-collection-sidebar"),
        collectionList: (() => { const element = document.querySelector(".desktop-collection-category-list"); return { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, overflowY: getComputedStyle(element).overflowY }; })(),
        collectionFolder: rect(".desktop-collection-main > section[aria-label='資料夾']"),
        collectionCategoryStyle: style(".desktop-collection-main > section[aria-label='類別']"),
        collectionMain: (() => { const element = document.querySelector(".desktop-collection-main"); const value = getComputedStyle(element); return { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, overflowY: value.overflowY, overscrollBehaviorY: value.overscrollBehaviorY }; })(),
        collectionListStyle: (() => { const value = getComputedStyle(document.querySelector(".desktop-collection-category-list")); return { scrollbarWidth: value.scrollbarWidth, overscrollBehaviorY: value.overscrollBehaviorY }; })(),
        buttonCenterDelta: Math.abs((buttonRect.x + buttonRect.width / 2) - (textRect.x + textRect.width / 2)),
      };
    })()`,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser layout evaluation failed");
  return result.result.value;
}

async function verifyIndependentWheelScroll(client, viewport) {
  await client.send("Runtime.evaluate", { expression: 'document.querySelector(".modal-dialog-backdrop").style.display = "none"' });
  const read = async () => {
    const response = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const sidebar = document.querySelector('.desktop-collection-sidebar');
        const category = document.querySelector('.desktop-collection-category-list');
        const main = document.querySelector('.desktop-collection-main');
        const card = document.querySelector('.dashboard-card');
        return { sidebarY: sidebar.getBoundingClientRect().y, categoryTop: category.scrollTop, mainTop: main.scrollTop, cardTop: card.scrollTop,
          categoryX: category.getBoundingClientRect().x + 40, categoryY: category.getBoundingClientRect().y + 60,
          mainX: main.getBoundingClientRect().x + 40, mainY: main.getBoundingClientRect().y + 80 };
      })()`,
      returnByValue: true,
    });
    return response.result.value;
  };
  const before = await read();
  await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: before.mainX, y: before.mainY, deltaX: 0, deltaY: 400 });
  await wait(250);
  const afterMain = await read();
  assert(afterMain.mainTop > before.mainTop, `${viewport.width}px right wheel did not scroll main`);
  assert(afterMain.categoryTop === before.categoryTop && afterMain.sidebarY === before.sidebarY, `${viewport.width}px right wheel moved sidebar`);
  assert(afterMain.cardTop === before.cardTop, `${viewport.width}px right wheel scrolled page card`);
  await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: before.categoryX, y: before.categoryY, deltaX: 0, deltaY: 400 });
  await wait(250);
  const afterCategory = await read();
  assert(afterCategory.categoryTop > before.categoryTop, `${viewport.width}px left wheel did not scroll categories`);
  assert(afterCategory.mainTop === afterMain.mainTop && afterCategory.sidebarY === before.sidebarY, `${viewport.width}px left wheel moved main or sidebar`);
  assert(afterCategory.cardTop === before.cardTop, `${viewport.width}px left wheel scrolled page card`);
  await client.send("Runtime.evaluate", { expression: `document.querySelector('.desktop-collection-category-list').scrollTop = 99999; document.querySelector('.desktop-collection-main').scrollTop = 99999` });
  const atBottom = await read();
  await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: before.categoryX, y: before.categoryY, deltaX: 0, deltaY: 400 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: before.mainX, y: before.mainY, deltaX: 0, deltaY: 400 });
  await wait(250);
  const afterOverscroll = await read();
  assert(afterOverscroll.sidebarY === before.sidebarY && afterOverscroll.cardTop === before.cardTop, `${viewport.width}px wheel at bottom scrolled the page`);
  assert(afterOverscroll.categoryTop === atBottom.categoryTop && afterOverscroll.mainTop === atBottom.mainTop, `${viewport.width}px scroll containers moved past their ends`);
  await client.send("Runtime.evaluate", { expression: `document.querySelectorAll('.desktop-collection-category-list > button').forEach((button, index) => { if (index > 1) button.remove(); }); document.querySelector('.desktop-collection-category-list').scrollTop = 0` });
  const shortList = await client.send("Runtime.evaluate", { expression: `(() => { const list = document.querySelector('.desktop-collection-category-list'); return { scrollHeight: list.scrollHeight, clientHeight: list.clientHeight, scrollbarWidth: getComputedStyle(list).scrollbarWidth }; })()`, returnByValue: true });
  assert(shortList.result.value.scrollHeight <= shortList.result.value.clientHeight && shortList.result.value.scrollbarWidth === "none", `${viewport.width}px short category list still overflows`);
}

async function verifyAnimeCollectionScroll(client, viewport, adult) {
  const categories = Array.from({ length: 32 }, (_, index) => `<button type="button"><span>動漫類別 ${index + 1}</span></button>`).join("");
  const cards = Array.from({ length: 45 }, (_, index) => `<article class="anime-card" style="min-height:120px">動漫 ${index + 1}</article>`).join("");
  const layout = `<div class="anime-library-layout ${adult ? "" : "anime-standard-library-layout"}">
    <aside class="anime-desktop-filter-rail"><section class="anime-filter-rail-group anime-filter-rail-categories"><header><h2>類別</h2></header><div class="anime-filter-rail-category-scroll"><button>所有類別</button>${categories}</div></section><section class="anime-filter-rail-group anime-filter-rail-footer"><button>垃圾桶</button></section></aside>
    <div class="anime-library-main"><section class="anime-folder-navigation" data-anime-scope="${adult ? "adult" : "standard"}"><header>資料夾</header><div class="responsive-chip-overflow"><button>全部</button></div></section><section class="anime-category-bar">舊類別列</section><div class="anime-grid">${cards}</div></div>
  </div>`;
  const html = `<main class="app-main"><div class="dashboard anime-dashboard"><section class="dashboard-card"><header class="page-heading"><h1>動漫收藏</h1></header><div class="anime-workspace"><header class="anime-shared-header"><div class="anime-header-title"><h1>動漫收藏</h1></div></header>${adult ? `<section class="anime-adult-workspace">${layout}</section>` : layout}</div></section></div></main>`;
  await client.send("Runtime.evaluate", { expression: `document.body.innerHTML = ${JSON.stringify(html)}` });
  await client.send("Runtime.evaluate", { expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))", awaitPromise: true });
  const read = async () => {
    const response = await client.send("Runtime.evaluate", { expression: `(() => {
      const rail = document.querySelector('.anime-desktop-filter-rail');
      const category = document.querySelector('.anime-filter-rail-category-scroll');
      const main = document.querySelector('.anime-library-main');
      const header = rail.querySelector('header');
      const footer = rail.querySelector('.anime-filter-rail-footer');
      return { railDisplay: getComputedStyle(rail).display, viewportWidth: innerWidth, columns: getComputedStyle(document.querySelector('.anime-library-layout')).gridTemplateColumns, railY: rail.getBoundingClientRect().y, headerY: header.getBoundingClientRect().y, footerY: footer.getBoundingClientRect().y,
        categoryTop: category.scrollTop, categoryHeight: category.clientHeight, categoryScrollHeight: category.scrollHeight, categoryOverflow: getComputedStyle(category).overflowY,
        mainTop: main.scrollTop, mainHeight: main.clientHeight, mainScrollHeight: main.scrollHeight, mainOverflow: getComputedStyle(main).overflowY,
        folderDisplay: getComputedStyle(document.querySelector('.anime-folder-navigation')).display,
        stripDisplay: getComputedStyle(document.querySelector('.anime-category-bar')).display,
        cardTop: document.querySelector('.dashboard-card').scrollTop,
        cardPaddingTop: getComputedStyle(document.querySelector('.dashboard-card')).paddingTop,
        categoryX: category.getBoundingClientRect().x + 40, categoryY: category.getBoundingClientRect().y + 60,
        mainX: main.getBoundingClientRect().x + 40, mainY: main.getBoundingClientRect().y + 80 };
    })()`, returnByValue: true });
    return response.result.value;
  };
  const label = `${viewport.width}px ${adult ? "adult" : "standard"} anime`;
  const before = await read();
  assert(before.cardPaddingTop === "0px", `${label} outer card still has top padding`);
  assert(before.railDisplay === "flex", `${label} category rail is hidden (${JSON.stringify(before)})`);
  assert(before.folderDisplay === "grid" && before.stripDisplay === "none", `${label} folder/category hierarchy is wrong`);
  assert(before.categoryOverflow === "auto" && before.categoryScrollHeight > before.categoryHeight, `${label} categories cannot scroll`);
  assert(before.mainOverflow === "auto" && before.mainScrollHeight > before.mainHeight, `${label} content cannot scroll`);
  await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: before.mainX, y: before.mainY, deltaX: 0, deltaY: 450 });
  await wait(250);
  const afterMain = await read();
  assert(afterMain.mainTop > before.mainTop && afterMain.railY === before.railY && afterMain.categoryTop === before.categoryTop && afterMain.cardTop === before.cardTop, `${label} right wheel moves the rail/page`);
  await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: before.categoryX, y: before.categoryY, deltaX: 0, deltaY: 450 });
  await wait(250);
  const afterCategory = await read();
  assert(afterCategory.categoryTop > before.categoryTop && afterCategory.mainTop === afterMain.mainTop && afterCategory.headerY === before.headerY && afterCategory.footerY === before.footerY, `${label} left wheel moves header/footer/main`);
}

(async () => {
  const target = await newTarget(origin + "/login");
  const client = await connect(target.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  await client.send("Network.setBypassServiceWorker", { bypass: true });
  await client.send("Runtime.enable");

  const report = [];
  for (const viewport of viewports) {
    const metrics = await measure(client, viewport);
    assert(metrics.scrollWidth <= metrics.innerWidth + 1, `${viewport.width}px has horizontal overflow (${metrics.scrollWidth}px)`);
    assert(metrics.dashboard && metrics.dashboard.x >= -1 && metrics.dashboard.right <= viewport.width + 1, `${viewport.width}px dashboard escapes viewport`);
    assert(metrics.modal && metrics.modal.x >= -1 && metrics.modal.right <= viewport.width + 1, `${viewport.width}px modal escapes viewport`);
    assert(metrics.modalVisibleAtCenter, `${viewport.width}px nested collection modal is clipped or covered`);
    assert(metrics.modal.height < viewport.height, `${viewport.width}px simple modal occupies the full viewport`);
    assert(metrics.button.height >= 44, `${viewport.width}px primary touch target is below 44px`);
    assert(metrics.buttonStyle.display === "flex" || metrics.buttonStyle.display === "inline-flex", `${viewport.width}px button is not flex aligned`);
    assert(metrics.buttonStyle.alignItems === "center" && metrics.buttonStyle.justifyContent === "center", `${viewport.width}px button content is not centered`);
    assert(metrics.buttonCenterDelta <= 1.5, `${viewport.width}px button label is visually off-center`);
    assert(metrics.close && Math.abs(metrics.close.width - metrics.close.height) <= 1, `${viewport.width}px icon close button is not square`);
    assert(metrics.card.height < 180, `${viewport.width}px two-line card is unnecessarily tall`);

    if (viewport.mobile) {
      assert(metrics.collectionSidebarStyle.display === "none", `${viewport.width}px desktop category sidebar leaked into mobile`);
      assert(metrics.collectionCategoryStyle.display !== "none", `${viewport.width}px mobile category controls disappeared`);
      assert(metrics.mobileSectionStyle.display === "grid", `${viewport.width}px mobile section is not available`);
      assert(metrics.mobileIcon.width >= 44 && metrics.mobileIcon.height >= 44, `${viewport.width}px mobile icon target is below 44px`);
      assert(metrics.workspaceStyle.gap === "12px", `${viewport.width}px mobile workspace gap is not on the spacing scale`);
    } else {
      assert(metrics.dashboardCardPadding.top === "0px", `${viewport.width}px desktop feature card still has top padding (${JSON.stringify(metrics.dashboardCardPadding)})`);
      assert(parseFloat(metrics.dashboardCardPadding.right) > 0 && parseFloat(metrics.dashboardCardPadding.bottom) > 0 && parseFloat(metrics.dashboardCardPadding.left) > 0, `${viewport.width}px desktop feature card lost side/bottom padding`);
      const compactPadding = await client.send("Runtime.evaluate", {
        expression: `(() => { document.documentElement.dataset.density = "compact"; const style = getComputedStyle(document.querySelector(".dashboard-card")); return { top: style.paddingTop, right: style.paddingRight, bottom: style.paddingBottom, left: style.paddingLeft }; })()`,
        returnByValue: true,
      });
      assert(compactPadding.result.value.top === "0px" && parseFloat(compactPadding.result.value.right) > 0 && parseFloat(compactPadding.result.value.bottom) > 0, `${viewport.width}px compact feature card padding is incorrect`);
      await client.send("Runtime.evaluate", { expression: 'delete document.documentElement.dataset.density' });
      assert(metrics.collectionSidebarStyle.display === "flex", `${viewport.width}px category sidebar is missing (${JSON.stringify(metrics.collectionSidebarStyle)})`);
      assert(metrics.collectionCategoryStyle.display === "none", `${viewport.width}px horizontal category strip remains visible`);
      assert(metrics.collectionSidebar.right + 8 <= metrics.collectionFolder.x, `${viewport.width}px category sidebar overlaps folder content`);
      assert(metrics.collectionFolder.right <= viewport.width + 1, `${viewport.width}px folder content overflows viewport`);
      assert(metrics.collectionList.overflowY === "auto" && metrics.collectionList.scrollHeight > metrics.collectionList.clientHeight, `${viewport.width}px long category list cannot scroll independently`);
      assert(metrics.collectionMain.overflowY === "auto" && metrics.collectionMain.scrollHeight > metrics.collectionMain.clientHeight, `${viewport.width}px main content cannot scroll independently`);
      assert(metrics.collectionListStyle.scrollbarWidth === "none", `${viewport.width}px category scrollbar is visible`);
      assert(metrics.collectionListStyle.overscrollBehaviorY === "contain" && metrics.collectionMain.overscrollBehaviorY === "contain", `${viewport.width}px scroll chaining is not contained`);
      assert(metrics.modal.width <= 721, `${viewport.width}px default modal exceeds the 720px content width`);
      assert(metrics.mobileSectionStyle.display === "none", `${viewport.width}px mobile-only section leaked into desktop`);
      assert(metrics.workspaceStyle.gap === "16px", `${viewport.width}px desktop workspace gap is not on the spacing scale`);
      await verifyIndependentWheelScroll(client, viewport);
      await verifyAnimeCollectionScroll(client, viewport, false);
      await verifyAnimeCollectionScroll(client, viewport, true);
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
