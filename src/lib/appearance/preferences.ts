export const appearanceStorageKey = "personal-vault:appearance:v7";

export type Theme = "light" | "dark" | "system";
export type Accent = "blue" | "violet" | "emerald" | "rose" | "custom";
export type Background = "default" | "mist" | "aurora" | "paper" | "midnight" | "image";
export type Density = "comfortable" | "compact";
export type FontFamily = "system" | "rounded" | "serif" | "mono";
export type BackgroundRotation = "manual" | "login" | "interval";
export type BookmarkDisplay = "list" | "grid" | "text";
export type Appearance = {
  theme: Theme; accent: Accent; background: Background; density: Density; customColor: string;
  backgroundImage?: string; backgroundImages: string[]; backgroundActiveIndex: number;
  backgroundPosition?: string; backgroundPositionX: number; backgroundPositionY: number; backgroundZoom: number;
  backgroundTint?: string; canvasColor: string; textColor?: string; fontFamily: FontFamily; fontScale: number; backgroundBrightness: number; backgroundBlur: number; surfaceOpacity: number; backgroundRotation: BackgroundRotation; backgroundRotationMinutes: number; bookmarkDisplay: BookmarkDisplay; bookmarkGridColumns: number;
};

export const appearanceDefaults: Appearance = { theme: "system", accent: "blue", background: "default", density: "comfortable", customColor: "#2b65bd", backgroundImages: [], backgroundActiveIndex: 0, backgroundPositionX: 50, backgroundPositionY: 50, backgroundZoom: 100, backgroundTint: "#FFFFFF", canvasColor: "#F4F6FB", fontFamily: "system", fontScale: 100, backgroundBrightness: 100, backgroundBlur: 0, surfaceOpacity: 86, backgroundRotation: "manual", backgroundRotationMinutes: 15, bookmarkDisplay: "list", bookmarkGridColumns: 2 };
export const accentValues: Accent[] = ["blue", "violet", "emerald", "rose", "custom"];
export const themeValues: Theme[] = ["system", "light", "dark"];
export const backgroundValues: Background[] = ["default", "mist", "aurora", "paper", "midnight", "image"];
export const densityValues: Density[] = ["comfortable", "compact"];
const positions = ["center", "left", "right", "top", "bottom"] as const;
const rotations: BackgroundRotation[] = ["manual", "login", "interval"];
const fontFamilies: FontFamily[] = ["system", "rounded", "serif", "mono"];
const bookmarkDisplays: BookmarkDisplay[] = ["list", "grid", "text"];
const imageReferencePrefix = "workspace-image:";
const imageCache = new Map<string, string>();
let databasePromise: Promise<IDBDatabase> | undefined;

export function normalizeHexColor(value: unknown, fallback = appearanceDefaults.customColor) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback; }
function clamp(value: unknown, min: number, max: number, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback; }
function isStoredImage(value: string) { return value.startsWith(imageReferencePrefix); }
function isLegacyImage(value: string) { return value.startsWith("data:image/"); }
function blobToDataUrl(blob: Blob) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("BACKGROUND_IMAGE_READ_FAILED")); reader.onerror = () => reject(reader.error ?? new Error("BACKGROUND_IMAGE_READ_FAILED")); reader.readAsDataURL(blob); }); }
function imageDb() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open("personal-vault-backgrounds", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("images")) request.result.createObjectStore("images"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("BACKGROUND_STORAGE_UNAVAILABLE"));
    request.onblocked = () => reject(new Error("BACKGROUND_STORAGE_BLOCKED"));
  });
  return databasePromise;
}
function requestResult<T>(request: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("BACKGROUND_STORAGE_ERROR")); }); }

