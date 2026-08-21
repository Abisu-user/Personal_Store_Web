import "server-only";

import { createHash, pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FolderLockKind, FolderLockMode } from "@/lib/folder-locks/types";

const pbkdf2 = promisify(pbkdf2Callback);
const iterations = 210_000;
const unlockLifetimeSeconds = 8 * 60 * 60;

type LockRow = { id: string; folder_id: string; password_mode: FolderLockMode; locked_until: string | null };

export function folderUnlockCookieName(lockId: string) { return `personal-vault-folder-unlock-${lockId}`; }
export function makeSalt() { return randomBytes(16).toString("base64url"); }
export function makeUnlockToken() { return randomBytes(32).toString("base64url"); }
export function hashUnlockToken(token: string) { return createHash("sha256").update(token).digest("hex"); }

export async function hashFolderPassword(password: string, salt: string) {
  return (await pbkdf2(password, salt, iterations, 32, "sha256")).toString("base64url");
}

export async function verifyFolderPassword(password: string, salt: string, expectedHash: string) {
  const actual = await hashFolderPassword(password, salt);
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expectedHash);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function validateFolderPassword(mode: FolderLockMode, password: string) {
  if (mode === "pin4") return /^\d{4}$/.test(password);
  if (mode === "pin6") return /^\d{6}$/.test(password);
  return password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password) && /[^A-Za-z\d\s]/.test(password);
}

export async function folderExists(ownerId: string, kind: FolderLockKind, folderId: string) {
  const admin = createAdminClient();
  const query = kind === "bookmark"
    ? admin.from("bookmark_folders").select("id").eq("id", folderId).eq("owner_id", ownerId)
    : admin.from("content_folders").select("id").eq("id", folderId).eq("owner_id", ownerId).eq("content_kind", kind);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function getFolderLockState(ownerId: string, kind: FolderLockKind) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("folder_locks")
    .select("id, folder_id, password_mode, locked_until")
    .eq("owner_id", ownerId)
    .eq("folder_kind", kind);
  if (error?.code === "42P01") return { locks: new Map<string, LockRow>(), unlockedFolderIds: new Set<string>() };
  if (error) throw error;
  const locks = (data ?? []) as LockRow[];
  if (!locks.length) return { locks: new Map<string, LockRow>(), unlockedFolderIds: new Set<string>() };

  const cookieStore = await cookies();
  const supplied = locks.flatMap((lock) => {
    const token = cookieStore.get(folderUnlockCookieName(lock.id))?.value;
    return token ? [{ lockId: lock.id, tokenHash: hashUnlockToken(token) }] : [];
  });
  if (!supplied.length) return { locks: new Map(locks.map((lock) => [lock.folder_id, lock])), unlockedFolderIds: new Set<string>() };

  const { data: sessions, error: sessionError } = await admin
    .from("folder_unlock_sessions")
    .select("folder_lock_id, token_hash")
    .eq("owner_id", ownerId)
    .in("folder_lock_id", supplied.map((item) => item.lockId))
    .in("token_hash", supplied.map((item) => item.tokenHash))
    .gt("expires_at", new Date().toISOString());
  if (sessionError) throw sessionError;
  const valid = new Set((sessions ?? []).map((session) => `${session.folder_lock_id}:${session.token_hash}`));
  return {
    locks: new Map(locks.map((lock) => [lock.folder_id, lock])),
    unlockedFolderIds: new Set(locks.filter((lock) => supplied.some((item) => item.lockId === lock.id && valid.has(`${lock.id}:${item.tokenHash}`))).map((lock) => lock.folder_id)),
  };
}

export function getUnlockExpiry() { return new Date(Date.now() + unlockLifetimeSeconds * 1000); }
export { unlockLifetimeSeconds };
