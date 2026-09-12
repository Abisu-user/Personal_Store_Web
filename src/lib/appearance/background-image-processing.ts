import {
  BackgroundImageError,
  type BackgroundImageMimeType,
  backgroundImageMimeTypeForFile,
  normalizeBackgroundImageMimeType,
} from "@/lib/appearance/background-image-format";

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function decodeWithImageBitmap(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap !== "function") throw new Error("CREATE_IMAGE_BITMAP_UNAVAILABLE");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  if (!bitmap.width || !bitmap.height) {
    bitmap.close();
    throw new Error("IMAGE_BITMAP_HAS_NO_DIMENSIONS");
  }
  return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
}

function decodeWithHtmlImage(file: File): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const release = () => URL.revokeObjectURL(objectUrl);

    // Handlers must be registered before src. Blob URLs can finish quickly on
    // Safari/PWA and assigning src first can lose the load event.
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        release();
        reject(new Error("HTML_IMAGE_HAS_NO_DIMENSIONS"));
        return;
      }
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, release });
    };
    image.onerror = () => {
      release();
      reject(new Error("HTML_IMAGE_DECODE_FAILED"));
    };
    image.src = objectUrl;
  });
}

async function decodeBackgroundImage(file: File) {
  let bitmapError: unknown;
  try {
    return await decodeWithImageBitmap(file);
  } catch (cause) {
    bitmapError = cause;
  }
  try {
    return await decodeWithHtmlImage(file);
  } catch (imageError) {
    throw new BackgroundImageError("decode", "BACKGROUND_IMAGE_DECODE_FAILED", { bitmapError, imageError });
  }
}

function encodeCanvas(canvas: HTMLCanvasElement, mimeType: string, quality?: number) {
  return new Promise<Blob | null>((resolve, reject) => {
    try {
      canvas.toBlob(resolve, mimeType, quality);
    } catch (cause) {
      reject(cause);
    }
  });
}

function outputCandidates(inputMimeType: BackgroundImageMimeType) {
  if (inputMimeType === "image/jpeg") return [["image/jpeg", 0.9], ["image/webp", 0.9]] as const;
  if (inputMimeType === "image/png") return [["image/webp", 0.9], ["image/png", undefined]] as const;
  return [["image/webp", 0.9], ["image/jpeg", 0.9]] as const;
}

export async function prepareBackgroundImage(file: File) {
  const inputMimeType = backgroundImageMimeTypeForFile(file);
  if (!inputMimeType) throw new BackgroundImageError("validation", "BACKGROUND_IMAGE_FORMAT_NOT_ALLOWED");

  const decoded = await decodeBackgroundImage(file);
  try {
    const scale = Math.min(1, 2048 / decoded.width, 1152 / decoded.height);
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new BackgroundImageError("canvas", "BACKGROUND_IMAGE_CANVAS_UNAVAILABLE");
    try {
      context.drawImage(decoded.source, 0, 0, width, height);
    } catch (cause) {
      throw new BackgroundImageError("canvas", "BACKGROUND_IMAGE_CANVAS_DRAW_FAILED", cause);
    }

    const encodeErrors: unknown[] = [];
    for (const [candidateMimeType, quality] of outputCandidates(inputMimeType)) {
      try {
        const blob = await encodeCanvas(canvas, candidateMimeType, quality);
        if (blob && blob.size > 0 && normalizeBackgroundImageMimeType(blob.type)) {
          return {
            blob,
            inputMimeType,
            outputMimeType: normalizeBackgroundImageMimeType(blob.type)!,
            width,
            height,
            lowQuality: decoded.width < 2048 || decoded.height < 1152,
          };
        }
        encodeErrors.push(new Error(`${candidateMimeType}:EMPTY_OR_UNSUPPORTED_OUTPUT`));
      } catch (cause) {
        encodeErrors.push(cause);
      }
    }
    throw new BackgroundImageError("encode", "BACKGROUND_IMAGE_ENCODE_FAILED", encodeErrors);
  } finally {
    decoded.release();
  }
}