/** Stores image binaries outside localStorage so four high-quality backgrounds remain reliable. */
export async function storeBackgroundImage(blob: Blob) {
  try {
    const id = `${imageReferencePrefix}${crypto.randomUUID()}`;
    const db = await imageDb(); const transaction = db.transaction("images", "readwrite"); transaction.objectStore("images").put(blob, id);
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error("BACKGROUND_STORAGE_ERROR")); transaction.onabort = () => reject(transaction.error ?? new Error("BACKGROUND_STORAGE_ERROR")); });
    imageCache.set(id, URL.createObjectURL(blob));
    return id;
  } catch {
    // Some privacy extensions and embedded browsers block IndexedDB. Keep a compact
    // data URL as a compatibility fallback so the user's image still works.
    if (blob.size > 1_500_000) throw new Error("BACKGROUND_STORAGE_UNAVAILABLE");
    return blobToDataUrl(blob);
  }
}
export async function removeBackgroundImage(reference: string) {
  if (!isStoredImage(reference)) return;
  const url = imageCache.get(reference); if (url) URL.revokeObjectURL(url); imageCache.delete(reference);
  const db = await imageDb(); const transaction = db.transaction("images", "readwrite"); transaction.objectStore("images").delete(reference);
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error("BACKGROUND_STORAGE_ERROR")); });
}
export function getBackgroundImageUrl(reference: string | undefined) { return !reference ? undefined : isStoredImage(reference) ? imageCache.get(reference) : reference; }
async function convertLegacyImage(dataUrl: string) { const response = await fetch(dataUrl); return storeBackgroundImage(await response.blob()); }
/** Resolves stored image references and performs a one-time conversion of prior localStorage images. */
export async function hydrateAppearanceImages(appearance: Appearance): Promise<Appearance> {
  const normalized = normalizeAppearance(appearance); let changed = false;
  const refs = await Promise.all(normalized.backgroundImages.map(async (reference) => {
    if (isLegacyImage(reference)) {
      try { const converted = await convertLegacyImage(reference); changed ||= converted !== reference; return converted; }
      catch { return reference; }
    }
    if (!isStoredImage(reference)) return reference;
    if (imageCache.has(reference)) return reference;
    const db = await imageDb(); const transaction = db.transaction("images", "readonly"); const blob = await requestResult(transaction.objectStore("images").get(reference)) as Blob | undefined;
    if (blob) imageCache.set(reference, URL.createObjectURL(blob));
    return blob ? reference : "";
  }));
  const backgroundImages = refs.filter(Boolean);
  const next = { ...normalized, backgroundImages, backgroundActiveIndex: Math.min(normalized.backgroundActiveIndex, Math.max(0, backgroundImages.length - 1)), backgroundImage: backgroundImages[Math.min(normalized.backgroundActiveIndex, Math.max(0, backgroundImages.length - 1))] };
  if (changed || backgroundImages.length !== normalized.backgroundImages.length) saveAppearance(next);
  return next;
}

