import "server-only";

import { B2StorageProvider } from "./b2-provider";
import { StorageManager } from "./manager";

type B2EnvironmentName = "B2_ENDPOINT" | "B2_REGION" | "B2_ACCESS_KEY_ID" | "B2_SECRET_ACCESS_KEY" | "B2_BUCKET_NAME";

function required(name: B2EnvironmentName) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

/** Phase 3 isolated composition root. No production feature imports this yet. */
export function createB2StorageManager() {
  return new StorageManager(new B2StorageProvider({
    endpoint: required("B2_ENDPOINT"),
    region: required("B2_REGION"),
    accessKeyId: required("B2_ACCESS_KEY_ID"),
    secretAccessKey: required("B2_SECRET_ACCESS_KEY"),
    bucket: required("B2_BUCKET_NAME"),
  }));
}
