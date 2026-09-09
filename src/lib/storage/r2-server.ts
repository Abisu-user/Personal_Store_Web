import "server-only";

import { StorageManager } from "./manager";
import { R2StorageProvider } from "./r2-provider";

function required(name: "R2_ACCOUNT_ID" | "R2_ACCESS_KEY_ID" | "R2_SECRET_ACCESS_KEY" | "R2_BUCKET_NAME") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

/** Phase 3 isolated composition root. No production feature imports this yet. */
export function createR2StorageManager() {
  return new StorageManager(new R2StorageProvider({
    accountId: required("R2_ACCOUNT_ID"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    bucket: required("R2_BUCKET_NAME"),
  }));
}
