export const mobileNavigationDestinations = [
  { id: "bookmarks", href: "/bookmarks", icon: "◇", label: "收藏" },
  { id: "notes", href: "/notes", icon: "□", label: "筆記" },
  { id: "code", href: "/code", icon: "⌘", label: "程式碼" },
  { id: "files", href: "/files", icon: "▣", label: "檔案" },
  { id: "photos", href: "/photos", icon: "▧", label: "照片" },
  { id: "vocabulary", href: "/vocabulary", icon: "文", label: "單字" },
  { id: "vault", href: "/vault", icon: "◈", label: "保管庫" },
  { id: "calendar", href: "/calendar", icon: "◌", label: "日曆" },
  { id: "organize", href: "/organize", icon: "☷", label: "管理" },
  { id: "appearance", href: "/appearance", icon: "◐", label: "外觀" },
] as const;

export type MobileNavigationDestination = (typeof mobileNavigationDestinations)[number]["id"];
export type MobileNavigationPreferences = { itemCount: 5 | 7; items: MobileNavigationDestination[] };

const storageKey = "personal-vault:mobile-bottom-navigation:v1";
const defaultItems: Record<MobileNavigationPreferences["itemCount"], MobileNavigationDestination[]> = {
  5: ["bookmarks", "files"],
  7: ["bookmarks", "notes", "files", "photos"],
};

function isDestination(value: unknown): value is MobileNavigationDestination {
  return typeof value === "string" && mobileNavigationDestinations.some((item) => item.id === value);
}

export function normalizeMobileNavigationPreferences(value: unknown): MobileNavigationPreferences {
  const candidate = value && typeof value === "object" ? value as Partial<MobileNavigationPreferences> : {};
  const itemCount: MobileNavigationPreferences["itemCount"] = candidate.itemCount === 7 ? 7 : 5;
  const required = itemCount - 3;
  const unique = Array.isArray(candidate.items) ? candidate.items.filter(isDestination).filter((item, index, values) => values.indexOf(item) === index) : [];
  const items = [...unique, ...defaultItems[itemCount], ...mobileNavigationDestinations.map((item) => item.id)]
    .filter((item, index, values) => values.indexOf(item) === index)
    .slice(0, required);

  return { itemCount, items };
}

export const mobileNavigationDefaults = normalizeMobileNavigationPreferences({ itemCount: 5, items: defaultItems[5] });

export function readMobileNavigationPreferences() {
  try { return normalizeMobileNavigationPreferences(JSON.parse(window.localStorage.getItem(storageKey) ?? "{}")); }
  catch { return mobileNavigationDefaults; }
}

export function saveMobileNavigationPreferences(preferences: MobileNavigationPreferences) {
  const normalized = normalizeMobileNavigationPreferences(preferences);
  window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("personal-vault:mobile-navigation", { detail: normalized }));
  return normalized;
}
