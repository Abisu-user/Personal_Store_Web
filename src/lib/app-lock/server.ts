import "server-only";

import { pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(pbkdf2Callback);
const iterations = 210_000;

export type AppLockPinMode = "pin4" | "pin6";

export function validateAppLockPin(mode: AppLockPinMode, pin: string) {
  return mode === "pin4" ? /^\d{4}$/.test(pin) : /^\d{6}$/.test(pin);
}

export function makeAppLockSalt() {
  return randomBytes(16).toString("base64url");
}

export async function hashAppLockPin(pin: string, salt: string) {
  return (await pbkdf2(pin, salt, iterations, 32, "sha256")).toString("base64url");
}

export async function verifyAppLockPin(pin: string, salt: string, expectedHash: string) {
  const actual = Buffer.from(await hashAppLockPin(pin, salt));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
