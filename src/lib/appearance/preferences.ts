export const appearanceStorageKey = "personal-vault:appearance:v3";

export type Theme = "light" | "dark" | "system";
export type Accent = "blue" | "violet" | "emerald" | "rose" | "custom";
export type Background = "mist" | "aurora" | "paper" | "midnight";
export type Density = "comfortable" | "compact";
export type BackgroundRotation = "manual" | "login" | "interval";
export type Appearance = {
  theme: Theme; accent: Accent; background: Background; density: Density; customColor: string;
  backgroundImage?: string; backgroundImages: string[]; backgroundActiveIndex: number;
  backgroundPosition?: string; backgroundPositionX: number; backgroundPositionY: number; backgroundZoom: number;
  backgroundTint?: string; backgroundRotation: BackgroundRotation; backgroundRotationMinutes: number;
};

export const appearanceDefaults: Appearance = { theme: "system", accent: "blue", background: "mist", density: "comfortable", customColor: "#2b65bd", backgroundImages: [], backgroundActiveIndex: 0, backgroundPositionX: 50, backgroundPositionY: 50, backgroundZoom: 100, backgroundRotation: "manual", backgroundRotationMinutes: 15 };
export const accentValues: Accent[] = ["blue", "violet", "emerald", "rose", "custom"];
export const themeValues: Theme[] = ["system", "light", "dark"];
export const backgroundValues: Background[] = ["mist", "aurora", "paper", "midnight"];
export const densityValues: Density[] = ["comfortable", "compact"];
const positions = ["center", "left", "right", "top", "bottom"] as const;
const rotations: BackgroundRotation[] = ["manual", "login", "interval"];

export function normalizeHexColor(value: unknown, fallback = appearanceDefaults.customColor) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback; }
function clamp(value: unknown, min: number, max: number, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback; }

export function normalizeAppearance(value: unknown): Appearance {
  if (!value || typeof value !== "object") return appearanceDefaults;
  const candidate = value as Partial<Appearance>;
  if (!themeValues.includes(candidate.theme as Theme) || !accentValues.includes(candidate.accent as Accent) || !backgroundValues.includes(candidate.background as Background) || !densityValues.includes(candidate.density as Density)) return appearanceDefaults;
  const legacyImage = typeof candidate.backgroundImage === "string" && candidate.backgroundImage.startsWith("data:image/") ? candidate.backgroundImage : undefined;
  const backgroundImages = (Array.isArray(candidate.backgroundImages) ? candidate.backgroundImages : legacyImage ? [legacyImage] : []).filter((item): item is string => typeof item === "string" && item.startsWith("data:image/")).slice(0, 4);
  const legacyPosition = candidate.backgroundPosition;
  const position = legacyPosition === "left" ? [20, 50] : legacyPosition === "right" ? [80, 50] : legacyPosition === "top" ? [50, 20] : legacyPosition === "bottom" ? [50, 80] : [50, 50];
  return { theme: candidate.theme as Theme, accent: candidate.accent as Accent, background: candidate.background as Background, density: candidate.density as Density, customColor: normalizeHexColor(candidate.customColor), backgroundImage: backgroundImages[candidate.backgroundActiveIndex ?? 0], backgroundImages, backgroundActiveIndex: Math.floor(clamp(candidate.backgroundActiveIndex, 0, Math.max(0, backgroundImages.length - 1), 0)), backgroundPosition: positions.includes(legacyPosition as typeof positions[number]) ? legacyPosition : "center", backgroundPositionX: clamp(candidate.backgroundPositionX, 0, 100, position[0]), backgroundPositionY: clamp(candidate.backgroundPositionY, 0, 100, position[1]), backgroundZoom: clamp(candidate.backgroundZoom, 100, 180, 100), backgroundTint: normalizeHexColor(candidate.backgroundTint, "#FFFFFF"), backgroundRotation: rotations.includes(candidate.backgroundRotation as BackgroundRotation) ? candidate.backgroundRotation as BackgroundRotation : "manual", backgroundRotationMinutes: [5, 15, 30, 60].includes(candidate.backgroundRotationMinutes ?? 0) ? candidate.backgroundRotationMinutes! : 15 };
}

export function readAppearance(): Appearance { try { return normalizeAppearance(JSON.parse(window.localStorage.getItem(appearanceStorageKey) ?? window.localStorage.getItem("personal-vault:appearance:v2") ?? window.localStorage.getItem("personal-vault:appearance:v1") ?? "{}")); } catch { return appearanceDefaults; } }
export function activeBackground(appearance: Appearance) { return appearance.backgroundImages[appearance.backgroundActiveIndex] ?? appearance.backgroundImage; }
export function nextBackground(appearance: Appearance): Appearance { return appearance.backgroundImages.length > 1 ? { ...appearance, backgroundActiveIndex: (appearance.backgroundActiveIndex + 1) % appearance.backgroundImages.length } : appearance; }
export function applyAppearance(appearance: Appearance) {
  const normalized = normalizeAppearance(appearance); const root = document.documentElement; const image = activeBackground(normalized);
  root.dataset.theme = normalized.theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : normalized.theme;
  root.dataset.accent = normalized.accent; root.dataset.background = normalized.background; root.dataset.density = normalized.density;
  root.style.setProperty("--custom-brand", normalized.customColor); root.style.setProperty("--workspace-image", image ? `url("${image}")` : "none"); root.style.setProperty("--workspace-position", `${normalized.backgroundPositionX}% ${normalized.backgroundPositionY}%`); root.style.setProperty("--workspace-size", `${normalized.backgroundZoom}%`); root.style.setProperty("--workspace-tint", normalized.backgroundTint ?? "#FFFFFF"); root.dataset.hasWorkspaceImage = image ? "true" : "false";
}
export function saveAppearance(appearance: Appearance) { const normalized = normalizeAppearance(appearance); applyAppearance(normalized); window.localStorage.setItem(appearanceStorageKey, JSON.stringify(normalized)); window.localStorage.removeItem("personal-vault:appearance:v1"); window.localStorage.removeItem("personal-vault:appearance:v2"); window.dispatchEvent(new Event("personal-vault:appearance")); }
