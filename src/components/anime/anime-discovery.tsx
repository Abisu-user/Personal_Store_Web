"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import type { AnimeLibraryItem, ExternalAnime } from "@/lib/anime/types";

type Season = "WINTER" | "SPRING" | "SUMMER" | "FALL";
type Sort =
  | "POPULARITY_DESC"
  | "SCORE_DESC"
  | "START_DATE_DESC"
  | "TITLE_ROMAJI"
  | "FAVOURITES_DESC";
type Catalogue = {
  items: ExternalAnime[];
  page: number;
  hasNextPage: boolean;
  total: number;
  totalExact?: boolean;
};
type Taxonomy = { genres: string[]; tags: string[] };
type Filters = {
  year: number | null;
  season: Season | "";
  genre: string;
  tag: string;
  format: string;
  status: string;
  minimumScore: number | null;
  sort: Sort;
};
type DiscoveryView = "explore" | "schedule";
const seasons: { key: Season; label: string }[] = [
  { key: "WINTER", label: "冬番" },
  { key: "SPRING", label: "春番" },
  { key: "SUMMER", label: "夏番" },
  { key: "FALL", label: "秋番" },
];
const formats = [
  ["", "全部格式"],
  ["TV", "電視動畫"],
  ["TV_SHORT", "短篇電視動畫"],
  ["MOVIE", "劇場版"],
  ["OVA", "原創動畫錄影帶"],
  ["ONA", "網路動畫"],
  ["SPECIAL", "特別篇"],
];
const statuses = [
  ["", "全部狀態"],
  ["RELEASING", "連載中"],
  ["FINISHED", "已完結"],
  ["NOT_YET_RELEASED", "尚未播出"],
];
const sorts: [Sort, string][] = [
  ["POPULARITY_DESC", "熱門"],
  ["SCORE_DESC", "評分最高"],
  ["START_DATE_DESC", "最新"],
  ["TITLE_ROMAJI", "名稱"],
  ["FAVOURITES_DESC", "人氣"],
];
const names: Record<string, string> = {
  Action: "動作",
  Adventure: "冒險",
  Comedy: "喜劇",
  Drama: "劇情",
  Fantasy: "奇幻",
  Romance: "戀愛",
  "Sci-Fi": "科幻",
  Sports: "運動",
  Mystery: "推理",
  Supernatural: "超自然",
  "Slice of Life": "日常",
  Music: "音樂",
  Psychological: "心理",
  Isekai: "異世界",
  Reincarnation: "轉生",
  School: "校園",
  Magic: "魔法",
  "Time Travel": "時間旅行",
  Vampire: "吸血鬼",
  Mecha: "機器人",
  Military: "戰爭",
  Dungeon: "地下城",
  Ecchi: "福利",
  Hentai: "成人",
  Horror: "恐怖",
  "Mahou Shoujo": "魔法少女",
  "4-koma": "四格漫畫",
  "Age Gap": "年齡差",
  "Alternate Universe": "平行宇宙",
  "Artificial Intelligence": "人工智慧",
  "Coming of Age": "成長",
  "Family Life": "家庭",
  "Female Protagonist": "女性主角",
  "Male Protagonist": "男性主角",
  "Martial Arts": "武術",
  "School Club": "社團",
  Shounen: "少年向",
  Shoujo: "少女向",
  "Super Power": "超能力",
  "Video Game": "電玩",
  Work: "職場",
};
Object.assign(names, {
  "Primarily Teen Cast": "以青少年為主角",
  "Primarily Female Cast": "以女性為主角",
  "Primarily Male Cast": "以男性為主角",
  "Urban Fantasy": "都市奇幻",
  "Battle Royale": "大逃殺",
  "Boys' Love": "男男戀愛",
  "Girls' Love": "女女戀愛",
  "Cute Girls Doing Cute Things": "可愛女孩日常",
  Historical: "歷史",
  "Historical Fantasy": "歷史奇幻",
  Parody: "惡搞",
  Paranormal: "靈異",
  "Post-Apocalyptic": "後末日",
  "School Life": "校園生活",
  Space: "太空",
  Survival: "生存",
  Tragedy: "悲劇",
  "Virtual World": "虛擬世界",
  "Virtual Reality": "虛擬實境",
  War: "戰爭",
  Workplace: "職場",
  Yakuza: "黑道",
  Youkai: "妖怪",
  Zombies: "殭屍",
  "Body Swapping": "身體交換",
  Detective: "偵探",
  Crime: "犯罪",
  Cultivation: "修仙",
  Demons: "惡魔",
  Dragons: "龍",
  "Fairy Tale": "童話",
  Food: "美食",
  Gambling: "賭博",
  Harem: "後宮",
  Idol: "偶像",
  Iyashikei: "療癒",
  "Kingdom Management": "領地經營",
  "Love Triangle": "三角戀",
  Medical: "醫療",
  Mafia: "黑手黨",
  "Monster Girl": "怪物娘",
  Ninja: "忍者",
  "Otaku Culture": "御宅文化",
  Pirates: "海盜",
  Politics: "政治",
  Police: "警察",
  Revenge: "復仇",
  Robots: "機器人",
  "Royal Affairs": "王室",
  Samurai: "武士",
  Seinen: "青年向",
  Shapeshifting: "變身",
  "Space Opera": "太空歌劇",
  Steampunk: "蒸汽龐克",
  Swordplay: "劍術",
  Terrorism: "恐怖攻擊",
  Training: "訓練",
  Travel: "旅行",
  Witch: "魔女",
  Writing: "寫作",
  Afterlife: "死後世界",
  Aliens: "外星人",
  Alchemy: "鍊金術",
  Animals: "動物",
  Angels: "天使",
  Assassin: "刺客",
  Band: "樂團",
  Baseball: "棒球",
  Basketball: "籃球",
  Bullying: "霸凌",
  "Card Battle": "卡牌對戰",
  Cars: "汽車",
  CGI: "3D 動畫",
  Cyberpunk: "賽博龐克",
  Delinquents: "不良少年",
  "Gender Bending": "性別轉換",
  Ghost: "幽靈",
  Gods: "神明",
  "Hand to Hand Combat": "徒手格鬥",
  "High Stakes Game": "高風險遊戲",
  "Lost Civilization": "失落文明",
  "Memory Manipulation": "記憶操控",
  Mermaid: "人魚",
  Musical: "音樂劇",
  Mythology: "神話",
  "Organized Crime": "組織犯罪",
  Philosophy: "哲學",
  Photography: "攝影",
  Prison: "監獄",
  Religion: "宗教",
  Restaurant: "餐廳",
  Rivalries: "競爭對手",
  Rural: "鄉村",
  Satire: "諷刺",
  "Social Commentary": "社會評論",
  "Software Development": "軟體開發",
  "Space Travel": "太空旅行",
  Tennis: "網球",
  Theater: "戲劇",
  Tokusatsu: "特攝",
  Tournament: "錦標賽",
  Tsundere: "傲嬌",
  Urban: "都市",
  Villainess: "惡役千金",
  "Voice Acting": "聲優",
  Volleyball: "排球",
  VTuber: "虛擬 YouTuber",
});
const cn = (value: string) => names[value] ?? value;
const displayTitle = (anime: ExternalAnime) =>
  anime.titleChinese ?? anime.titleJapanese ?? anime.title;
