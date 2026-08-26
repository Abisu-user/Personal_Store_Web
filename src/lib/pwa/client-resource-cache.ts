"use client";

/**
 * Per-tab cache for non-credential UI data.  It is intentionally memory-only:
 * leaving the app or signing out clears it, so personal records are never
 * persisted in browser storage merely for faster navigation.
 */
type CacheEntry<T> = { value: T; expiresAt: number };
const resources = new Map<string, CacheEntry<unknown>>();

export function readClientResource<T>(key: string): T | null {
  const entry = resources.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { resources.delete(key); return null; }
  return entry.value;
}

export function writeClientResource<T>(key: string, value: T, maxAgeMs = 5 * 60_000) {
  resources.set(key, { value, expiresAt: Date.now() + maxAgeMs });
}

export function clearClientResources() { resources.clear(); }
