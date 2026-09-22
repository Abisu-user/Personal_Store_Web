import type { AppIconName } from "@/components/ui/app-icon";

export const mobileNavigationDestinations = [
  { id: "bookmarks", href: "/bookmarks", icon: "bookmark", label: "網站收藏" },
  { id: "notes", href: "/notes", icon: "note", label: "筆記" },
  { id: "code", href: "/code", icon: "code", label: "程式碼" },
  { id: "files", href: "/files", icon: "file", label: "檔案" },
  { id: "photos", href: "/photos", icon: "photo", label: "照片" },
  { id: "vocabulary", href: "/vocabulary", icon: "vocabulary", label: "單字學習" },
  { id: "anime", href: "/anime", icon: "anime", label: "動漫收藏" },
  { id: "ktv", href: "/ktv", icon: "music", label: "KTV 點歌收藏" },
  { id: "vault", href: "/vault", icon: "lock", label: "私密保管庫" },
  { id: "calendar", href: "/calendar", icon: "calendar", label: "日曆" },
  { id: "organize", href: "/organize", icon: "organize", label: "收藏與整理" },
  { id: "appearance", href: "/appearance", icon: "appearance", label: "外觀與布局" },
  { id: "storage", href: "/storage-usage", icon: "storage", label: "儲存空間" },
  { id: "security", href: "/security", icon: "security", label: "安全中心" },
  { id: "mfa", href: "/security/mfa", icon: "settings", label: "雙因素驗證" },
  { id: "profile", href: "/profile", icon: "profile", label: "帳號設定" },
] as const satisfies ReadonlyArray<{ id: string; href: string; icon: AppIconName; label: string }>;

export type MobileNavigationDestination = (typeof mobileNavigationDestinations)[number]["id"];
export type MobileNavigationSideCount = 2 | 3 | 4;
export type MobileNavigationSlotKey = "left1" | "left2" | "left3" | "right1" | "right2" | "right3";
export type MobileNavigationSlots = Record<MobileNavigationSlotKey, MobileNavigationDestination>;
export type MobileNavigationPreferences = {
  sideCount: MobileNavigationSideCount;
  slots: MobileNavigationSlots;
  backgroundColor: string;
  opacity: number;
};

type LegacyMobileNavigationPreferences = {
  itemCount?: 5 | 7;
  items?: unknown[];
};

const legacyStorageKey = "personal-vault:mobile-bottom-navigation:v1";
const allSlotKeys: MobileNavigationSlotKey[] = ["left1", "left2", "left3", "right1", "right2", "right3"];
const defaultSlots: MobileNavigationSlots = {
  left1: "bookmarks",
  left2: "notes",
  left3: "code",
  right1: "files",
  right2: "photos",
  right3: "anime",
};

function isDestination(value: unknown): value is MobileNavigationDestination {
  return typeof value === "string" && mobileNavigationDestinations.some((item) => item.id === value);
}

function isSideCount(value: unknown): value is MobileNavigationSideCount {
  return value === 2 || value === 3 || value === 4;
}

export function normalizeMobileNavigationColor(value: unknown, fallback = "#101117") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed.slice(1).split("").map((character) => character.repeat(2)).join("")}`.toUpperCase();
  }
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : fallback;
}

function clampOpacity(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(Math.max(40, Math.min(100, value))) : 92;
}

function slotsFromLegacy(value: LegacyMobileNavigationPreferences) {
  const items = Array.isArray(value.items) ? value.items.filter(isDestination) : [];
  if (value.itemCount === 7) {
    return { left1: items[0], left2: items[1], right1: items[2], right2: items[3] };
  }
  return { left1: items[0], right1: items[1] };
}

export function normalizeMobileNavigationPreferences(value: unknown): MobileNavigationPreferences {
  const candidate = value && typeof value === "object" ? value as Partial<MobileNavigationPreferences> & LegacyMobileNavigationPreferences : {};
  const sideCount = isSideCount(candidate.sideCount) ? candidate.sideCount : candidate.itemCount === 7 ? 3 : 2;
  const sourceSlots: Partial<MobileNavigationSlots> = candidate.slots && typeof candidate.slots === "object" ? candidate.slots : slotsFromLegacy(candidate);
  const used = new Set<MobileNavigationDestination>();
  const fallbackOrder = [
    ...Object.values(defaultSlots),
    ...mobileNavigationDestinations.map((item) => item.id),
  ].filter((item, index, values) => values.indexOf(item) === index);
  const slots = {} as MobileNavigationSlots;

  for (const key of allSlotKeys) {
    const requested = sourceSlots[key];
    const next = isDestination(requested) && !used.has(requested)
      ? requested
      : fallbackOrder.find((destination) => !used.has(destination));
    slots[key] = next ?? defaultSlots[key];
    used.add(slots[key]);
  }

  return {
    sideCount,
    slots,
    backgroundColor: normalizeMobileNavigationColor(candidate.backgroundColor),
    opacity: clampOpacity(candidate.opacity),
  };
}

export const mobileNavigationDefaults = normalizeMobileNavigationPreferences({
  sideCount: 2,
  slots: defaultSlots,
  backgroundColor: "#101117",
  opacity: 92,
});

export function mobileNavigationVisibleSlotKeys(sideCount: MobileNavigationSideCount) {
  const customPerSide = sideCount - 1;
  return {
    left: allSlotKeys.slice(0, customPerSide) as MobileNavigationSlotKey[],
    right: allSlotKeys.slice(3, 3 + customPerSide) as MobileNavigationSlotKey[],
  };
}

export function readLegacyMobileNavigationPreferences() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(legacyStorageKey);
    return value ? normalizeMobileNavigationPreferences(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

export function clearLegacyMobileNavigationPreferences() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(legacyStorageKey); } catch { /* Account settings remain the source of truth. */ }
}

/** @deprecated Production preferences now live inside account Appearance JSON. */
export function readMobileNavigationPreferences() {
  return readLegacyMobileNavigationPreferences() ?? mobileNavigationDefaults;
}

/** @deprecated Retained for the existing isolated mobile layout fixture. */
export function saveMobileNavigationPreferences(preferences: MobileNavigationPreferences) {
  const normalized = normalizeMobileNavigationPreferences(preferences);
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(legacyStorageKey, JSON.stringify(normalized)); } catch { /* Fixture state remains in memory. */ }
    window.dispatchEvent(new CustomEvent("personal-vault:mobile-navigation", { detail: normalized }));
  }
  return normalized;
}
