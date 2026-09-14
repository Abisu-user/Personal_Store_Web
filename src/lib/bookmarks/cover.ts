import type { Bookmark } from "./types";

export type ResolvedBookmarkCover = {
  primary: string | null;
  fallback: string | null;
  source: "custom" | "website" | "placeholder";
};

/**
 * One cover priority for every bookmark presentation:
 * user cover -> fetched website preview/favicon -> local placeholder.
 */
export function resolveBookmarkCover(bookmark: Bookmark): ResolvedBookmarkCover {
  const custom = bookmark.coverImageUrl?.trim() || null;
  const website = bookmark.detail?.favicon_url?.trim() || null;
  if (custom) {
    return {
      primary: custom,
      fallback: website && website !== custom ? website : null,
      source: "custom",
    };
  }
  if (website) return { primary: website, fallback: null, source: "website" };
  return { primary: null, fallback: null, source: "placeholder" };
}
