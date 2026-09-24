export type WatchSourceMatchState = {
  anime_id: string;
  status: "unknown" | "matching" | "matched" | "not_found" | "ambiguous" | "error";
  match_version: number;
  checked_at: string | null;
};

export const WATCH_SOURCE_ERROR_RETRY_MS = 30 * 60_000;
export const WATCH_SOURCE_MATCHING_STALE_MS = 10 * 60_000;

export function shouldMatchWatchSource(state: WatchSourceMatchState, now: number, currentVersion: number) {
  if (state.status === "unknown") return true;
  if (state.status === "not_found" || state.status === "ambiguous") return state.match_version < currentVersion;
  if (state.status === "matched") return false;
  const retryAfter = state.status === "matching"
    ? WATCH_SOURCE_MATCHING_STALE_MS : WATCH_SOURCE_ERROR_RETRY_MS;
  return !state.checked_at || Date.parse(state.checked_at) + retryAfter <= now;
}
