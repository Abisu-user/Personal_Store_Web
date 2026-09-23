import { normalizeMobileNavigationColor, type MobileNavigationPreferences } from "./mobile-navigation-preferences";

type Rgb = readonly [number, number, number];
type StyleTarget = { setProperty: (name: string, value: string) => void };

function rgbFromHex(value: string): Rgb {
  const hex = normalizeMobileNavigationColor(value).slice(1);
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}

function rgbString([red, green, blue]: Rgb, alpha = 1) {
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

function mix(source: Rgb, target: Rgb, amount: number): Rgb {
  return source.map((value, index) => Math.round(value + (target[index] - value) * amount)) as unknown as Rgb;
}

function luminance([red, green, blue]: Rgb) {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
  };
  return .2126 * channel(red) + .7152 * channel(green) + .0722 * channel(blue);
}

function contrastText(surface: Rgb) {
  const value = luminance(surface);
  return (value + .05) / .05 >= 1.05 / (value + .05)
    ? [18, 22, 30] as const
    : [248, 249, 253] as const;
}

export function mobileNavigationThemeVariables(preferences: Pick<MobileNavigationPreferences, "backgroundColor" | "opacity">) {
  const base = rgbFromHex(preferences.backgroundColor);
  const opacity = Math.max(.4, Math.min(1, preferences.opacity / 100));
  const text = contrastText(base);
  const lightSurface = text[0] < 100;
  const active = mix(base, text, lightSurface ? .065 : .135);
  const sheetItem = mix(base, text, lightSurface ? .045 : .105);
  const activeText = contrastText(active);
  const sheetOpacity = Math.max(.88, opacity);
  const activeOpacity = Math.max(.9, Math.min(1, opacity + .08));
  const shadow = lightSurface ? "rgba(18, 28, 45, .180)" : "rgba(0, 0, 0, .420)";
  const activeShadow = lightSurface ? "rgba(18, 28, 45, .220)" : "rgba(0, 0, 0, .460)";

  return {
    "--mobile-nav-user-color": normalizeMobileNavigationColor(preferences.backgroundColor),
    "--mobile-nav-user-opacity": `${Math.round(opacity * 100)}%`,
    "--mobile-nav-surface": rgbString(base, opacity),
    "--mobile-nav-text": rgbString(text),
    "--mobile-nav-muted": rgbString(text, .6),
    "--mobile-nav-border": rgbString(text, .13),
    "--mobile-nav-highlight": rgbString(text, .07),
    "--mobile-nav-shadow": shadow,
    "--mobile-nav-active-surface": rgbString(active, activeOpacity),
    "--mobile-nav-active-text": rgbString(activeText),
    "--mobile-nav-active-border": rgbString(activeText, .18),
    "--mobile-nav-active-highlight": rgbString(activeText, .12),
    "--mobile-nav-active-shadow": activeShadow,
    "--mobile-nav-sheet-surface": rgbString(base, sheetOpacity),
    "--mobile-nav-sheet-text": rgbString(text),
    "--mobile-nav-sheet-muted": rgbString(text, .62),
    "--mobile-nav-sheet-border": rgbString(text, .14),
    "--mobile-nav-sheet-item": rgbString(sheetItem, Math.max(.76, sheetOpacity - .08)),
    "--mobile-nav-sheet-item-active": rgbString(active, activeOpacity),
    "--mobile-nav-sheet-close": rgbString(sheetItem, Math.max(.82, sheetOpacity - .04)),
    "--mobile-nav-sheet-danger": lightSurface ? "rgba(170, 32, 55, .110)" : "rgba(255, 92, 112, .130)",
    "--mobile-nav-danger-text": lightSurface ? "#A51F38" : "#FF9CAA",
  } as const;
}

export function applyMobileNavigationTheme(target: StyleTarget, preferences: Pick<MobileNavigationPreferences, "backgroundColor" | "opacity">) {
  Object.entries(mobileNavigationThemeVariables(preferences)).forEach(([name, value]) => target.setProperty(name, value));
}