const state = (value: string | null) =>
  ({
    RELEASING: "連載中",
    FINISHED: "已完結",
    NOT_YET_RELEASED: "尚未播出",
    HIATUS: "暫停播出",
    CANCELLED: "已取消",
  })[value ?? ""] ?? "資訊待定";
const formatName = (value: string | null) =>
  formats.find((item) => item[0] === value)?.[1] ??
  (value === "ANIME" || !value ? "動畫" : value);
const normalizeTitle = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, "");
const titleVariants = (
  anime: Pick<
    ExternalAnime | AnimeLibraryItem,
    | "title"
    | "titleJapanese"
    | "titleEnglish"
    | "titleChinese"
    | "originalTitle"
  >,
) =>
  [
    anime.title,
    anime.titleJapanese,
    anime.titleEnglish,
    anime.titleChinese,
    anime.originalTitle,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeTitle);

function nowSeason() {
  const date = new Date();
  const month = date.getMonth() + 1;
  return {
    season: (month <= 3
      ? "WINTER"
      : month <= 6
        ? "SPRING"
        : month <= 9
          ? "SUMMER"
          : "FALL") as Season,
    year: date.getFullYear(),
  };
}
function seasonName(value: Season, year: number | null) {
  return year
    ? String(year) +
        " " +
        (seasons.find((item) => item.key === value)?.label ?? "")
    : (seasons.find((item) => item.key === value)?.label ?? "");
}
function query(values: Record<string, string | number | undefined>) {
  const result = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") result.set(key, String(value));
  });
  return result.toString();
}
async function get<T>(url: string) {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof body.error === "string" ? body.error : "動漫資料暫時無法載入。",
    );
  return body as T;
}

