export const BACKGROUND_IMAGE_MAX_BYTES = 8_388_608;

export const backgroundImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type BackgroundImageMimeType = (typeof backgroundImageMimeTypes)[number];

export type BackgroundImageStage =
  | "validation"
  | "decode"
  | "canvas"
  | "encode"
  | "checksum"
  | "upload-prepare"
  | "upload-transfer"
  | "upload-finalize"
  | "appearance-save";

export class BackgroundImageError extends Error {
  readonly stage: BackgroundImageStage;
  readonly code: string;
  readonly originalCause?: unknown;

  constructor(
    stage: BackgroundImageStage,
    code: string,
    originalCause?: unknown,
  ) {
    super(code);
    this.name = "BackgroundImageError";
    this.stage = stage;
    this.code = code;
    this.originalCause = originalCause;
  }
}

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

export function backgroundImageErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "背景儲存空間不足，請先移除不需要的背景圖片。";
  }
  if (!(error instanceof BackgroundImageError)) return "圖片處理失敗，請稍後再試。";
  if (error.code === "BACKGROUND_IMAGE_FORMAT_NOT_ALLOWED") {
    return "不支援此圖片格式。請使用 JPG、JPEG、PNG、WebP 或 AVIF。";
  }
  if (error.code === "BACKGROUND_IMAGE_TOO_LARGE") {
    return "圖片大小超過上限。單張背景圖片不可超過 8 MB。";
  }
  if (error.stage === "decode") return "無法讀取圖片，檔案可能已損壞。";
  if (error.stage === "canvas" || error.stage === "encode") {
    return "圖片讀取成功，但瀏覽器無法處理圖片，請改用其他瀏覽器後再試。";
  }
  if (error.stage === "appearance-save") {
    return "圖片已上傳，但外觀設定保存失敗，請稍後再試。";
  }
  if (error.stage === "checksum" || error.stage.startsWith("upload-")) {
    return "圖片讀取成功，但上傳失敗，請稍後再試。";
  }
  return "圖片處理失敗，請稍後再試。";
}
