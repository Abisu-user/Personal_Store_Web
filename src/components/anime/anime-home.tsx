"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { AnimeHorizontalScroller } from "@/components/anime/anime-horizontal-scroller";
import type { AnimeLibraryItem, ExternalAnime } from "@/lib/anime/types";
import { relativeAiringTime } from "@/lib/anime/relative-airing-time";
import styles from "./anime-home.module.css";

type Catalogue = {
  items: ExternalAnime[];
  page: number;
  hasNextPage: boolean;
  total: number;
  totalExact?: boolean;
};
type DiscoveryHome = {
  current: Catalogue;
  unavailable: string[];
};
type FollowingUpdate = {
  id: string;
  title: string;
  coverUrl: string | null;
  broadcastStatus: string | null;
  latestEpisode: number;
  lastAiredAt: number;
  totalEpisodes: number | null;
};
type FollowingResponse = { items: FollowingUpdate[]; watchingCount: number };

function seasonLabel(anime: ExternalAnime) {
  const season =
    { winter: "冬番", spring: "春番", summer: "夏番", fall: "秋番" }[
      anime.season ?? ""
    ] ?? "本季";
  return `${anime.releaseYear ?? new Date().getFullYear()} ${season}`;
}

function isToday(timestamp: number, nowTimestamp: number) {
  if (!timestamp) return false;
  const target = new Date(timestamp * 1000);
  const now = new Date(nowTimestamp);
  return (
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate()
  );
}