export function AnimeDiscovery({
  library,
  onAdd,
  adultMode = false,
  initialView = "explore",
}: {
  library: AnimeLibraryItem[];
  onAdd: (anime: ExternalAnime) => void | Promise<void>;
  adultMode?: boolean;
  initialView?: DiscoveryView;
}) {
  const current = useMemo(() => nowSeason(), []);
  const seasonChoices = useMemo(() => {
    const keys = seasons.map((item) => item.key);
    const currentIndex = current.year * 4 + keys.indexOf(current.season);
    return [-2, -1, 0, 1, 2].map((offset) => {
      const index = currentIndex + offset;
      return { year: Math.floor(index / 4), season: keys[((index % 4) + 4) % 4] };
    });
  }, [current]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy>({ genres: [], tags: [] });
  const initialFilters: Filters = {
    year: current.year,
    season: current.season,
    genre: "",
    tag: "",
    format: "",
    status: "",
    minimumScore: null,
    sort: "POPULARITY_DESC",
  };
  const [discoveryView, setDiscoveryView] =
    useState<DiscoveryView>(initialView);
  const [scheduleDay, setScheduleDay] = useState(() => new Date().getDay());
  const [scheduleStatus, setScheduleStatus] = useState<"all" | "releasing" | "collected" | "uncollected">("all");
  const [scheduleFormat, setScheduleFormat] = useState("");
  const [scheduleFilterOpen, setScheduleFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [filterDraft, setFilterDraft] = useState<Filters>(initialFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [all, setAll] = useState<ExternalAnime[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ExternalAnime[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExternalAnime | null>(null);
  const [catalogueSearchInput, setCatalogueSearchInput] = useState("");
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const catalogueRequestId = useRef(0);
  const seen = useRef("");
  const sentinel = useRef<HTMLDivElement>(null);
  // Older records saved provider metadata but not its source ID. Compare every
  // stored title variant too, so a user-renamed title is still recognised.
  const hasItem = useCallback(
    (anime: ExternalAnime) => {
      const externalTitles = new Set(titleVariants(anime));
      return library.some(
        (item) =>
          (item.externalSource === anime.source &&
            item.externalId === anime.id) ||
          titleVariants(item).some((title) => externalTitles.has(title)),
      );
    },
    [library],
  );

  const reloadTaxonomy = useCallback(async () => {
    try {
      setTaxonomy(await get<Taxonomy>("/api/anime/catalogue?resource=taxonomy"));
    } catch { /* Results remain usable if optional taxonomy labels are unavailable. */ }
  }, []);
  useEffect(() => {
    if (adultMode) return;
    const timer = window.setTimeout(() => void reloadTaxonomy(), 0);
    return () => window.clearTimeout(timer);
  }, [adultMode, reloadTaxonomy]);

  const load = useCallback(
    async (requestedPage: number, replace = false) => {
      const requestId = ++catalogueRequestId.current;
      if (replace) {
        setAll([]);
        setHasMore(false);
      }
      setLoading(true);
      setError(null);
      try {
        const response = await get<Catalogue>(
          "/api/anime/catalogue?" +
            query({
              page: requestedPage,
              perPage: 24,
              season: filters.season || undefined,
              seasonYear: filters.year ?? undefined,
              genre: filters.genre || undefined,
              tag: filters.tag || undefined,
              format: filters.format || undefined,
              status: filters.status || undefined,
              minimumScore: filters.minimumScore ?? undefined,
              sort: filters.sort,
              search: catalogueSearch || undefined,
              adult: adultMode ? 1 : undefined,
            }),
        );
        if (requestId !== catalogueRequestId.current) return;
        setAll((currentRows) =>
          replace
            ? response.items
            : currentRows.concat(
                response.items.filter(
                  (anime) => !currentRows.some((row) => row.id === anime.id),
                ),
              ),
        );
        setPage(response.page);
        setHasMore(response.hasNextPage);
      } catch (cause) {
        if (requestId === catalogueRequestId.current)
          setError(cause instanceof Error ? cause.message : "動漫資料暫時無法載入。");
      } finally {
        if (requestId === catalogueRequestId.current) setLoading(false);
      }
    },
    [adultMode, catalogueSearch, filters],
  );
  const filterHash = JSON.stringify({ filters, catalogueSearch });
  useEffect(() => {
    if (discoveryView === "schedule" || seen.current === filterHash) return;
    seen.current = filterHash;
    const timer = window.setTimeout(() => void load(1, true), 180);
    return () => window.clearTimeout(timer);
  }, [discoveryView, filterHash, load]);
  useEffect(() => {
    if (
      discoveryView === "schedule" ||
      !hasMore ||
      loading ||
      !sentinel.current
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void load(page + 1);
      },
      { rootMargin: "320px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [discoveryView, hasMore, load, loading, page]);

  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true);
    setError(null);
    try {
      const response = await get<{ items: ExternalAnime[] }>(
        `/api/anime/catalogue?view=schedule&tzOffset=${new Date().getTimezoneOffset()}`,
      );
      setScheduleItems(response.items);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "本週播出時間表暫時無法載入。",
      );
    } finally {
      setScheduleLoading(false);
    }
  }, []);
  useEffect(() => {
    if (discoveryView === "schedule" && !scheduleItems.length) {
      const timer = window.setTimeout(() => void loadSchedule(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [discoveryView, loadSchedule, scheduleItems.length]);
  const apply = () => {
    setFilters(filterDraft);
    seen.current = "";
    setFilterOpen(false);
  };
  const selectDiscoveryView = (view: DiscoveryView) => {
    setDiscoveryView(view);
  };
  const submitCatalogueSearch = () => {
    const value = catalogueSearchInput.trim();
    if (value && value.length < 2) {
      setError("請至少輸入 2 個字再搜尋。");
      return;
    }
    setCatalogueSearch(value);
    seen.current = "";
    setError(null);
    if (value === catalogueSearch) void load(1, true);
  };
  const updateFilters = (value: Partial<Filters>) => {
    setFilters((previous) => ({ ...previous, ...value }));
    setFilterDraft((previous) => ({ ...previous, ...value }));
    seen.current = "";
  };
  const clearSearchOrFilters = () => {
    if (catalogueSearch) {
      setCatalogueSearch("");
      setCatalogueSearchInput("");
      return;
    }
    updateFilters({
      year: null,
      season: "",
      genre: "",
      tag: "",
      format: "",
      status: "",
      minimumScore: null,
      sort: "POPULARITY_DESC",
    });
  };

  const displayedAll =
    discoveryView === "schedule"
      ? scheduleItems.filter(
          (anime) =>
            anime.nextAiringEpisode &&
            new Date(anime.nextAiringEpisode.airingAt * 1000).getDay() ===
              scheduleDay &&
            (scheduleStatus === "all" ||
              (scheduleStatus === "releasing" && anime.broadcastStatus === "RELEASING") ||
              (scheduleStatus === "collected" && hasItem(anime)) ||
              (scheduleStatus === "uncollected" && !hasItem(anime))) &&
            (!scheduleFormat || anime.animeType === scheduleFormat),
        )
      : all;
  return (
    <section className="anime-discovery">
      {!adultMode && (
        <div className="anime-discovery-tabs anime-discovery-view-tabs">
          <button
            className={discoveryView === "explore" ? "active" : ""}
            onClick={() => selectDiscoveryView("explore")}
            type="button"
          >
            探索動漫
          </button>
          <button
            className={discoveryView === "schedule" ? "active" : ""}
            onClick={() => selectDiscoveryView("schedule")}
            type="button"
          >
            時間表
          </button>
        </div>
      )}
      {error && (
        <div className="notice error anime-catalogue-error">
          <span>{error}</span>
          <button
            className="secondary-button compact"
            onClick={() =>
              void (discoveryView === "schedule" ? loadSchedule() : load(1, true))
            }
            type="button"
          >
            重試
          </button>
        </div>
      )}
      <div className="anime-discovery-layout">
        {!adultMode && (
          <aside aria-label={discoveryView === "schedule" ? "時間表篩選" : "探索篩選"} className="anime-desktop-filter-rail anime-discovery-filter-rail">
            {discoveryView === "schedule" ? (
              <>
                <h3>播出星期</h3>
                <div className="anime-discovery-rail-options">
                  {["日", "一", "二", "三", "四", "五", "六"].map((label, index) => (
                    <button className={scheduleDay === index ? "active" : ""} key={label} onClick={() => setScheduleDay(index)} type="button">週{label}</button>
                  ))}
                </div>
                <h3>播出狀態</h3>
                <div className="anime-discovery-rail-options">
                  {([["all", "全部"], ["releasing", "連載中"], ["collected", "已收藏"], ["uncollected", "未收藏"]] as const).map(([value, label]) => (
                    <button className={scheduleStatus === value ? "active" : ""} key={value} onClick={() => setScheduleStatus(value)} type="button">{label}</button>
                  ))}
                </div>
                <h3>格式</h3>
                <div className="anime-discovery-rail-options">
                  {formats.map(([value, label]) => <button className={scheduleFormat === value ? "active" : ""} key={value} onClick={() => setScheduleFormat(value)} type="button">{label}</button>)}
                </div>
              </>
            ) : (
              <>
                <h3>季度</h3>
                <div className="anime-discovery-rail-options">
                  <button className={!filters.season ? "active" : ""} onClick={() => updateFilters({ year: null, season: "" })} type="button">全部季度</button>
                  {seasonChoices.map(({ year, season }) => <button className={filters.year === year && filters.season === season ? "active" : ""} key={`${year}-${season}`} onClick={() => updateFilters({ year, season })} type="button">{seasonName(season, year)}</button>)}
                </div>
                <h3>播出狀態</h3>
                <div className="anime-discovery-rail-options">
                  {statuses.map(([value, label]) => <button className={filters.status === value ? "active" : ""} key={value} onClick={() => updateFilters({ status: value })} type="button">{label}</button>)}
                </div>
                <h3>類型</h3>
                <div className="anime-discovery-rail-options">
                  <button className={!filters.genre ? "active" : ""} onClick={() => updateFilters({ genre: "", tag: "" })} type="button">全部類型</button>
                  {(showAllGenres ? taxonomy.genres : taxonomy.genres.slice(0, 8)).map((genre) => <button className={filters.genre === genre ? "active" : ""} key={genre} onClick={() => updateFilters({ genre: filters.genre === genre ? "" : genre, tag: "" })} type="button">{cn(genre)}</button>)}
                  {taxonomy.genres.length > 8 && <button onClick={() => setShowAllGenres((value) => !value)} type="button">{showAllGenres ? "收起" : "更多分類"}</button>}
                </div>
                <h3>最低評分</h3>
                <div className="anime-discovery-rail-options">
                  {([null, 7, 8, 9] as const).map((value) => <button className={filters.minimumScore === value ? "active" : ""} key={value ?? "all"} onClick={() => updateFilters({ minimumScore: value })} type="button">{value ? `${value} 分以上` : "不限評分"}</button>)}
                </div>
                <h3>格式</h3>
                <div className="anime-discovery-rail-options">
                  {formats.map(([value, label]) => <button className={filters.format === value ? "active" : ""} key={value} onClick={() => updateFilters({ format: value })} type="button">{label}</button>)}
                </div>
                <h3>排序</h3>
                <div className="anime-discovery-rail-options">
                  {sorts.map(([value, label]) => <button className={filters.sort === value ? "active" : ""} key={value} onClick={() => updateFilters({ sort: value })} type="button">{label}</button>)}
                </div>
              </>
            )}
          </aside>
        )}
        <div className="anime-discovery-results">
          <div className="anime-all-heading">
            <div>
              <p className="eyebrow">動漫資料庫</p>
              <h2>
                {discoveryView === "schedule"
                  ? "本週播出時間表"
                  : "探索動漫"}
              </h2>
              <p>
                {discoveryView === "schedule"
                  ? "依星期查看本週即將播出的作品。"
                  : filters.season && filters.year
                    ? `本季新番 · ${seasonName(filters.season, filters.year)}`
                    : "搜尋或篩選動漫資料庫。"}
              </p>
            </div>
            {discoveryView !== "schedule" && (
              <button
                className="secondary-button anime-discovery-mobile-filter"
                onClick={() => setFilterOpen(true)}
                type="button"
              >
                篩選與排序
              </button>
            )}
            {discoveryView === "schedule" && <button className="secondary-button anime-discovery-schedule-filter" onClick={() => setScheduleFilterOpen(true)} type="button">篩選</button>}
          </div>
          {discoveryView === "schedule" && (
            <div className="anime-schedule-days" aria-label="選擇星期">
              {["日", "一", "二", "三", "四", "五", "六"].map(
                (label, index) => (
                  <button
                    className={scheduleDay === index ? "active" : ""}
                    key={label}
                    onClick={() => setScheduleDay(index)}
                    type="button"
                  >
                    週{label}
                  </button>
                ),
              )}
            </div>
          )}
          {discoveryView === "schedule" && <p className="anime-schedule-summary">週{["日", "一", "二", "三", "四", "五", "六"][scheduleDay]} · {displayedAll.length} 部作品</p>}
          {discoveryView !== "schedule" && (
            <form
              className="anime-search-box anime-catalogue-search"
              onSubmit={(event) => {
                event.preventDefault();
                submitCatalogueSearch();
              }}
            >
              <i>⌕</i>
              <input
                aria-label="搜尋動漫資料庫"
                enterKeyHint="search"
                onChange={(event) => setCatalogueSearchInput(event.target.value)}
                placeholder="搜尋動漫名稱"
                value={catalogueSearchInput}
              />
              <button aria-label="搜尋動漫" className="button compact" type="submit">搜尋</button>
            </form>
          )}
          {catalogueSearch && discoveryView !== "schedule" && (
            <div className="anime-search-result-heading">
              <p>「{catalogueSearch}」的搜尋結果</p>
              <button
                className="secondary-button compact"
                onClick={() => {
                  setCatalogueSearch("");
                  setCatalogueSearchInput("");
                  seen.current = "";
                }}
                type="button"
              >
                清除搜尋
              </button>
            </div>
          )}
              {discoveryView !== "schedule" && (
                <div className="anime-active-filters">
                  {filters.season && <span>{seasonName(filters.season, filters.year)}</span>}
                  {filters.genre && <span>{cn(filters.genre)}</span>}
                  {filters.tag && <span>#{cn(filters.tag)}</span>}
                  {filters.minimumScore && <span>{filters.minimumScore} 分以上</span>}
                  <span>{sorts.find((item) => item[0] === filters.sort)?.[1]}</span>
                </div>
              )}
              <div className="anime-discovery-grid">
                {displayedAll.map((anime) => (
                  <Card
                    anime={anime}
                    added={hasItem(anime)}
                    key={anime.id}
                    onAdd={onAdd}
                    onDetail={setDetail}
                  />
                ))}
                {(discoveryView === "schedule" ? scheduleLoading : loading) &&
                  !displayedAll.length &&
                  Array.from({ length: 6 }, (_, index) => (
                    <div aria-hidden="true" className="anime-catalogue-card anime-catalogue-skeleton" key={index} />
                  ))}
              </div>
              {!scheduleLoading &&
                discoveryView === "schedule" &&
                !displayedAll.length && (
                  <div className="anime-catalogue-end">週{["日", "一", "二", "三", "四", "五", "六"][scheduleDay]}目前沒有符合條件的播出作品。<button className="secondary-button compact" onClick={() => setScheduleDay(new Date().getDay())} type="button">回到今天</button></div>
                )}
              {discoveryView !== "schedule" && <div className="anime-catalogue-sentinel" ref={sentinel} />}
              {discoveryView !== "schedule" && !loading && !hasMore && all.length > 0 && (
                <p className="anime-catalogue-end">已經到底了。</p>
              )}
              {discoveryView !== "schedule" && !loading && !all.length && !error && (
                <div className="anime-catalogue-end">
                  <p>{catalogueSearch ? `找不到「${catalogueSearch}」` : "找不到符合目前篩選條件的動漫。"}</p>
                  <button className="secondary-button compact" onClick={clearSearchOrFilters} type="button">{catalogueSearch ? "清除搜尋" : "清除篩選"}</button>
                </div>
              )}
        </div>
      </div>
      {detail && (
        <Detail
          anime={detail}
          added={hasItem(detail)}
          onAdd={() => {
            onAdd(detail);
            setDetail(null);
          }}
          onClose={() => setDetail(null)}
        />
      )}
      <ModalDialog
        className="anime-discovery-filter-dialog"
        onClose={() => setFilterOpen(false)}
        open={filterOpen}
        title="篩選動漫"
      >
        <div className="anime-filter-sheet">
          <label>
            年份
            <select
              onChange={(event) =>
                setFilterDraft((currentFilters) => ({
                  ...currentFilters,
                  year: event.target.value ? Number(event.target.value) : null,
                }))
              }
              value={filterDraft.year ?? ""}
            >
              <option value="">全部年份</option>
              {Array.from(
                { length: 60 },
                (_, index) => new Date().getFullYear() - index,
              ).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label>
            季度
            <select
              onChange={(event) =>
                setFilterDraft((currentFilters) => ({
                  ...currentFilters,
                  season: event.target.value as Season | "",
                }))
              }
              value={filterDraft.season}
            >
              <option value="">不限季度</option>
              {seasons.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            類型
            <select
              onChange={(event) =>
                setFilterDraft((currentFilters) => ({
                  ...currentFilters,
                  genre: event.target.value,
                  tag: "",
                }))
              }
              value={filterDraft.genre}
            >
              <option value="">不限類型</option>
              {taxonomy.genres.map((genre) => (
                <option key={genre} value={genre}>
                  {cn(genre)}
                </option>
              ))}
            </select>
          </label>
          <label>
            細分標籤
            <select
              onChange={(event) =>
                setFilterDraft((currentFilters) => ({
                  ...currentFilters,
                  tag: event.target.value,
                  genre: "",
                }))
              }
              value={filterDraft.tag}
            >
              <option value="">不限細分標籤</option>
              {taxonomy.tags.map((tag) => (
                <option key={tag} value={tag}>
                  {cn(tag)}
                </option>
              ))}
            </select>
          </label>
          <label>
            格式
            <select
              onChange={(event) =>
                setFilterDraft((currentFilters) => ({
                  ...currentFilters,
                  format: event.target.value,
                }))
              }
              value={filterDraft.format}
            >
              {formats.map((item) => (
                <option key={item[0]} value={item[0]}>
                  {item[1]}
                </option>
              ))}
            </select>
          </label>
          <label>
            最低評分
            <select
              onChange={(event) =>
                setFilterDraft((currentFilters) => ({
                  ...currentFilters,
                  minimumScore: event.target.value ? Number(event.target.value) : null,
                }))
              }
              value={filterDraft.minimumScore ?? ""}
            >
              <option value="">不限評分</option>
              <option value="7">7 分以上</option>
              <option value="8">8 分以上</option>
              <option value="9">9 分以上</option>
            </select>
          </label>
          <label>
            播出狀態
            <select
              onChange={(event) =>
                setFilterDraft((currentFilters) => ({
                  ...currentFilters,
                  status: event.target.value,
                }))
              }
              value={filterDraft.status}
            >
              {statuses.map((item) => (
                <option key={item[0]} value={item[0]}>
                  {item[1]}
                </option>
              ))}
            </select>
          </label>
          <label>
            排序
            <select
              onChange={(event) =>
                setFilterDraft((currentFilters) => ({
                  ...currentFilters,
                  sort: event.target.value as Sort,
                }))
              }
              value={filterDraft.sort}
            >
              {sorts.map((item) => (
                <option key={item[0]} value={item[0]}>
                  {item[1]}
                </option>
              ))}
            </select>
          </label>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() =>
                setFilterDraft({
                  year: null,
                  season: "",
                  genre: "",
                  tag: "",
                  format: "",
                  status: "",
                  minimumScore: null,
                  sort: "POPULARITY_DESC",
                })
              }
              type="button"
            >
              重設
            </button>
            <button className="button" onClick={apply} type="button">
              套用
            </button>
          </div>
        </div>
      </ModalDialog>
      <ModalDialog className="anime-discovery-filter-dialog" onClose={() => setScheduleFilterOpen(false)} open={scheduleFilterOpen} title="篩選時間表">
        <div className="anime-filter-sheet">
          <label>播出狀態
            <select onChange={(event) => setScheduleStatus(event.target.value as typeof scheduleStatus)} value={scheduleStatus}>
              <option value="all">全部</option>
              <option value="releasing">連載中</option>
              <option value="collected">已收藏</option>
              <option value="uncollected">未收藏</option>
            </select>
          </label>
          <label>格式
            <select onChange={(event) => setScheduleFormat(event.target.value)} value={scheduleFormat}>
              {formats.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="dialog-actions"><button className="button" onClick={() => setScheduleFilterOpen(false)} type="button">完成</button></div>
        </div>
      </ModalDialog>
    </section>
  );
}

function Card({
  anime,
  added,
  onAdd,
  onDetail,
}: {
  anime: ExternalAnime;
  added: boolean;
  onAdd: (anime: ExternalAnime) => void | Promise<void>;
  onDetail: (anime: ExternalAnime) => void;
}) {
  return (
    <article className="anime-catalogue-card">
      <button
        className="anime-catalogue-main"
        onClick={() => onDetail(anime)}
        type="button"
      >
        {anime.coverUrl ? (
          <img
            alt={displayTitle(anime) + " 封面"}
            decoding="async"
            loading="lazy"
            src={anime.coverUrl}
          />
        ) : (
          <div className="anime-catalogue-cover-fallback">ANIME</div>
        )}
        <div>
          <span>{state(anime.broadcastStatus)}</span>
          <h3>{displayTitle(anime)}</h3>
          <p>
            {anime.publicScore
              ? "★ " + anime.publicScore.toFixed(1)
              : "尚無評分"}{" "}
            ·{" "}
            {anime.nextAiringEpisode
              ? `第 ${anime.nextAiringEpisode.episode} 集即將播出`
              : anime.episodes
                ? String(anime.episodes) + " 集"
                : "集數待定"}
          </p>
          <small>{formatName(anime.animeType)}</small>
        </div>
      </button>
      <button
        className={added ? "secondary-button compact added" : "button compact"}
        disabled={added}
        onClick={() => {
          void Promise.resolve(onAdd(anime)).catch(() => undefined);
        }}
        type="button"
      >
        {added ? "✓ 已加入到收藏" : "＋ 加入收藏"}
      </button>
    </article>
  );
}
function Detail({
  anime,
  added,
  onClose,
  onAdd,
}: {
  anime: ExternalAnime;
  added: boolean;
  onClose: () => void;
  onAdd: () => void;
}) {
  return (
    <ModalDialog onClose={onClose} open title="動漫詳細資訊">
      <div className="anime-external-detail">
        <div className="anime-external-hero">
          {anime.bannerUrl && <img alt="" src={anime.bannerUrl} />}
          <div>
            {anime.coverUrl ? (
              <img alt="" src={anime.coverUrl} />
            ) : (
              <div>ANIME</div>
            )}
            <div>
              <span>{state(anime.broadcastStatus)}</span>
              <h2>{displayTitle(anime)}</h2>
              <p>
                {[anime.titleJapanese, anime.titleEnglish]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <strong>
                {anime.publicScore
                  ? "★ " + anime.publicScore.toFixed(1)
                  : "尚無評分"}{" "}
                · {anime.episodes ? String(anime.episodes) + " 集" : "集數待定"}
              </strong>
            </div>
          </div>
        </div>
        {anime.genres.length > 0 && (
          <div className="anime-tags">
            {anime.genres.map((genre) => (
              <span key={genre}>{cn(genre)}</span>
            ))}
          </div>
        )}
        {anime.synopsis && (
          <section>
            <h3>劇情介紹</h3>
            <p>{anime.synopsis}</p>
          </section>
        )}
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            關閉
          </button>
          <button
            className="button"
            disabled={added}
            onClick={onAdd}
            type="button"
          >
            {added ? "✓ 已加入到收藏" : "＋ 加入收藏"}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