export function normalizeAppearance(value: unknown): Appearance {
  if (!value || typeof value !== "object") return appearanceDefaults;
  const candidate = value as Partial<Appearance>;
  if (!themeValues.includes(candidate.theme as Theme) || !accentValues.includes(candidate.accent as Accent) || !backgroundValues.includes(candidate.background as Background) || !densityValues.includes(candidate.density as Density)) return appearanceDefaults;
  const legacyImage = typeof candidate.backgroundImage === "string" && candidate.backgroundImage.startsWith("data:image/") ? candidate.backgroundImage : undefined;
  const backgroundImages = (Array.isArray(candidate.backgroundImages) ? candidate.backgroundImages : legacyImage ? [legacyImage] : []).filter((item): item is string => typeof item === "string" && (item.startsWith("data:image/") || isStoredImage(item))).slice(0, 10);
  const legacyPosition = candidate.backgroundPosition; const position = legacyPosition === "left" ? [20, 50] : legacyPosition === "right" ? [80, 50] : legacyPosition === "top" ? [50, 20] : legacyPosition === "bottom" ? [50, 80] : [50, 50];
  const activeIndex = Math.floor(clamp(candidate.backgroundActiveIndex, 0, Math.max(0, backgroundImages.length - 1), 0));
  return { theme: candidate.theme as Theme, accent: candidate.accent as Accent, background: candidate.background as Background, density: candidate.density as Density, customColor: normalizeHexColor(candidate.customColor), backgroundImage: backgroundImages[activeIndex], backgroundImages, backgroundActiveIndex: activeIndex, backgroundPosition: positions.includes(legacyPosition as typeof positions[number]) ? legacyPosition : "center", backgroundPositionX: clamp(candidate.backgroundPositionX, 0, 100, position[0]), backgroundPositionY: clamp(candidate.backgroundPositionY, 0, 100, position[1]), backgroundZoom: clamp(candidate.backgroundZoom, 100, 180, 100), backgroundTint: normalizeHexColor(candidate.backgroundTint, "#FFFFFF"), canvasColor: normalizeHexColor(candidate.canvasColor, "#F4F6FB"), textColor: typeof candidate.textColor === "string" && /^#[0-9a-f]{6}$/i.test(candidate.textColor) ? candidate.textColor.toUpperCase() : undefined, fontFamily: fontFamilies.includes(candidate.fontFamily as FontFamily) ? candidate.fontFamily as FontFamily : "system", fontScale: Math.round(clamp(candidate.fontScale, 85, 120, 100)), backgroundBrightness: clamp(candidate.backgroundBrightness, 60, 150, 100), backgroundBlur: clamp(candidate.backgroundBlur, 0, 20, 0), surfaceOpacity: clamp(candidate.surfaceOpacity, 35, 100, 86), backgroundRotation: rotations.includes(candidate.backgroundRotation as BackgroundRotation) ? candidate.backgroundRotation as BackgroundRotation : "manual", backgroundRotationMinutes: Math.round(clamp(candidate.backgroundRotationMinutes, 1, 1440, 15)), bookmarkDisplay: bookmarkDisplays.includes(candidate.bookmarkDisplay as BookmarkDisplay) ? candidate.bookmarkDisplay as BookmarkDisplay : "list", bookmarkGridColumns: Math.round(clamp(candidate.bookmarkGridColumns, 1, 4, 2)) };
}

export function readAppearance(): Appearance { try { return normalizeAppearance(JSON.parse(window.localStorage.getItem(appearanceStorageKey) ?? window.localStorage.getItem("personal-vault:appearance:v6") ?? window.localStorage.getItem("personal-vault:appearance:v5") ?? window.localStorage.getItem("personal-vault:appearance:v4") ?? window.localStorage.getItem("personal-vault:appearance:v3") ?? window.localStorage.getItem("personal-vault:appearance:v2") ?? window.localStorage.getItem("personal-vault:appearance:v1") ?? "{}")); } catch { return appearanceDefaults; } }
export function activeBackground(appearance: Appearance) { return getBackgroundImageUrl(appearance.backgroundImages[appearance.backgroundActiveIndex] ?? appearance.backgroundImage); }
export function nextBackground(appearance: Appearance): Appearance { return appearance.backgroundImages.length > 1 ? { ...appearance, backgroundActiveIndex: (appearance.backgroundActiveIndex + 1) % appearance.backgroundImages.length } : appearance; }
export function applyAppearance(appearance: Appearance) {
  const normalized = normalizeAppearance(appearance); const root = document.documentElement; const image = activeBackground(normalized);
  root.dataset.theme = normalized.theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : normalized.theme; root.dataset.accent = normalized.accent; root.dataset.background = normalized.background; root.dataset.density = normalized.density; root.dataset.bookmarkDisplay = normalized.bookmarkDisplay;
  const font = normalized.fontFamily === "rounded" ? "ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif" : normalized.fontFamily === "serif" ? "Iowan Old Style, 'Noto Serif TC', Georgia, serif" : normalized.fontFamily === "mono" ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : "Inter, ui-sans-serif, system-ui, sans-serif";
  root.style.setProperty("--custom-brand", normalized.customColor); root.style.setProperty("--workspace-image", image ? `url("${image}")` : "none"); root.style.setProperty("--workspace-position", `${normalized.backgroundPositionX}% ${normalized.backgroundPositionY}%`); root.style.setProperty("--workspace-size", `${normalized.backgroundZoom}%`); root.style.setProperty("--workspace-tint", normalized.backgroundTint ?? "#FFFFFF"); root.style.setProperty("--workspace-canvas-color", normalized.canvasColor); root.style.setProperty("--workspace-font", font); root.style.setProperty("--user-font-scale", `${normalized.fontScale / 100}`); root.style.setProperty("--bookmark-grid-columns", String(normalized.bookmarkGridColumns)); root.style.setProperty("--user-text-color", normalized.textColor ?? ""); root.style.setProperty("--workspace-brightness", `${normalized.backgroundBrightness}%`); root.style.setProperty("--workspace-blur", `${normalized.backgroundBlur}px`); root.style.setProperty("--workspace-surface-opacity", `${normalized.surfaceOpacity}%`); root.dataset.hasWorkspaceImage = image && normalized.background === "image" ? "true" : "false"; root.dataset.hasCustomTextColor = normalized.textColor ? "true" : "false";
}
export function saveAppearance(appearance: Appearance) { const normalized = normalizeAppearance(appearance); applyAppearance(normalized); window.localStorage.setItem(appearanceStorageKey, JSON.stringify(normalized)); ["personal-vault:appearance:v1", "personal-vault:appearance:v2", "personal-vault:appearance:v3", "personal-vault:appearance:v4", "personal-vault:appearance:v5", "personal-vault:appearance:v6"].forEach((key) => window.localStorage.removeItem(key)); window.dispatchEvent(new Event("personal-vault:appearance")); }
