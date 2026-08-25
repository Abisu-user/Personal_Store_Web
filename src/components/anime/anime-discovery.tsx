"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import type { AnimeLibraryItem, ExternalAnime } from "@/lib/anime/types";

type Season = "WINTER" | "SPRING" | "SUMMER" | "FALL";
type Sort = "POPULARITY_DESC" | "SCORE_DESC" | "START_DATE_DESC" | "NEXT_AIRING_EPISODE_DESC" | "TITLE_ROMAJI" | "FAVOURITES_DESC";
type Catalogue = { items: ExternalAnime[]; page: number; hasNextPage: boolean; total: number };
type Taxonomy = { genres: string[]; tags: string[] };
type DiscoveryHome = { current: Catalogue; upcoming: Catalogue; popular: Catalogue; top: Catalogue; taxonomy: Taxonomy; unavailable: string[] };
type Filters = { year: number; season: Season | ""; genre: string; tag: string; format: string; status: string; sort: Sort };

const seasons: { key: Season; label: string }[] = [{ key: "WINTER", label: "冬番" }, { key: "SPRING", label: "春番" }, { key: "SUMMER", label: "夏番" }, { key: "FALL", label: "秋番" }];
const formats = [["", "全部格式"], ["TV", "TV"], ["MOVIE", "劇場版"], ["OVA", "OVA"], ["ONA", "ONA"], ["SPECIAL", "特別篇"]];
const statuses = [["", "全部狀態"], ["RELEASING", "連載中"], ["FINISHED", "已完結"], ["NOT_YET_RELEASED", "尚未播出"]];
const sorts: [Sort, string][] = [["POPULARITY_DESC", "熱門"], ["SCORE_DESC", "評分最高"], ["START_DATE_DESC", "最新"], ["NEXT_AIRING_EPISODE_DESC", "最近播出"], ["TITLE_ROMAJI", "名稱"], ["FAVOURITES_DESC", "人氣"]];
const names: Record<string, string> = { Action: "動作", Adventure: "冒險", Comedy: "喜劇", Drama: "劇情", Fantasy: "奇幻", Romance: "戀愛", "Sci-Fi": "科幻", Sports: "運動", Mystery: "推理", Supernatural: "超自然", "Slice of Life": "日常", Music: "音樂", Psychological: "心理", Isekai: "異世界", Reincarnation: "轉生", School: "校園", Magic: "魔法", "Time Travel": "時間旅行", Vampire: "吸血鬼", Mecha: "機器人", Military: "戰爭", Dungeon: "地下城" };
const cn = (value: string) => names[value] ?? value;
const state = (value: string | null) => ({ RELEASING: "連載中", FINISHED: "已完結", NOT_YET_RELEASED: "尚未播出", HIATUS: "暫停播出", CANCELLED: "已取消" }[value ?? ""] ?? "資訊待定");

function nowSeason() {
  const date = new Date(); const month = date.getMonth() + 1;
  return { season: (month <= 3 ? "WINTER" : month <= 6 ? "SPRING" : month <= 9 ? "SUMMER" : "FALL") as Season, year: date.getFullYear() };
}
function followingSeason() {
  const current = nowSeason(); const at = seasons.findIndex((item) => item.key === current.season);
  return { season: seasons[(at + 1) % seasons.length]!.key, year: current.year + (current.season === "FALL" ? 1 : 0) };
}
function seasonName(value: Season, year: number) { return String(year) + " " + (seasons.find((item) => item.key === value)?.label ?? ""); }
function query(values: Record<string, string | number | undefined>) {
  const result = new URLSearchParams(); Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== "") result.set(key, String(value)); });
  return result.toString();
}
async function get<T>(url: string) {
  const response = await fetch(url); const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "動漫資料暫時無法載入。");
  return body as T;
}

