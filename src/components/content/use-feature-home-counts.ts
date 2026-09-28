"use client";

import { useCallback, useEffect, useState } from "react";
import type { Note } from "@/lib/notes/types";
import type { StoredPhoto } from "@/lib/photos/types";
import type { StoredFile } from "@/lib/files/types";

export type FeatureHomeCounts = { total: number | null; month: number | null; unorganized: number | null; weekUpdated: number | null; storageUsedBytes: number | null; recentEntries: (Note | StoredPhoto | StoredFile)[] | null };

async function requestCounts(kind: "bookmark" | "note" | "photo" | "file") {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const response = await fetch(`/api/feature-home?kind=${kind}&monthStart=${encodeURIComponent(monthStart)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Summary unavailable");
  return response.json() as Promise<FeatureHomeCounts>;
}

export function useFeatureHomeCounts(kind: "bookmark" | "note" | "photo" | "file") {
  const [counts, setCounts] = useState<FeatureHomeCounts | null>(null);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const value = await requestCounts(kind);
      setCounts(value);
      setFailed(false);
    } catch {
      setCounts(null);
      setFailed(true);
    }
  }, [kind]);
  useEffect(() => {
    let active = true;
    void requestCounts(kind).then((value) => {
      if (!active) return;
      setCounts(value);
      setFailed(false);
    }).catch(() => {
      if (!active) return;
      setCounts(null);
      setFailed(true);
    });
    return () => { active = false; };
  }, [kind]);
  return { counts, failed, refresh };
}
