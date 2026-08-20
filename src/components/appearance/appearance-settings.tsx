"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
type Accent = "blue" | "violet" | "emerald" | "rose";
type Background = "mist" | "aurora" | "paper" | "midnight";
type Density = "comfortable" | "compact";
type Appearance = { theme: Theme; accent: Accent; background: Background; density: Density };

const storageKey = "personal-vault:appearance:v1";
const defaults: Appearance = { theme: "system", accent: "blue", background: "mist", density: "comfortable" };
const options = {
  theme: [["system", "跟隨系統"], ["light", "淺色"], ["dark", "深色"]] as const,
  accent: [["blue", "靛藍"], ["violet", "紫羅蘭"], ["emerald", "翡翠綠"], ["rose", "玫瑰紅"]] as const,
  background: [["mist", "柔霧"], ["aurora", "極光"], ["paper", "紙感"], ["midnight", "午夜"]] as const,
  density: [["comfortable", "舒適"], ["compact", "緊湊"]] as const,
};

function readAppearance(): Appearance {
  try {
    const candidate = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
    if (options.theme.some(([value]) => value === candidate.theme) && options.accent.some(([value]) => value === candidate.accent) && options.background.some(([value]) => value === candidate.background) && options.density.some(([value]) => value === candidate.density)) return candidate;
  } catch { /* Use safe defaults when browser storage is unavailable or malformed. */ }
  return defaults;
}

function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  const resolvedTheme = appearance.theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : appearance.theme;
  root.dataset.theme = resolvedTheme;
  root.dataset.accent = appearance.accent;
  root.dataset.background = appearance.background;
  root.dataset.density = appearance.density;
}

export function AppearanceSettings() {
  const [appearance, setAppearance] = useState<Appearance>(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readAppearance();
    applyAppearance(stored);
    window.setTimeout(() => { setAppearance(stored); setReady(true); }, 0);
  }, []);

  function update<Key extends keyof Appearance>(key: Key, value: Appearance[Key]) {
    const next = { ...appearance, [key]: value } as Appearance;
    setAppearance(next);
    applyAppearance(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function reset() {
    setAppearance(defaults);
    applyAppearance(defaults);
    window.localStorage.removeItem(storageKey);
  }

  return <section className="appearance-workspace" aria-busy={!ready}>
    <section className="appearance-preview"><div><p className="eyebrow">LIVE PREVIEW</p><h2>這是你的工作空間</h2><p>所有選項會立即套用，並保留在這台裝置的瀏覽器中。</p></div><div className="appearance-sample"><span>V</span><div><strong>今日焦點</strong><small>將常用資料整理得更舒服</small></div><i>◈</i></div></section>
    <section className="appearance-section"><div><p className="eyebrow">THEME</p><h2>明暗模式</h2></div><div className="appearance-options">{options.theme.map(([value, label]) => <button aria-pressed={appearance.theme === value} className={appearance.theme === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("theme", value)} type="button"><i className={`theme-swatch ${value}`} /><span>{label}</span></button>)}</div></section>
    <section className="appearance-section"><div><p className="eyebrow">ACCENT</p><h2>主色調</h2></div><div className="appearance-options accent-options">{options.accent.map(([value, label]) => <button aria-pressed={appearance.accent === value} className={appearance.accent === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("accent", value)} type="button"><i className={`accent-swatch ${value}`} /><span>{label}</span></button>)}</div></section>
    <section className="appearance-section"><div><p className="eyebrow">BACKGROUND</p><h2>工作區背景</h2></div><div className="appearance-options background-options">{options.background.map(([value, label]) => <button aria-pressed={appearance.background === value} className={appearance.background === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("background", value)} type="button"><i className={`background-swatch ${value}`} /><span>{label}</span></button>)}</div></section>
    <section className="appearance-section"><div><p className="eyebrow">LAYOUT</p><h2>資料密度</h2></div><div className="appearance-options">{options.density.map(([value, label]) => <button aria-pressed={appearance.density === value} className={appearance.density === value ? "appearance-choice active" : "appearance-choice"} key={value} onClick={() => update("density", value)} type="button"><i className={`density-swatch ${value}`} /><span>{label}</span></button>)}</div></section>
    <button className="secondary-button appearance-reset" onClick={reset} type="button">還原預設外觀</button>
  </section>;
}