export function AnimeDiscovery({ library, onAdd, onSearch }: { library: AnimeLibraryItem[]; onAdd: (anime: ExternalAnime) => void; onSearch: (query: string) => void }) {
  const current = useMemo(nowSeason, []); const next = useMemo(followingSeason, []);
  const [thisSeason, setThisSeason] = useState<ExternalAnime[]>([]);
  const [nextSeason, setNextSeason] = useState<ExternalAnime[]>([]);
  const [popular, setPopular] = useState<ExternalAnime[]>([]);
  const [highest, setHighest] = useState<ExternalAnime[]>([]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy>({ genres: [], tags: [] });
  const [screen, setScreen] = useState<"home" | "all">("home");
  const [filters, setFilters] = useState<Filters>({ year: current.year, season: current.season, genre: "", tag: "", format: "", status: "", sort: "POPULARITY_DESC" });
  const [filterDraft, setFilterDraft] = useState<Filters>(filters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [all, setAll] = useState<ExternalAnime[]>([]);
  const [page, setPage] = useState(0); const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); const [detail, setDetail] = useState<ExternalAnime | null>(null);
  const [homeSearch, setHomeSearch] = useState("");
  const [homeLoading, setHomeLoading] = useState(true);
  const seen = useRef(""); const sentinel = useRef<HTMLDivElement>(null);
  const hasItem = useCallback((anime: ExternalAnime) => library.some((item) => item.title.trim().toLocaleLowerCase() === anime.title.trim().toLocaleLowerCase()), [library]);

  const reloadHome = useCallback(async () => {
    try {
      setError(null); setHomeLoading(true);
      const answer = await get<DiscoveryHome>("/api/anime/catalogue?view=home");
      setThisSeason(answer.current.items); setNextSeason(answer.upcoming.items); setPopular(answer.popular.items); setHighest(answer.top.items); setTaxonomy(answer.taxonomy);
      if (answer.unavailable.length === 5) setError("動漫資料暫時無法載入，請稍後再試。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "動漫資料暫時無法載入。"); }
    finally { setHomeLoading(false); }
  }, []);
  useEffect(() => { void reloadHome(); }, [reloadHome]);

  const load = useCallback(async (requestedPage: number, replace = false) => {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const response = await get<Catalogue>("/api/anime/catalogue?" + query({ page: requestedPage, perPage: 24, season: filters.season || undefined, seasonYear: filters.season ? filters.year : undefined, genre: filters.genre || undefined, tag: filters.tag || undefined, format: filters.format || undefined, status: filters.status || undefined, sort: filters.sort }));
      setAll((currentRows) => replace ? response.items : currentRows.concat(response.items.filter((anime) => !currentRows.some((row) => row.id === anime.id))));
      setPage(response.page); setHasMore(response.hasNextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "動漫資料暫時無法載入。"); }
    finally { setLoading(false); }
  }, [filters, loading]);
  const filterHash = JSON.stringify(filters);
  useEffect(() => { if (screen !== "all" || seen.current === filterHash) return; seen.current = filterHash; void load(1, true); }, [filterHash, load, screen]);
  useEffect(() => {
    if (screen !== "all" || !hasMore || loading || !sentinel.current) return;
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) void load(page + 1); }, { rootMargin: "320px" });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [hasMore, load, loading, page, screen]);
  const openAll = (update?: Partial<Filters>) => { const value = { ...filters, ...update }; setFilters(value); setFilterDraft(value); seen.current = ""; setScreen("all"); };
  const apply = () => { setFilters(filterDraft); seen.current = ""; setFilterOpen(false); };

  return <section className="anime-discovery">
    <div className="anime-discovery-tabs"><button className={screen === "home" ? "active" : ""} onClick={() => setScreen("home")} type="button">探索首頁</button><button className={screen === "all" ? "active" : ""} onClick={() => openAll()} type="button">全部動漫</button></div>
    {error && <div className="notice error anime-catalogue-error"><span>{error}</span><button className="secondary-button compact" onClick={() => void (screen === "home" ? reloadHome() : load(1, true))} type="button">重試</button></div>}
    {screen === "home" && <><section className="anime-discovery-hero"><div><p className="eyebrow">ANIME DISCOVER</p><h2>探索正在播出的好作品</h2><p>本季、下季、熱門與高評分作品都從同一個 Anime Metadata Provider 取得；只有加入後才會寫入你的私人動漫庫。</p><form className="anime-discovery-search" onSubmit={(event) => { event.preventDefault(); if (homeSearch.trim().length >= 2) onSearch(homeSearch.trim()); }}><input aria-label="搜尋動漫資料庫" onChange={(event) => setHomeSearch(event.target.value)} placeholder="搜尋動漫名稱…" value={homeSearch} /><button className="button compact" type="submit">搜尋</button></form></div><button className="secondary-button" onClick={() => openAll()} type="button">瀏覽全部動漫 →</button></section>
      <Rail loading={homeLoading} title={"本季新番 · " + seasonName(current.season, current.year)} items={thisSeason} hasItem={hasItem} onAdd={onAdd} onDetail={setDetail} />
      <Rail loading={homeLoading} title={"下季新番 · " + seasonName(next.season, next.year)} items={nextSeason} hasItem={hasItem} onAdd={onAdd} onDetail={setDetail} />
      <Rail loading={homeLoading} title="熱門動漫" items={popular} hasItem={hasItem} onAdd={onAdd} onDetail={setDetail} />
      <Rail loading={homeLoading} title="高評分動漫" items={highest} hasItem={hasItem} onAdd={onAdd} onDetail={setDetail} />
      <section className="anime-genre-section"><div><p className="eyebrow">GENRES & TAGS</p><h2>類型分類</h2><p>Genre 與 Tag 分開處理，清單由 AniList 動態取得。</p></div><div className="anime-genre-pills">{taxonomy.genres.slice(0, 18).map((genre) => <button key={genre} onClick={() => openAll({ genre, tag: "" })} type="button">{cn(genre)}</button>)}</div><div className="anime-tag-pills">{taxonomy.tags.slice(0, 16).map((tag) => <button key={tag} onClick={() => openAll({ tag, genre: "" })} type="button">#{cn(tag)}</button>)}</div></section>
    </>}
    {screen === "all" && <><div className="anime-all-heading"><div><p className="eyebrow">ANIME CATALOGUE</p><h2>全部動漫</h2><p>每次載入 24 部，滑到底部會自動載入下一頁。</p></div><button className="secondary-button" onClick={() => setFilterOpen(true)} type="button">篩選與排序</button></div><div className="anime-active-filters">{filters.season && <span>{seasonName(filters.season, filters.year)}</span>}{filters.genre && <span>{cn(filters.genre)}</span>}{filters.tag && <span>#{cn(filters.tag)}</span>}<span>{sorts.find((item) => item[0] === filters.sort)?.[1]}</span></div><div className="anime-discovery-grid">{all.map((anime) => <Card anime={anime} added={hasItem(anime)} key={anime.id} onAdd={onAdd} onDetail={setDetail} />)}</div>{loading && <p className="anime-catalogue-loading">正在載入動漫…</p>}<div className="anime-catalogue-sentinel" ref={sentinel} />{!loading && !hasMore && all.length > 0 && <p className="anime-catalogue-end">已經到底了。</p>}</>}
    {detail && <Detail anime={detail} added={hasItem(detail)} onAdd={() => { onAdd(detail); setDetail(null); }} onClose={() => setDetail(null)} />}
    <ModalDialog onClose={() => setFilterOpen(false)} open={filterOpen} title="篩選動漫"><div className="anime-filter-sheet"><label>年份<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, year: Number(event.target.value) }))} value={filterDraft.year}>{Array.from({ length: 18 }, (_, index) => new Date().getFullYear() - index).map((year) => <option key={year} value={year}>{year}</option>)}</select></label><label>季度<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, season: event.target.value as Season | "" }))} value={filterDraft.season}><option value="">不限季度</option>{seasons.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>類型<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, genre: event.target.value, tag: "" }))} value={filterDraft.genre}><option value="">不限類型</option>{taxonomy.genres.map((genre) => <option key={genre} value={genre}>{cn(genre)}</option>)}</select></label><label>Tag<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, tag: event.target.value, genre: "" }))} value={filterDraft.tag}><option value="">不限 Tag</option>{taxonomy.tags.map((tag) => <option key={tag} value={tag}>{cn(tag)}</option>)}</select></label><label>格式<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, format: event.target.value }))} value={filterDraft.format}>{formats.map((item) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}</select></label><label>播出狀態<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, status: event.target.value }))} value={filterDraft.status}>{statuses.map((item) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}</select></label><label>排序<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, sort: event.target.value as Sort }))} value={filterDraft.sort}>{sorts.map((item) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}</select></label><div className="dialog-actions"><button className="secondary-button" onClick={() => setFilterDraft({ year: current.year, season: current.season, genre: "", tag: "", format: "", status: "", sort: "POPULARITY_DESC" })} type="button">重設</button><button className="button" onClick={apply} type="button">套用</button></div></div></ModalDialog>
  </section>;
}

