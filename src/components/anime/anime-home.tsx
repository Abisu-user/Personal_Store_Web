"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import type { AnimeLibraryItem, ExternalAnime } from "@/lib/anime/types";
import styles from "./anime-home.module.css";

type Catalogue = { items: ExternalAnime[]; page: number; hasNextPage: boolean; total: number };
type DiscoveryHome = { current: Catalogue; unavailable: string[] };

const displayTitle = (anime: ExternalAnime) => anime.titleChinese ?? anime.titleJapanese ?? anime.title;
const normalized = (value: string | null | undefined) => (value ?? "").normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
const titleKeys = (anime: Pick<ExternalAnime | AnimeLibraryItem, "title" | "titleChinese" | "titleJapanese" | "titleEnglish" | "originalTitle">) =>
  [anime.title, anime.titleChinese, anime.titleJapanese, anime.titleEnglish, anime.originalTitle].map(normalized).filter(Boolean);

function seasonLabel(anime: ExternalAnime) {
  const season = { winter: "冬番", spring: "春番", summer: "夏番", fall: "秋番" }[anime.season ?? ""] ?? "本季";
  return `${anime.releaseYear ?? new Date().getFullYear()} ${season}`;
}

function airingText(anime: ExternalAnime) {
  const airing = anime.nextAiringEpisode;
  if (!airing) return anime.broadcastStatus === "FINISHED" ? "已完結" : "播出資訊待定";
  const difference = airing.airingAt * 1000 - Date.now();
  if (difference <= 0) return `第 ${airing.episode} 集已播出`;
  const hours = Math.ceil(difference / 3_600_000);
  if (hours < 24) return `${hours} 小時後播出第 ${airing.episode} 集`;
  const days = Math.ceil(hours / 24);
  return `${days} 天後播出第 ${airing.episode} 集`;
}

function isToday(timestamp: number | undefined) {
  if (!timestamp) return false;
  const target = new Date(timestamp * 1000);
  const now = new Date();
  return target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth() && target.getDate() === now.getDate();
}

export function AnimeHome({
  library,
  onAdd,
  onOpenSchedule,
  onOpenSeason,
}: {
  library: AnimeLibraryItem[];
  onAdd: (anime: ExternalAnime) => void | Promise<void>;
  onOpenSchedule: () => void;
  onOpenSeason: () => void;
}) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/anime/catalogue?view=home");
      const body = await response.json().catch(() => ({})) as Partial<DiscoveryHome> & { error?: string };
      if (!response.ok || !body.current) throw new Error(body.error || "動漫資訊暫時無法載入。");
      setCatalogue(body.current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "動漫資訊暫時無法載入。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Loading is scheduled after the effect body so React does not cascade a
    // synchronous state update during mount.
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const saved = useMemo(() => {
    const external = new Set(library.map((anime) => `${anime.externalSource}:${anime.externalId}`));
    const titles = new Set(library.flatMap(titleKeys));
    return (anime: ExternalAnime) => external.has(`${anime.source}:${anime.id}`) || titleKeys(anime).some((title) => titles.has(title));
  }, [library]);

  const items = catalogue?.items ?? [];
  const todayRows = items.filter((anime) => isToday(anime.nextAiringEpisode?.airingAt));
  const followedToday = todayRows.filter(saved);

  return <section className={styles.home} aria-label="動漫首頁">
    <section className={styles.hero}>
      <div>
        <p className={styles.eyebrow}>{items[0] ? seasonLabel(items[0]) : "本季新番"}</p>
        <h2>本季新番與追番資訊</h2>
        <p>快速查看近期播出、今天更新與自己追蹤中的作品。</p>
      </div>
      <dl className={styles.stats}>
        <div><dt>本季作品</dt><dd>{loading ? "—" : catalogue?.total ?? 0}</dd></div>
        <div><dt>今日更新</dt><dd>{loading ? "—" : todayRows.length}</dd></div>
        <div><dt>我的追番</dt><dd>{loading ? "—" : followedToday.length}</dd></div>
      </dl>
    </section>

    {error && <div className={`notice error ${styles.notice}`}><span>{error}</span><button className="secondary-button compact" onClick={() => void load()} type="button">重試</button></div>}

    <section className={styles.section}>
      <header><div><p className={styles.eyebrow}>近期播出</p><h2>最近更新</h2></div><button onClick={onOpenSeason} type="button">查看全部</button></header>
      <div className={styles.rail}>
        {loading && Array.from({ length: 5 }, (_, index) => <div className={styles.skeleton} key={index} />)}
        {!loading && items.slice(0, 20).map((anime) => {
          const isSaved = saved(anime);
          return <article className={styles.card} key={`${anime.source}-${anime.id}`}>
            <div className={styles.cover}>{anime.coverUrl ? <img alt={`${displayTitle(anime)} 封面`} decoding="async" loading="lazy" src={anime.coverUrl} /> : <span>ANIME</span>}<small>{anime.broadcastStatus === "RELEASING" ? "連載中" : anime.broadcastStatus === "NOT_YET_RELEASED" ? "即將播出" : "已完結"}</small></div>
            <div className={styles.copy}><h3>{displayTitle(anime)}</h3><p>{airingText(anime)}</p><span>{anime.nextAiringEpisode ? `下一集 · 第 ${anime.nextAiringEpisode.episode} 集` : anime.episodes ? `全 ${anime.episodes} 集` : "集數待定"}</span></div>
            <button className={isSaved ? styles.saved : styles.add} disabled={isSaved || addingId === anime.id} onClick={async () => { setAddingId(anime.id); try { await onAdd(anime); } catch { /* The workspace already reports and rolls back the failed save. */ } finally { setAddingId(null); } }} type="button">{isSaved ? "✓ 已收藏" : addingId === anime.id ? "加入中…" : "＋ 加入收藏"}</button>
          </article>;
        })}
        {!loading && !items.length && !error && <p className={styles.empty}>目前沒有可顯示的本季作品。</p>}
      </div>
    </section>

    <section className={styles.shortcuts} aria-label="動漫快速入口">
      <button onClick={onOpenSchedule} type="button"><span><AppIcon name="calendar" /></span><div><strong>本週時間表</strong><small>依星期查看播出作品</small></div><b>›</b></button>
      <button onClick={onOpenSeason} type="button"><span><AppIcon name="anime" /></span><div><strong>本季全部新番</strong><small>瀏覽本季完整清單</small></div><b>›</b></button>
    </section>
  </section>;
}
