"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import type { AnimeLibraryItem, ExternalAnime } from "@/lib/anime/types";

type Season = "WINTER" | "SPRING" | "SUMMER" | "FALL";
type Sort = "POPULARITY_DESC" | "SCORE_DESC" | "START_DATE_DESC" | "NEXT_AIRING_EPISODE_DESC" | "TITLE_ROMAJI" | "FAVOURITES_DESC";
type Catalogue = { items: ExternalAnime[]; page: number; hasNextPage: boolean; total: number };
type Taxonomy = { genres: string[]; tags: string[] };
type DiscoveryHome = { current: Catalogue; upcoming: Catalogue; popular: Catalogue; top: Catalogue; taxonomy: Taxonomy; unavailable: string[] };
type Filters = { year: number | null; season: Season | ""; genre: string; tag: string; format: string; status: string; sort: Sort };

const seasons: { key: Season; label: string }[] = [{ key: "WINTER", label: "冬番" }, { key: "SPRING", label: "春番" }, { key: "SUMMER", label: "夏番" }, { key: "FALL", label: "秋番" }];
const formats = [["", "全部格式"], ["TV", "電視動畫"], ["MOVIE", "劇場版"], ["OVA", "原創動畫錄影帶"], ["ONA", "網路動畫"], ["SPECIAL", "特別篇"]];
const statuses = [["", "全部狀態"], ["RELEASING", "連載中"], ["FINISHED", "已完結"], ["NOT_YET_RELEASED", "尚未播出"]];
const sorts: [Sort, string][] = [["POPULARITY_DESC", "熱門"], ["SCORE_DESC", "評分最高"], ["START_DATE_DESC", "最新"], ["NEXT_AIRING_EPISODE_DESC", "最近播出"], ["TITLE_ROMAJI", "名稱"], ["FAVOURITES_DESC", "人氣"]];
const names: Record<string, string> = { Action: "動作", Adventure: "冒險", Comedy: "喜劇", Drama: "劇情", Fantasy: "奇幻", Romance: "戀愛", "Sci-Fi": "科幻", Sports: "運動", Mystery: "推理", Supernatural: "超自然", "Slice of Life": "日常", Music: "音樂", Psychological: "心理", Isekai: "異世界", Reincarnation: "轉生", School: "校園", Magic: "魔法", "Time Travel": "時間旅行", Vampire: "吸血鬼", Mecha: "機器人", Military: "戰爭", Dungeon: "地下城", Ecchi: "福利", Hentai: "成人", Horror: "恐怖", "Mahou Shoujo": "魔法少女", "4-koma": "四格漫畫", "Age Gap": "年齡差", "Alternate Universe": "平行宇宙", "Artificial Intelligence": "人工智慧", "Coming of Age": "成長", "Family Life": "家庭", "Female Protagonist": "女性主角", "Male Protagonist": "男性主角", "Martial Arts": "武術", "School Club": "社團", "Shounen": "少年向", "Shoujo": "少女向", "Super Power": "超能力", "Video Game": "電玩", "Work": "職場" };
Object.assign(names, { "Primarily Teen Cast": "以青少年為主角", "Primarily Female Cast": "以女性為主角", "Primarily Male Cast": "以男性為主角", "Urban Fantasy": "都市奇幻", "Battle Royale": "大逃殺", "Boys' Love": "男男戀愛", "Girls' Love": "女女戀愛", "Cute Girls Doing Cute Things": "可愛女孩日常", Historical: "歷史", "Historical Fantasy": "歷史奇幻", Parody: "惡搞", Paranormal: "靈異", "Post-Apocalyptic": "後末日", "School Life": "校園生活", Space: "太空", Survival: "生存", Tragedy: "悲劇", "Virtual World": "虛擬世界", "Virtual Reality": "虛擬實境", War: "戰爭", Workplace: "職場", Yakuza: "黑道", Youkai: "妖怪", Zombies: "殭屍", "Body Swapping": "身體交換", Detective: "偵探", Crime: "犯罪", Cultivation: "修仙", Demons: "惡魔", Dragons: "龍", "Fairy Tale": "童話", Food: "美食", Gambling: "賭博", Harem: "後宮", Idol: "偶像", Iyashikei: "療癒", "Kingdom Management": "領地經營", "Love Triangle": "三角戀", Medical: "醫療", Mafia: "黑手黨", "Monster Girl": "怪物娘", Ninja: "忍者", "Otaku Culture": "御宅文化", Pirates: "海盜", Politics: "政治", Police: "警察", Revenge: "復仇", Robots: "機器人", "Royal Affairs": "王室", Samurai: "武士", Seinen: "青年向", Shapeshifting: "變身", "Space Opera": "太空歌劇", Steampunk: "蒸汽龐克", Swordplay: "劍術", Terrorism: "恐怖攻擊", Training: "訓練", Travel: "旅行", Witch: "魔女", Writing: "寫作", Afterlife: "死後世界", Aliens: "外星人", Alchemy: "鍊金術", Animals: "動物", Angels: "天使", Assassin: "刺客", Band: "樂團", Baseball: "棒球", Basketball: "籃球", Bullying: "霸凌", "Card Battle": "卡牌對戰", Cars: "汽車", CGI: "3D 動畫", Cyberpunk: "賽博龐克", Delinquents: "不良少年", "Gender Bending": "性別轉換", Ghost: "幽靈", Gods: "神明", "Hand to Hand Combat": "徒手格鬥", "High Stakes Game": "高風險遊戲", "Lost Civilization": "失落文明", "Memory Manipulation": "記憶操控", Mermaid: "人魚", Musical: "音樂劇", Mythology: "神話", "Organized Crime": "組織犯罪", Philosophy: "哲學", Photography: "攝影", Prison: "監獄", Religion: "宗教", Restaurant: "餐廳", Rivalries: "競爭對手", Rural: "鄉村", Satire: "諷刺", "Social Commentary": "社會評論", "Software Development": "軟體開發", "Space Travel": "太空旅行", Tennis: "網球", Theater: "戲劇", Tokusatsu: "特攝", Tournament: "錦標賽", Tsundere: "傲嬌", Urban: "都市", Villainess: "惡役千金", "Voice Acting": "聲優", Volleyball: "排球", VTuber: "虛擬 YouTuber" });
const cn = (value: string) => names[value] ?? value;
const displayTitle = (anime: ExternalAnime) => anime.titleChinese ?? anime.titleJapanese ?? anime.title;
const state = (value: string | null) => ({ RELEASING: "連載中", FINISHED: "已完結", NOT_YET_RELEASED: "尚未播出", HIATUS: "暫停播出", CANCELLED: "已取消" }[value ?? ""] ?? "資訊待定");
const formatName = (value: string | null) => formats.find((item) => item[0] === value)?.[1] ?? (value === "ANIME" || !value ? "動畫" : value);

