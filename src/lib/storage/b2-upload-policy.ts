import "server-only";

export const b2UploadPurposes = ["workspace-background", "content-cover", "photo", "file", "vault-attachment"] as const;
export type B2UploadPurpose = (typeof b2UploadPurposes)[number];

const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const limits: Record<B2UploadPurpose, number> = {
  "workspace-background": 8_388_608,
  "content-cover": 5_242_880,
  photo: 52_428_800,
  file: 52_428_800,
  "vault-attachment": 52_428_800,
};

export function validateB2UploadPolicy(purpose: B2UploadPurpose, byteSize: number, mimeType: string) {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > limits[purpose]) {
    throw new Error("B2_UPLOAD_SIZE_NOT_ALLOWED");
  }
  if (!mimeType || mimeType.length > 150 || /[\r\n]/.test(mimeType)) {
    throw new Error("B2_UPLOAD_MIME_NOT_ALLOWED");
  }
  if ((purpose === "workspace-background" || purpose === "content-cover" || purpose === "photo") && !imageMimeTypes.has(mimeType)) {
    throw new Error("B2_UPLOAD_MIME_NOT_ALLOWED");
  }
}

export function b2ObjectKey(userId: string, purpose: B2UploadPurpose, objectId: string) {
  return `${userId}/${purpose}/${objectId}`;
}
