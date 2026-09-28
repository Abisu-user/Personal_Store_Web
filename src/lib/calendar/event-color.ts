export const eventColorPresets = [
  { name: "藍", value: "#4F74BC" },
  { name: "天空藍", value: "#64A9D6" },
  { name: "青綠", value: "#3E9B96" },
  { name: "綠", value: "#5B986A" },
  { name: "黃", value: "#E4BF61" },
  { name: "橘", value: "#D59658" },
  { name: "紅", value: "#C86A6C" },
  { name: "粉紅", value: "#D587AB" },
  { name: "紫", value: "#9B76C5" },
  { name: "靛紫", value: "#7065AF" },
  { name: "灰", value: "#858F9F" },
  { name: "深色", value: "#46536A" },
] as const;

const legacyColors: Record<string, string> = {
  indigo: "#7065AF", blue: "#4F74BC", green: "#5B986A", amber: "#D59658", rose: "#C86A6C",
};
export const defaultEventColor = eventColorPresets[0].value;
export const isHexEventColor = (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value);

export function normalizeEventColor(value: string | null | undefined) {
  if (!value) return defaultEventColor;
  if (isHexEventColor(value)) return value.toUpperCase();
  return legacyColors[value] ?? defaultEventColor;
}

export function eventColorContrast(hex: string) {
  const color = normalizeEventColor(hex);
  const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? "#142033" : "#FFFFFF";
}