export function AnimeHome({
  library,
  onOpenAnime,
  onOpenLibrary,
  onOpenSchedule,
  onOpenSeason,
}: {
  library: AnimeLibraryItem[];
  onOpenAnime: (id: string) => void;
  onOpenLibrary: () => void;
  onOpenSchedule: () => void;
  onOpenSeason: () => void;
}) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState<FollowingResponse | null>(null);
  const [followingLoading, setFollowingLoading] = useState(true);
  const [followingError, setFollowingError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const watchingIds = useMemo(() =>
    library.filter((anime) => anime.watchStatus === "watching" && !anime.isAdult).map((anime) => anime.id).sort().join(","),
  [library]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/anime/catalogue?view=home&tzOffset=${new Date().getTimezoneOffset()}`,
      );
      const body = (await response
        .json()
        .catch(() => ({}))) as Partial<DiscoveryHome> & { error?: string };
      if (!response.ok || !body.current)
        throw new Error(body.error || "動漫資訊暫時無法載入。");
      setCatalogue(body.current);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "動漫資訊暫時無法載入。",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Loading is scheduled after the effect body so React does not cascade a
    // synchronous state update during mount.
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const loadFollowing = useCallback(async (signal?: AbortSignal) => {
    setFollowingLoading(true);
    setFollowingError(null);
    try {
      const response = await fetch("/api/anime/catalogue?view=following", { signal, cache: "no-store" });
      const body = await response.json() as Partial<FollowingResponse> & { error?: string };
      if (!response.ok || !Array.isArray(body.items)) throw new Error(body.error || "追番更新暫時無法載入。");
      if (!signal?.aborted) setFollowing({ items: body.items, watchingCount: body.watchingCount ?? 0 });
    } catch (cause) {
      if (!signal?.aborted) setFollowingError(cause instanceof Error ? cause.message : "追番更新暫時無法載入。");
    } finally {
      if (!signal?.aborted) setFollowingLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadFollowing(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadFollowing, watchingIds]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void loadFollowing();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [loadFollowing]);

  const seasonalItems = catalogue?.items ?? [];
  const todayRows = following?.items.filter((anime) => isToday(anime.lastAiredAt, now)) ?? [];
  const seasonCount =
    catalogue?.totalExact === false && catalogue.hasNextPage
      ? `${Math.max(catalogue.total, seasonalItems.length)}+`
      : (catalogue?.total ?? 0);

  return (
    <section className={styles.home} aria-label="動漫首頁">
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>
            {seasonalItems[0] ? seasonLabel(seasonalItems[0]) : "本季新番"}
          </p>
          <h2>本季新番與追番資訊</h2>
          <p>快速查看近期播出、今天更新與自己追蹤中的作品。</p>
          <div className={styles.heroActions}>
            <button className="button compact" onClick={onOpenSeason} type="button">查看本季新番</button>
            <button className="secondary-button compact" onClick={onOpenLibrary} type="button">我的收藏</button>
          </div>
        </div>
        <dl className={styles.stats}>
          <div>
            <dt>本季作品</dt>
            <dd>{loading ? "—" : seasonCount}</dd>
          </div>
          <div>
            <dt>今日更新</dt>
            <dd>{followingLoading ? "—" : todayRows.length}</dd>
          </div>
        </dl>
      </section>

      {error && (
        <div className={`notice error ${styles.notice}`}>
          <span>{error}</span>
          <button
            className="secondary-button compact"
            onClick={() => void load()}
            type="button"
          >
            重試
          </button>
        </div>
      )}

      <section className={styles.section}>
        <header>
          <div>
            <p className={styles.eyebrow}>我的追番動態</p>
            <h2>最近更新</h2>
          </div>
          <button onClick={onOpenLibrary} type="button">
            我的收藏
          </button>
        </header>
        {followingError && <div className={`notice error ${styles.notice}`}>
          <span>{followingError}</span>
          <button className="secondary-button compact" onClick={() => void loadFollowing()} type="button">重試</button>
        </div>}
        <AnimeHorizontalScroller aria-label="最近更新動漫" className={styles.rail}>
          {followingLoading &&
            Array.from({ length: 5 }, (_, index) => (
              <div className={styles.skeleton} key={index} />
            ))}
          {!followingLoading &&
            (following?.items ?? []).slice(0, 20).map((anime) => (
                <button
                  className={styles.card}
                  key={anime.id}
                  onClick={() => onOpenAnime(anime.id)}
                  type="button"
                >
                  <div className={styles.cover}>
                    {anime.coverUrl ? (
                      <img
                        alt={`${anime.title} 封面`}
                        decoding="async"
                        loading="lazy"
                        src={anime.coverUrl}
                      />
                    ) : (
                      <span>ANIME</span>
                    )}
                    <small>
                      {anime.broadcastStatus === "RELEASING"
                        ? "連載中"
                        : anime.broadcastStatus === "FINISHED" ? "已完結" : "播出狀態未定"}
                    </small>
                  </div>
                  <div className={styles.copy}>
                    <h3>{anime.title}</h3>
                    <p>{relativeAiringTime(anime.lastAiredAt, now)}</p>
                    <span>更新至第 {anime.latestEpisode} 集{anime.totalEpisodes ? ` · 共 ${anime.totalEpisodes} 集` : ""}</span>
                  </div>
                </button>
            ))}
          {!followingLoading && !followingError && !following?.items.length && (
            <p className={styles.empty}>{following?.watchingCount ? "目前沒有可確認的近期播出動態。" : "目前沒有正在追的作品。將收藏的觀看狀態設為「正在觀看」後，這裡會顯示最新播出動態。"}</p>
          )}
        </AnimeHorizontalScroller>
      </section>

      <section className={styles.shortcuts} aria-label="動漫快速入口">
        <button onClick={onOpenSchedule} type="button">
          <span>
            <AppIcon name="calendar" />
          </span>
          <div>
            <strong>本週時間表</strong>
            <small>依星期查看播出作品</small>
          </div>
          <b>›</b>
        </button>
        <button onClick={onOpenSeason} type="button">
          <span>
            <AppIcon name="anime" />
          </span>
          <div>
            <strong>本季全部新番</strong>
            <small>瀏覽本季完整清單</small>
          </div>
          <b>›</b>
        </button>
      </section>
    </section>
  );
}
