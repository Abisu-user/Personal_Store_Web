"use client";

import { useEffect, useMemo, useState } from "react";
import { Accent, Appearance, Background, Density, Theme, appearanceDefaults, applyAppearance, normalizeHexColor, readAppearance, saveAppearance } from "@/lib/appearance/preferences";

const options = {
  theme: [["system", "跟隨系統"], ["light", "淺色"], ["dark", "深色"]] as const,
  accent: [["blue", "靛藍"], ["violet", "紫羅蘭"], ["emerald", "翡翠綠"], ["rose", "玫瑰紅"]] as const,
  background: [["mist", "柔霧"], ["aurora", "極光"], ["paper", "紙感"], ["midnight", "午夜"]] as const,
  density: [["comfortable", "舒適"], ["compact", "緊湊"]] as const,
};

function hexToRgb(hex: string) { return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)] as const; }
function rgbToHex(rgb: number[]) { return `#${rgb.map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`.toUpperCase(); }

export function AppearanceSettings() {
  const [appearance, setAppearance] = useState<Appearance>(appearanceDefaults);
  const [ready, setReady] = useState(false);
  const rgb = useMemo(() => hexToRgb(appearance.customColor), [appearance.customColor]);

  useEffect(() => { const stored = readAppearance(); applyAppearance(stored); const timer = window.setTimeout(() => { setAppearance(stored); setReady(true); }, 0); return () => window.clearTimeout(timer); }, []);

  function update<Key extends keyof Appearance>(key: Key, value: Appearance[Key]) {
    const next = { ...appearance, [key]: value } as Appearance;
    setAppearance(next); saveAppearance(next);
  }

  function updateCustomColor(value: string) {
    const next = { ...appearance, accent: "custom" as Accent, customColor: normalizeHexColor(value, appearance.customColor) };
    setAppearance(next); saveAppearance(next);
  }

  function updateRgb(index: number, value: string) {
    if (value === "") return;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    const nextRgb = [...rgb]; nextRgb[index] = Math.max(0, Math.min(255, parsed));
    updateCustomColor(rgbToHex(nextRgb));
  }

  function reset() { setAppearance(appearanceDefaults); applyAppearance(appearanceDefaults); window.localStorage.removeItem("personal-vault:appearance:v1"); window.localStorage.removeItem("personal-vault:appearance:v2"); }

  return <section className="appearance-workspace" aria-busy={!ready}>
    <section className="appearance-preview"><div><p className="eyebrow">LIVE PREVIEW</p><h2>這是你的工作空間</h2><p>選擇會立即套用至所有頁面，並記住這台裝置的設計偏好。</p></div><div className="appearance-sample"><span>V</span><div><strong>今日焦點</strong><small>將常用資料整理得更舒服</small></div><i>◈</i></div></section>
    <section className="appearance-section"><div><p className="eyebrow">THEME</p><h2>明暗模式</h2></div><div className="appearance-options">{options.theme.map(([value, label]) => <button aria-pressed={appearance.theme === value} className={appearance.theme === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("theme", value as Theme)} type="button"><i className={`theme-swatch ${value}`} /><span>{label}</span></button>)}</div></section>
    <section className="appearance-section"><div><p className="eyebrow">ACCENT</p><h2>主色調</h2></div><div><div className="appearance-options accent-options">{options.accent.map(([value, label]) => <button aria-pressed={appearance.accent === value} className={appearance.accent === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("accent", value as Accent)} type="button"><i className={`accent-swatch ${value}`} /><span>{label}</span></button>)}<button aria-pressed={appearance.accent === "custom"} className={appearance.accent === "custom" ? "appearance-choice active custom-color-choice" : "appearance-choice custom-color-choice"} onClick={() => update("accent", "custom")} type="button"><i className="accent-swatch custom" style={{ background: appearance.customColor }} /><span>自訂色</span></button></div><div className="custom-color-controls"><label>調色盤<input aria-label="自訂主色調" onChange={(event) => updateCustomColor(event.target.value)} type="color" value={appearance.customColor} /></label><label>HEX<input aria-label="HEX 色碼" onChange={(event) => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) updateCustomColor(event.target.value); }} pattern="#[0-9A-Fa-f]{6}" value={appearance.customColor} /></label>{["R", "G", "B"].map((label, index) => <label key={label}>{label}<input aria-label={`${label} 色彩數值`} inputMode="numeric" max="255" min="0" onChange={(event) => updateRgb(index, event.target.value)} type="number" value={rgb[index]} /></label>)}</div></div></section>
    <section className="appearance-section"><div><p className="eyebrow">BACKGROUND</p><h2>工作區背景</h2></div><div className="appearance-options background-options">{options.background.map(([value, label]) => <button aria-pressed={appearance.background === value} className={appearance.background === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("background", value as Background)} type="button"><i className={`background-swatch ${value}`} /><span>{label}</span></button>)}</div></section>
    <section className="appearance-section"><div><p className="eyebrow">LAYOUT</p><h2>資料密度</h2></div><div className="appearance-options">{options.density.map(([value, label]) => <button aria-pressed={appearance.density === value} className={appearance.density === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("density", value as Density)} type="button"><i className={`density-swatch ${value}`} /><span>{label}</span></button>)}</div></section>
    <button className="secondary-button appearance-reset" onClick={reset} type="button">還原預設外觀</button>
  </section>;
}
