export const appearanceStorageKey = "personal-vault:appearance:v2";

export type Theme = "light" | "dark" | "system";
export type Accent = "blue" | "violet" | "emerald" | "rose" | "custom";
export type Background = "mist" | "aurora" | "paper" | "midnight";
export type Density = "comfortable" | "compact";
export type Appearance = { theme: Theme; accent: Accent; background: Background; density: Density; customColor: string };

export const appearanceDefaults: Appearance = { theme: "system", accent: "blue", background: "mist", density: "comfortable", customColor: "#2b65bd" };
export const accentValues: Accent[] = ["blue", "violet", "emerald", "rose", "custom"];
export const themeValues: Theme[] = ["system", "light", "dark"];
export const backgroundValues: Background[] = ["mist", "aurora", "paper", "midnight"];
export const densityValues: Density[] = ["comfortable", "compact"];

export function normalizeHexColor(value: unknown, fallback = appearanceDefaults.customColor) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

export function normalizeAppearance(value: unknown): Appearance {
  if (!value || typeof value !== "object") return appearanceDefaults;
  const candidate = value as Partial<Appearance>;
  if (!themeValues.includes(candidate.theme as Theme) || !accentValues.includes(candidate.accent as Accent) || !backgroundValues.includes(candidate.background as Background) || !densityValues.includes(candidate.density as Density)) return appearanceDefaults;
  return { theme: candidate.theme as Theme, accent: candidate.accent as Accent, background: candidate.background as Background, density: candidate.density as Density, customColor: normalizeHexColor(candidate.customColor) };
}

export function readAppearance(): Appearance {
  try {
    const current = window.localStorage.getItem(appearanceStorageKey);
    const legacy = window.localStorage.getItem("personal-vault:appearance:v1");
    return normalizeAppearance(JSON.parse(current ?? legacy ?? "{}"));
  } catch { return appearanceDefaults; }
}

export function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = appearance.theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : appearance.theme;
  root.dataset.accent = appearance.accent;
  root.dataset.background = appearance.background;
  root.dataset.density = appearance.density;
  root.style.setProperty("--custom-brand", appearance.customColor);
}

export function saveAppearance(appearance: Appearance) {
  const normalized = normalizeAppearance(appearance);
  applyAppearance(normalized);
  window.localStorage.setItem(appearanceStorageKey, JSON.stringify(normalized));
  window.localStorage.removeItem("personal-vault:appearance:v1");
}