function nowSeason() {
  const date = new Date(); const month = date.getMonth() + 1;
  return { season: (month <= 3 ? "WINTER" : month <= 6 ? "SPRING" : month <= 9 ? "SUMMER" : "FALL") as Season, year: date.getFullYear() };
}
function followingSeason() {
  const current = nowSeason(); const at = seasons.findIndex((item) => item.key === current.season);
  return { season: seasons[(at + 1) % seasons.length]!.key, year: current.year + (current.season === "FALL" ? 1 : 0) };
}
function seasonName(value: Season, year: number | null) { return year ? String(year) + " " + (seasons.find((item) => item.key === value)?.label ?? "") : (seasons.find((item) => item.key === value)?.label ?? ""); }
function query(values: Record<string, string | number | undefined>) {
  const result = new URLSearchParams(); Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== "") result.set(key, String(value)); });
  return result.toString();
}
async function get<T>(url: string) {
  const response = await fetch(url); const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "動漫資料暫時無法載入。");
  return body as T;
}

export function AnimeDiscovery({ library, onAdd, adultMode = false }: { library: AnimeLibraryItem[]; onAdd: (anime: ExternalAnime) => void; adultMode?: boolean }) {
  const current = useMemo(nowSeason, []); const next = useMemo(followingSeason, []);
  const [thisSeason, setThisSeason] = useState<ExternalAnime[]>([]);
  const [nextSeason, setNextSeason] = useState<ExternalAnime[]>([]);
  const [popular, setPopular] = useState<ExternalAnime[]>([]);
  const [highest, setHighest] = useState<ExternalAnime[]>([]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy>({ genres: [], tags: [] });
  const [screen, setScreen] = useState<"home" | "all">("home");
  const [filters, setFilters] = useState<Filters>({ year: null, season: "", genre: "", tag: "", format: "", status: "", sort: "POPULARITY_DESC" });
  const [filterDraft, setFilterDraft] = useState<Filters>(filters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [all, setAll] = useState<ExternalAnime[]>([]);
  const [page, setPage] = useState(0); const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); const [detail, setDetail] = useState<ExternalAnime | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [catalogueSearchInput, setCatalogueSearchInput] = useState("");
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [catalogueSearchResults, setCatalogueSearchResults] = useState<ExternalAnime[]>([]);
  const [catalogueSearching, setCatalogueSearching] = useState(false);
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
  useEffect(() => { if (adultMode) { setHomeLoading(false); setScreen("all"); return; } void reloadHome(); }, [adultMode, reloadHome]);

  const load = useCallback(async (requestedPage: number, replace = false) => {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const response = await get<Catalogue>("/api/anime/catalogue?" + query({ page: requestedPage, perPage: 24, season: filters.season || undefined, seasonYear: filters.year ?? undefined, genre: filters.genre || undefined, tag: filters.tag || undefined, format: filters.format || undefined, status: filters.status || undefined, sort: filters.sort, adult: adultMode ? 1 : undefined }));
      setAll((currentRows) => replace ? response.items : currentRows.concat(response.items.filter((anime) => !currentRows.some((row) => row.id === anime.id))));
      setPage(response.page); setHasMore(response.hasNextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "動漫資料暫時無法載入。"); }
    finally { setLoading(false); }
  }, [adultMode, filters, loading]);
  const filterHash = JSON.stringify(filters);
  useEffect(() => { if (screen !== "all" || seen.current === filterHash) return; seen.current = filterHash; void load(1, true); }, [filterHash, load, screen]);
  useEffect(() => {
    if (screen !== "all" || !hasMore || loading || !sentinel.current) return;
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) void load(page + 1); }, { rootMargin: "320px" });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [hasMore, load, loading, page, screen]);
  const openAll = (update?: Partial<Filters>) => { const value = { ...filters, ...update }; setFilters(value); setFilterDraft(value); seen.current = ""; setScreen("all"); };
  const apply = () => { setFilters(filterDraft); seen.current = ""; setFilterOpen(false); };
  const submitCatalogueSearch = async () => {
    const value = catalogueSearchInput.trim();
    if (value.length < 2) { setError("請至少輸入 2 個字再搜尋。"); return; }
    setCatalogueSearching(true); setError(null); setCatalogueSearch(value);
    try { const answer = await get<{ results?: ExternalAnime[]; items?: ExternalAnime[] }>(adultMode ? `/api/anime/catalogue?${query({ page: 1, perPage: 24, adult: 1, search: value })}` : `/api/anime/search?q=${encodeURIComponent(value)}`); setCatalogueSearchResults(answer.results ?? answer.items ?? []); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "搜尋失敗，請稍後再試。"); }
    finally { setCatalogueSearching(false); }
  };

  return <section className="anime-discovery">
    <div className="anime-discovery-tabs"><button className={screen === "home" ? "active" : ""} onClick={() => setScreen("home")} type="button">探索首頁</button><button className={screen === "all" ? "active" : ""} onClick={() => openAll()} type="button">全部動漫</button></div>
    {error && <div className="notice error anime-catalogue-error"><span>{error}</span><button className="secondary-button compact" onClick={() => void (screen === "home" ? reloadHome() : load(1, true))} type="button">重試</button></div>}
    {screen === "home" && <><section className="anime-discovery-hero"><div><p className="eyebrow">動漫探索</p><h2>探索正在播出的好作品</h2><p>本季、下季、熱門與高評分作品都從同一個動漫資料來源取得；只有加入後才會寫入你的私人動漫庫。</p></div><button className="secondary-button" onClick={() => openAll()} type="button">搜尋／瀏覽全部動漫 →</button></section>
      <Rail loading={homeLoading} title={"本季新番 · " + seasonName(current.season, current.year)} items={thisSeason} hasItem={hasItem} onAdd={onAdd} onDetail={setDetail} />
      <Rail loading={homeLoading} title={"下季新番 · " + seasonName(next.season, next.year)} items={nextSeason} hasItem={hasItem} onAdd={onAdd} onDetail={setDetail} />
      <Rail loading={homeLoading} title="熱門動漫" items={popular} hasItem={hasItem} onAdd={onAdd} onDetail={setDetail} />
      <Rail loading={homeLoading} title="高評分動漫" items={highest} hasItem={hasItem} onAdd={onAdd} onDetail={setDetail} />
    </>}
    {screen === "all" && <><div className="anime-all-heading"><div><p className="eyebrow">動漫資料庫</p><h2>搜尋與全部動漫</h2><p>可先搜尋特定作品，或以篩選條件瀏覽完整資料庫；每次會載入 24 部作品。</p></div><button className="secondary-button" onClick={() => setFilterOpen(true)} type="button">篩選與排序</button></div><form className="anime-search-box anime-catalogue-search" onSubmit={(event) => { event.preventDefault(); void submitCatalogueSearch(); }}><i>⌕</i><input aria-label="搜尋動漫資料庫" onChange={(event) => setCatalogueSearchInput(event.target.value)} placeholder="例如：葬送的芙莉蓮、Frieren、進撃の巨人" value={catalogueSearchInput} /><button aria-label="搜尋動漫" className="button compact" type="submit">搜尋</button></form>{catalogueSearch && <div className="anime-search-result-heading"><p>{catalogueSearching ? "正在搜尋動漫資料庫…" : `「${catalogueSearch}」的搜尋結果`}</p><button className="secondary-button compact" onClick={() => { setCatalogueSearch(""); setCatalogueSearchInput(""); setCatalogueSearchResults([]); }} type="button">返回全部動漫</button></div>}{catalogueSearch ? <div className="anime-discovery-grid">{catalogueSearchResults.map((anime) => <Card anime={anime} added={hasItem(anime)} key={anime.id} onAdd={onAdd} onDetail={setDetail} />)}</div> : <><div className="anime-active-filters">{filters.season && <span>{seasonName(filters.season, filters.year)}</span>}{filters.genre && <span>{cn(filters.genre)}</span>}{filters.tag && <span>#{cn(filters.tag)}</span>}<span>{sorts.find((item) => item[0] === filters.sort)?.[1]}</span></div><div className="anime-discovery-grid">{all.map((anime) => <Card anime={anime} added={hasItem(anime)} key={anime.id} onAdd={onAdd} onDetail={setDetail} />)}</div>{loading && <p className="anime-catalogue-loading">正在載入動漫…</p>}<div className="anime-catalogue-sentinel" ref={sentinel} />{!loading && !hasMore && all.length > 0 && <p className="anime-catalogue-end">已經到底了。</p>}</>}</>}
    {detail && <Detail anime={detail} added={hasItem(detail)} onAdd={() => { onAdd(detail); setDetail(null); }} onClose={() => setDetail(null)} />}
    <ModalDialog onClose={() => setFilterOpen(false)} open={filterOpen} title="篩選動漫"><div className="anime-filter-sheet"><label>年份<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, year: event.target.value ? Number(event.target.value) : null }))} value={filterDraft.year ?? ""}><option value="">全部年份</option>{Array.from({ length: 60 }, (_, index) => new Date().getFullYear() - index).map((year) => <option key={year} value={year}>{year}</option>)}</select></label><label>季度<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, season: event.target.value as Season | "" }))} value={filterDraft.season}><option value="">不限季度</option>{seasons.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>類型<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, genre: event.target.value, tag: "" }))} value={filterDraft.genre}><option value="">不限類型</option>{taxonomy.genres.map((genre) => <option key={genre} value={genre}>{cn(genre)}</option>)}</select></label><label>細分標籤<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, tag: event.target.value, genre: "" }))} value={filterDraft.tag}><option value="">不限細分標籤</option>{taxonomy.tags.map((tag) => <option key={tag} value={tag}>{cn(tag)}</option>)}</select></label><label>格式<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, format: event.target.value }))} value={filterDraft.format}>{formats.map((item) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}</select></label><label>播出狀態<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, status: event.target.value }))} value={filterDraft.status}>{statuses.map((item) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}</select></label><label>排序<select onChange={(event) => setFilterDraft((currentFilters) => ({ ...currentFilters, sort: event.target.value as Sort }))} value={filterDraft.sort}>{sorts.map((item) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}</select></label><div className="dialog-actions"><button className="secondary-button" onClick={() => setFilterDraft({ year: null, season: "", genre: "", tag: "", format: "", status: "", sort: "POPULARITY_DESC" })} type="button">重設</button><button className="button" onClick={apply} type="button">套用</button></div></div></ModalDialog>
  </section>;
}

function Rail({ title, items, loading, hasItem, onAdd, onDetail }: { title: string; items: ExternalAnime[]; loading: boolean; hasItem: (anime: ExternalAnime) => boolean; onAdd: (anime: ExternalAnime) => void; onDetail: (anime: ExternalAnime) => void }) {
  return <section className="anime-rail-section"><div className="anime-rail-heading"><h2>{title}</h2><span>{loading ? "載入中…" : items.length ? String(items.length) + " 部" : "目前沒有作品"}</span></div><div className="anime-rail">{items.map((anime) => <Card anime={anime} added={hasItem(anime)} key={anime.id} onAdd={onAdd} onDetail={onDetail} />)}{!loading && !items.length && <p className="anime-rail-empty">暫時沒有可顯示的作品。</p>}</div></section>;
}
function Card({ anime, added, onAdd, onDetail }: { anime: ExternalAnime; added: boolean; onAdd: (anime: ExternalAnime) => void; onDetail: (anime: ExternalAnime) => void }) {
  return <article className="anime-catalogue-card"><button className="anime-catalogue-main" onClick={() => onDetail(anime)} type="button">{anime.coverUrl ? <img alt={displayTitle(anime) + " 封面"} src={anime.coverUrl} /> : <div className="anime-catalogue-cover-fallback">ANIME</div>}<div><span>{state(anime.broadcastStatus)}</span><h3>{displayTitle(anime)}</h3><p>{anime.publicScore ? "★ " + anime.publicScore.toFixed(1) : "尚無評分"} · {anime.episodes ? String(anime.episodes) + " 集" : "集數待定"}</p><small>{formatName(anime.animeType)}</small></div></button><button className={added ? "secondary-button compact added" : "button compact"} disabled={added} onClick={() => onAdd(anime)} type="button">{added ? "✓ 已加入" : "＋ 加入"}</button></article>;
}
function Detail({ anime, added, onClose, onAdd }: { anime: ExternalAnime; added: boolean; onClose: () => void; onAdd: () => void }) {
  return <ModalDialog onClose={onClose} open title="動漫詳細資訊"><div className="anime-external-detail"><div className="anime-external-hero">{anime.bannerUrl && <img alt="" src={anime.bannerUrl} />}<div>{anime.coverUrl ? <img alt="" src={anime.coverUrl} /> : <div>ANIME</div>}<div><span>{state(anime.broadcastStatus)}</span><h2>{displayTitle(anime)}</h2><p>{[anime.titleJapanese, anime.titleEnglish].filter(Boolean).join(" · ")}</p><strong>{anime.publicScore ? "★ " + anime.publicScore.toFixed(1) : "尚無評分"} · {anime.episodes ? String(anime.episodes) + " 集" : "集數待定"}</strong></div></div></div>{anime.genres.length > 0 && <div className="anime-tags">{anime.genres.map((genre) => <span key={genre}>{cn(genre)}</span>)}</div>}{anime.synopsis && <section><h3>劇情介紹</h3><p>{anime.synopsis}</p></section>}<div className="dialog-actions"><button className="secondary-button" onClick={onClose} type="button">關閉</button><button className="button" disabled={added} onClick={onAdd} type="button">{added ? "✓ 已加入我的動漫" : "＋ 加入我的動漫"}</button></div></div></ModalDialog>;
}