function Rail({ title, items, loading, hasItem, onAdd, onDetail }: { title: string; items: ExternalAnime[]; loading: boolean; hasItem: (anime: ExternalAnime) => boolean; onAdd: (anime: ExternalAnime) => void; onDetail: (anime: ExternalAnime) => void }) {
  return <section className="anime-rail-section"><div className="anime-rail-heading"><h2>{title}</h2><span>{loading ? "載入中…" : items.length ? String(items.length) + " 部" : "目前沒有作品"}</span></div><div className="anime-rail">{items.map((anime) => <Card anime={anime} added={hasItem(anime)} key={anime.id} onAdd={onAdd} onDetail={onDetail} />)}{!loading && !items.length && <p className="anime-rail-empty">暫時沒有可顯示的作品。</p>}</div></section>;
}
function Card({ anime, added, onAdd, onDetail }: { anime: ExternalAnime; added: boolean; onAdd: (anime: ExternalAnime) => void; onDetail: (anime: ExternalAnime) => void }) {
  return <article className="anime-catalogue-card"><button className="anime-catalogue-main" onClick={() => onDetail(anime)} type="button">{anime.coverUrl ? <img alt={anime.title + " 封面"} src={anime.coverUrl} /> : <div className="anime-catalogue-cover-fallback">ANIME</div>}<div><span>{state(anime.broadcastStatus)}</span><h3>{anime.title}</h3><p>{anime.publicScore ? "★ " + anime.publicScore.toFixed(1) : "尚無評分"} · {anime.episodes ? String(anime.episodes) + " 集" : "集數待定"}</p><small>{anime.animeType ?? "ANIME"}</small></div></button><button className={added ? "secondary-button compact added" : "button compact"} disabled={added} onClick={() => onAdd(anime)} type="button">{added ? "✓ 已加入" : "＋ 加入"}</button></article>;
}
function Detail({ anime, added, onClose, onAdd }: { anime: ExternalAnime; added: boolean; onClose: () => void; onAdd: () => void }) {
  return <ModalDialog onClose={onClose} open title="動漫詳細資訊"><div className="anime-external-detail"><div className="anime-external-hero">{anime.bannerUrl && <img alt="" src={anime.bannerUrl} />}<div>{anime.coverUrl ? <img alt="" src={anime.coverUrl} /> : <div>ANIME</div>}<div><span>{state(anime.broadcastStatus)}</span><h2>{anime.title}</h2><p>{[anime.titleJapanese, anime.titleEnglish].filter(Boolean).join(" · ")}</p><strong>{anime.publicScore ? "★ " + anime.publicScore.toFixed(1) : "尚無評分"} · {anime.episodes ? String(anime.episodes) + " 集" : "集數待定"}</strong></div></div></div>{anime.genres.length > 0 && <div className="anime-tags">{anime.genres.map((genre) => <span key={genre}>{cn(genre)}</span>)}</div>}{anime.synopsis && <section><h3>劇情介紹</h3><p>{anime.synopsis}</p></section>}<div className="dialog-actions"><button className="secondary-button" onClick={onClose} type="button">關閉</button><button className="button" disabled={added} onClick={onAdd} type="button">{added ? "✓ 已加入我的動漫" : "＋ 加入我的動漫"}</button></div></div></ModalDialog>;
}
