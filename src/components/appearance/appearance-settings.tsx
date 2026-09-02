"use client";

import { useEffect, useMemo, useState } from "react";
import { Accent, Appearance, Background, BackgroundRotation, BookmarkDisplay, Density, FontFamily, Theme, activeBackground, appearanceDefaults, applyAppearance, getBackgroundImageUrl, hasScopedAppearance, hydrateAppearanceImages, normalizeHexColor, readAppearance, readAppearanceBackup, removeBackgroundImage, saveAppearance, storeBackgroundImage } from "@/lib/appearance/preferences";
import { mobileNavigationDefaults, mobileNavigationDestinations, readMobileNavigationPreferences, saveMobileNavigationPreferences, type MobileNavigationDestination, type MobileNavigationPreferences } from "@/lib/layout/mobile-navigation-preferences";

const options = {
  theme: [["system", "跟隨系統"], ["light", "淺色"], ["dark", "深色"]] as const,
  accent: [["blue", "靛藍"], ["violet", "紫羅蘭"], ["emerald", "翡翠綠"], ["rose", "玫瑰紅"]] as const,
  background: [["default", "預設"], ["mist", "柔霧"], ["aurora", "極光"], ["paper", "紙感"], ["midnight", "午夜"], ["image", "圖片"]] as const,
  density: [["comfortable", "舒適"], ["compact", "緊湊"]] as const,
  bookmarkDisplay: [["list", "行列＋圖片"], ["grid", "圖片格子"], ["text", "純文字清單"]] as const,
  font: [["system", "系統字"], ["rounded", "圓體"], ["serif", "明體"], ["mono", "等寬"]] as const,
};
const focusPositions = [["left", "偏左", 18, 50], ["center", "置中", 50, 50], ["right", "偏右", 82, 50], ["top", "偏上", 50, 18], ["bottom", "偏下", 50, 82]] as const;

function hexToRgb(hex: string) { return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)] as const; }
function rgbToHex(rgb: number[]) { return `#${rgb.map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`.toUpperCase(); }
async function prepareImage(file: File) {
  const source = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = source;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("image")); });
    const scale = Math.min(1, 2048 / image.naturalWidth, 1152 / image.naturalHeight);
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("IMAGE_ENCODE_FAILED")), "image/webp", 0.9));
    return { blob, lowQuality: image.naturalWidth < 2048 || image.naturalHeight < 1152 };
  } finally { URL.revokeObjectURL(source); }
}

