export const BACKGROUND_IMAGE_MAX_BYTES = 8_388_608;

export const backgroundImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type BackgroundImageMimeType = (typeof backgroundImageMimeTypes)[number];

export const BACKGROUND_IMAGE_ACCEPT = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ...backgroundImageMimeTypes,
].join(",");

const allowedMimeTypes = new Set<string>(backgroundImageMimeTypes);
const extensionMimeTypes: Record<string, BackgroundImageMimeType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

export function normalizeBackgroundImageMimeType(value: string | null | undefined) {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return allowedMimeTypes.has(normalized) ? normalized as BackgroundImageMimeType : null;
}

export function backgroundImageMimeTypeForFile(file: Pick<File, "name" | "type">) {
  const mimeType = normalizeBackgroundImageMimeType(file.type);
  if (mimeType) return mimeType;
  if (file.type.trim()) return null;
  const extension = file.name.trim().toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  return extensionMimeTypes[extension] ?? null;
}

export function backgroundImageExtensionForMimeType(value: string) {
  const mimeType = normalizeBackgroundImageMimeType(value);
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/avif") return ".avif";
  return null;
}