export function AppearanceSettings() {
  const [appearance, setAppearance] = useState<Appearance>(appearanceDefaults);
  const [ready, setReady] = useState(false);
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  const [mobileNavigation, setMobileNavigation] = useState<MobileNavigationPreferences>(mobileNavigationDefaults);
  const rgb = useMemo(() => hexToRgb(appearance.customColor), [appearance.customColor]);
  const imageMode = appearance.background === "image";
  useEffect(() => {
    let active = true;
    const restore = async () => {
      let stored = readAppearance();
      if (!hasScopedAppearance()) {
        const backup = await readAppearanceBackup();
        if (backup) stored = backup;
      }
      if (!active) return;
      applyAppearance(stored); setMobileNavigation(readMobileNavigationPreferences());
      try {
        const hydrated = await hydrateAppearanceImages(stored, { all: true });
        if (!active) return;
        applyAppearance(hydrated); setAppearance(hydrated); setReady(true);
      } catch {
        if (active) { setAppearance(stored); setReady(true); }
      }
    };
    void restore();
    return () => { active = false; };
  }, []);
  function commit(next: Appearance) { setAppearance(next); saveAppearance(next); }
  function update<Key extends keyof Appearance>(key: Key, value: Appearance[Key]) { commit({ ...appearance, [key]: value } as Appearance); }
  function updateCustomColor(value: string) { commit({ ...appearance, accent: "custom" as Accent, customColor: normalizeHexColor(value, appearance.customColor) }); }
  function updateRgb(index: number, value: string) { if (value === "") return; const parsed = Number.parseInt(value, 10); if (!Number.isFinite(parsed)) return; const nextRgb = [...rgb]; nextRgb[index] = Math.max(0, Math.min(255, parsed)); updateCustomColor(rgbToHex(nextRgb)); }
  function saveMobileNavigation(next: MobileNavigationPreferences) { setMobileNavigation(saveMobileNavigationPreferences(next)); }
  function changeMobileNavigationCount(itemCount: 5 | 7) { saveMobileNavigation({ itemCount, items: mobileNavigation.items }); }
  function changeMobileNavigationItem(index: number, value: MobileNavigationDestination) { const items = [...mobileNavigation.items]; const previous = items[index]; const duplicateIndex = items.indexOf(value); if (duplicateIndex >= 0) items[duplicateIndex] = previous; items[index] = value; saveMobileNavigation({ ...mobileNavigation, items }); }
  function reset() { appearance.backgroundImages.forEach((reference) => { void removeBackgroundImage(reference); }); setAppearance(appearanceDefaults); saveAppearance(appearanceDefaults); }
  async function chooseBackgrounds(files: FileList | null) {
    if (!files?.length) return;
    const selected = [...files];
    if (selected.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8_000_000)) { setImageNotice("請選擇單張 8 MB 以下的 JPG、PNG 或 WebP 圖片。"); return; }
    try {
      const available = Math.max(0, 10 - appearance.backgroundImages.length); const images = await Promise.all(selected.slice(0, available).map(prepareImage)); if (!images.length) { setImageNotice("背景圖片最多可保留 10 張，請先移除不需要的圖片。"); return; } const references = await Promise.all(images.map((item) => storeBackgroundImage(item.blob))); const merged = [...appearance.backgroundImages, ...references].slice(-10); const activeIndex = Math.max(0, merged.length - references.length);
      void Promise.all(appearance.backgroundImages.filter((reference) => !merged.includes(reference)).map(removeBackgroundImage));
      commit({ ...appearance, background: "image", backgroundImages: merged, backgroundActiveIndex: activeIndex, backgroundImage: merged[activeIndex] });
      setImageNotice(images.some((item) => item.lowQuality) ? "已加入背景清單。原圖低於建議 2048 × 1152；過度放大或裁切後可能略為失真。" : `已加入 ${images.length} 張高畫質背景圖片。`);
    } catch (error) { setImageNotice(error instanceof DOMException && error.name === "QuotaExceededError" ? "背景儲存空間不足，請先移除不需要的背景圖片。" : "無法讀取或儲存這張圖片；請再試一次或改用 JPG、PNG、WebP。 "); }
  }
  function selectImage(index: number) { if (!getBackgroundImageUrl(appearance.backgroundImages[index])) setImageNotice("背景圖片正在載入，請稍候。 "); commit({ ...appearance, background: "image", backgroundActiveIndex: index, backgroundImage: appearance.backgroundImages[index], backgroundRotation: "manual" }); }
  function removeImage(index: number) { const removed = appearance.backgroundImages[index]; const images = appearance.backgroundImages.filter((_, current) => current !== index); const activeIndex = Math.min(appearance.backgroundActiveIndex, Math.max(0, images.length - 1)); commit({ ...appearance, backgroundImages: images, backgroundActiveIndex: activeIndex, backgroundImage: images[activeIndex] }); void removeBackgroundImage(removed); setImageNotice(images.length ? "背景圖片已移除。" : "已移除所有自訂背景圖片。"); }
  const previewImage = activeBackground(appearance);

  return <section aria-busy={!ready} className="appearance-workspace">
    <section className="appearance-preview"><div><p className="eyebrow">LIVE PREVIEW</p><h2>這是你的工作空間</h2><p>選擇會立即套用至所有頁面，並記住這台裝置的設計偏好。</p></div><div className="appearance-sample"><span>V</span><div><strong>今日焦點</strong><small>將常用資料整理得更舒服</small></div><i>◈</i></div></section>
    <section className="appearance-section"><div><p className="eyebrow">THEME</p><h2>明暗模式</h2></div><div className="appearance-options">{options.theme.map(([value, label]) => <button aria-pressed={appearance.theme === value} className={appearance.theme === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("theme", value as Theme)} type="button"><i className={`theme-swatch ${value}`} /><span>{label}</span></button>)}</div></section>
    <section className="appearance-section"><div><p className="eyebrow">ACCENT</p><h2>主色調</h2></div><div><div className="appearance-options accent-options">{options.accent.map(([value, label]) => <button aria-pressed={appearance.accent === value} className={appearance.accent === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("accent", value as Accent)} type="button"><i className={`accent-swatch ${value}`} /><span>{label}</span></button>)}<button aria-pressed={appearance.accent === "custom"} className={appearance.accent === "custom" ? "appearance-choice active custom-color-choice" : "appearance-choice custom-color-choice"} onClick={() => update("accent", "custom")} type="button"><i className="accent-swatch custom" style={{ background: appearance.customColor }} /><span>自訂色</span></button></div><div className="custom-color-controls"><label>調色盤<input aria-label="自訂主色調" onChange={(event) => updateCustomColor(event.target.value)} type="color" value={appearance.customColor} /></label><label>HEX<input aria-label="HEX 色碼" onChange={(event) => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) updateCustomColor(event.target.value); }} pattern="#[0-9A-Fa-f]{6}" value={appearance.customColor} /></label>{["R", "G", "B"].map((label, index) => <label key={label}>{label}<input aria-label={`${label} 色彩數值`} inputMode="numeric" max="255" min="0" onChange={(event) => updateRgb(index, event.target.value)} type="number" value={rgb[index]} /></label>)}</div></div></section>
    <section className="appearance-section"><div><p className="eyebrow">TYPOGRAPHY</p><h2>文字與字體</h2></div><div><div className="appearance-options">{options.font.map(([value, label]) => <button aria-pressed={appearance.fontFamily === value} className={appearance.fontFamily === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("fontFamily", value as FontFamily)} type="button"><i className={`font-swatch ${value}`} /><span>{label}</span></button>)}</div><div className="custom-color-controls"><label>文字顏色<input aria-label="文字顏色" onChange={(event) => update("textColor", event.target.value)} type="color" value={appearance.textColor ?? "#152743"} /></label><button className="secondary-button compact" onClick={() => update("textColor", undefined)} type="button">跟隨明暗模式</button></div><label className="font-scale-control">字體大小<input aria-label="字體大小" max="120" min="85" onChange={(event) => update("fontScale", Number(event.target.value))} type="range" value={appearance.fontScale} /><output>{appearance.fontScale}%</output></label></div></section>
    <section className="appearance-section"><div><p className="eyebrow">BACKGROUND</p><h2>工作區背景</h2><p className="hint">目前設定只套用於此裝置版面，不會影響另一種版面。</p></div><div><div className="appearance-options background-options">{options.background.map(([value, label]) => <button aria-pressed={appearance.background === value} className={appearance.background === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("background", value as Background)} type="button"><i className={`background-swatch ${value}`} /><span>{label}</span></button>)}<label className="appearance-choice background-color-choice"><i className="background-swatch color" style={{ background: appearance.canvasColor }} /><span>顏色</span><input aria-label="預設背景顏色" onChange={(event) => update("canvasColor", event.target.value)} type="color" value={appearance.canvasColor} /></label></div>{imageMode && <div className="background-image-controls"><label>上傳圖片（最多 10 張）<input accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void chooseBackgrounds(event.target.files)} type="file" /></label>{appearance.backgroundImages.length > 0 && <><div aria-label="背景圖片清單" className="background-playlist">{appearance.backgroundImages.map((image, index) => <div className={appearance.backgroundActiveIndex === index ? "background-thumbnail active" : "background-thumbnail"} key={`${image.slice(-24)}-${index}`}><button aria-label={`選擇第 ${index + 1} 張背景`} onClick={() => selectImage(index)} style={{ backgroundImage: `url("${image}")` }} type="button" /><button aria-label={`移除第 ${index + 1} 張背景`} className="background-image-remove" onClick={() => removeImage(index)} type="button">×</button></div>)}</div><label>切換方式<select aria-label="背景切換方式" onChange={(event) => update("backgroundRotation", event.target.value as BackgroundRotation)} value={appearance.backgroundRotation}><option value="manual">手動選擇</option><option value="login">每次登入／重新開啟時</option><option value="interval">依時間自動切換</option></select></label>{appearance.backgroundRotation === "interval" && <label>切換間隔（分鐘）<input aria-label="背景切換間隔" inputMode="numeric" max="1440" min="1" onChange={(event) => update("backgroundRotationMinutes", Number(event.target.value))} type="number" value={appearance.backgroundRotationMinutes} /></label>}<div className="background-preview-wrap"><strong>工作區預覽</strong><div aria-label="背景預覽" className="background-preview" style={{ backgroundImage: `url("${previewImage}")`, backgroundPosition: `${appearance.backgroundPositionX}% ${appearance.backgroundPositionY}%`, backgroundSize: `${appearance.backgroundZoom}%`, filter: `brightness(${appearance.backgroundBrightness}%) blur(${appearance.backgroundBlur}px)` }}><span>預覽中的工作區</span></div></div><div className="crop-controls"><strong>自由裁切與顯示</strong><p>調整會立即套用到實際工作區；圖片會以較高解析度保留，過度放大仍可能降低畫質。</p><label>水平焦點 <input aria-label="裁切水平焦點" max="100" min="0" onChange={(event) => update("backgroundPositionX", Number(event.target.value))} type="range" value={appearance.backgroundPositionX} /></label><label>垂直焦點 <input aria-label="裁切垂直焦點" max="100" min="0" onChange={(event) => update("backgroundPositionY", Number(event.target.value))} type="range" value={appearance.backgroundPositionY} /></label><label>放大 <input aria-label="裁切放大程度" max="180" min="100" onChange={(event) => update("backgroundZoom", Number(event.target.value))} type="range" value={appearance.backgroundZoom} /><output>{appearance.backgroundZoom}%</output></label><label>亮度 <input aria-label="背景亮度" max="150" min="60" onChange={(event) => update("backgroundBrightness", Number(event.target.value))} type="range" value={appearance.backgroundBrightness} /><output>{appearance.backgroundBrightness}%</output></label><label>模糊 <input aria-label="背景模糊程度" max="20" min="0" onChange={(event) => update("backgroundBlur", Number(event.target.value))} type="range" value={appearance.backgroundBlur} /><output>{appearance.backgroundBlur}px</output></label><label>外框透明度 <input aria-label="外框透明度" max="100" min="0" onChange={(event) => update("surfaceOpacity", Number(event.target.value))} type="range" value={appearance.surfaceOpacity} /><output>{appearance.surfaceOpacity}%</output></label>{focusPositions.map(([value, label, x, y]) => <button className={appearance.backgroundPosition === value ? "active" : ""} key={value} onClick={() => commit({ ...appearance, backgroundPosition: value, backgroundPositionX: x, backgroundPositionY: y })} type="button">{label}</button>)}</div></>} {imageNotice && <p className="background-image-notice">{imageNotice}</p>}</div>}</div></section>
    <section className="appearance-section"><div><p className="eyebrow">LAYOUT</p><h2>資料密度</h2></div><div className="appearance-options">{options.density.map(([value, label]) => <button aria-pressed={appearance.density === value} className={appearance.density === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("density", value as Density)} type="button"><i className={`density-swatch ${value}`} /><span>{label}</span></button>)}</div></section>
    <section className="appearance-section"><div><p className="eyebrow">BOOKMARK VIEW</p><h2>收藏清單樣式</h2><p>手機與電腦會套用相同的顯示偏好。</p></div><div><div className="appearance-options">{options.bookmarkDisplay.map(([value, label]) => <button aria-pressed={appearance.bookmarkDisplay === value} className={appearance.bookmarkDisplay === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("bookmarkDisplay", value as BookmarkDisplay)} type="button"><i className={`bookmark-display-swatch ${value}`} /><span>{label}</span></button>)}</div>{appearance.bookmarkDisplay === "grid" && <label className="bookmark-grid-columns">每列格子數量 <input aria-label="每列格子數量" max="4" min="1" onChange={(event) => update("bookmarkGridColumns", Number(event.target.value))} type="range" value={appearance.bookmarkGridColumns} /><output>{appearance.bookmarkGridColumns} 格</output></label>}</div></section>
    <section className="appearance-section mobile-navigation-settings"><div><p className="eyebrow">MOBILE NAVIGATION</p><h2>手機底部導覽</h2><p>首頁、新增、更多固定；其餘功能可替換，設定只會儲存在這台手機。</p></div><div><div className="mobile-navigation-layout-options"><button aria-pressed={mobileNavigation.itemCount === 5} className={mobileNavigation.itemCount === 5 ? "active" : ""} onClick={() => changeMobileNavigationCount(5)} type="button"><strong>5 個按鈕</strong><span>首頁・功能・新增・功能・更多</span></button><button aria-pressed={mobileNavigation.itemCount === 7} className={mobileNavigation.itemCount === 7 ? "active" : ""} onClick={() => changeMobileNavigationCount(7)} type="button"><strong>7 個按鈕</strong><span>首頁・2 個功能・新增・2 個功能・更多</span></button></div><div className="mobile-navigation-slot-grid">{mobileNavigation.items.map((value, index) => <label key={`${value}-${index}`}>自訂功能 {index + 1}<select aria-label={`底部導覽自訂功能 ${index + 1}`} onChange={(event) => changeMobileNavigationItem(index, event.target.value as MobileNavigationDestination)} value={value}>{mobileNavigationDestinations.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>)}</div><p className="mobile-navigation-preview">首頁　{mobileNavigation.items.slice(0, mobileNavigation.itemCount === 7 ? 2 : 1).map((item) => mobileNavigationDestinations.find((destination) => destination.id === item)?.label).join("・")}　新增　{mobileNavigation.items.slice(mobileNavigation.itemCount === 7 ? 2 : 1).map((item) => mobileNavigationDestinations.find((destination) => destination.id === item)?.label).join("・")}　更多</p></div></section>
    <button className="secondary-button appearance-reset" onClick={reset} type="button">還原預設外觀</button>
  </section>;
}
