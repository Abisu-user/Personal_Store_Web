"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CoverImageField, type CoverSelection, uploadCover } from "@/components/content/cover-image-field";
import { AnimeDiscovery } from "@/components/anime/anime-discovery";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalDialog, OperationStatus } from "@/components/ui/modal-dialog";
import { animeStatusLabels, type AnimeLibraryItem, type AnimeTag, type AnimeWatchStatus, type AnimeWorkspaceData, type ExternalAnime } from "@/lib/anime/types";

type Tab = "discover" | "library" | "search" | "stats";
type Filter = "all" | Exclude<AnimeWatchStatus, "paused">;
const statuses: AnimeWatchStatus[] = ["planning", "watching", "completed", "paused", "dropped"];
const visibleFilters: Filter[] = ["all", "watching", "planning", "completed", "dropped"];
const empty: AnimeWorkspaceData = { library: [], tags: [], logs: [] };
const searchKey = (anime: ExternalAnime) => `${anime.source}:${anime.id}`;

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "操作失敗，請稍後再試。");
  return body as T;
}

function coverUrl(anime: AnimeLibraryItem) {
  return anime.coverUrl?.startsWith("/") || anime.coverUrl?.startsWith("http") ? anime.coverUrl : anime.coverUrl ? `/api/anime/library/${anime.id}/cover?v=${encodeURIComponent(anime.updatedAt)}` : null;
}

function Cover({ anime, className = "anime-cover" }: { anime: AnimeLibraryItem; className?: string }) {
  const src = coverUrl(anime);
  return src ? <img alt={`${anime.title} 封面`} className={className} loading="lazy" src={src} /> : <div className={`${className} anime-cover-fallback`}>ANIME</div>;
}

function Status({ value }: { value: AnimeWatchStatus }) {
  return <span className={`anime-status status-${value}`}>{animeStatusLabels[value]}</span>;
}

function StarRating({ value, onChange, readonly = false }: { value: number | null; onChange?: (next: number | null) => void; readonly?: boolean }) {
  return <div aria-label={value === null ? "尚未評分" : `我的評分 ${value} / 10`} className={`anime-stars${readonly ? " readonly" : ""}`}>
    {Array.from({ length: 10 }, (_, index) => {
      const star = index + 1;
      return <button aria-label={`${star} 星`} className={value !== null && star <= value ? "active" : ""} disabled={readonly} key={star} onClick={() => onChange?.(value === star ? null : star)} type="button">★</button>;
    })}
  </div>;
}

export function AnimeWorkspace({ initialData }: { initialData: AnimeWorkspaceData }) {
  const [data, setData] = useState(initialData ?? empty);
  const [tab, setTab] = useState<Tab>("library");
  const [filter, setFilter] = useState<Filter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState<AnimeLibraryItem | null>(null);
  const [editing, setEditing] = useState<AnimeLibraryItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<AnimeLibraryItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [results, setResults] = useState<ExternalAnime[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<ExternalAnime | null>(null);
  const searchCache = useRef(new Map<string, { until: number; rows: ExternalAnime[] }>());

  const refresh = async () => {
    const next = await api<AnimeWorkspaceData>("/api/anime/library");
    setData(next);
  };
  const library = useMemo(() => data.library.filter((anime) => {
    const matchesFilter = filter === "all" || anime.watchStatus === filter;
    const matchesCategory = !categoryFilter || anime.tags.some((category) => category.id === categoryFilter);
    const haystack = [anime.title, anime.titleJapanese, anime.titleEnglish, anime.notes, ...anime.tags.map((category) => category.name)].filter(Boolean).join(" ").toLocaleLowerCase();
    return matchesFilter && matchesCategory && haystack.includes(query.toLocaleLowerCase());
  }), [categoryFilter, data.library, filter, query]);
  useEffect(() => {
    const text = submittedSearch.trim(); if (tab !== "search" || text.length < 2) return;
    const key = text.normalize("NFKC").toLocaleLowerCase(); const cached = searchCache.current.get(key);
    if (cached && cached.until > Date.now()) { setResults(cached.rows); setSearchError(null); return; }
    const controller = new AbortController();
    void (async () => { setSearching(true); setSearchError(null); try { const answer = await api<{ results: ExternalAnime[] }>(`/api/anime/search?q=${encodeURIComponent(text)}`, { signal: controller.signal }); if (!controller.signal.aborted) { setResults(answer.results); searchCache.current.set(key, { until: Date.now() + 20 * 60_000, rows: answer.results }); } } catch (cause) { if (!controller.signal.aborted) setSearchError(!navigator.onLine ? "目前沒有網路連線" : cause instanceof Error ? cause.message : "搜尋失敗，請稍後再試。"); } finally { if (!controller.signal.aborted) setSearching(false); } })();
    return () => controller.abort();
  }, [submittedSearch, tab]);

  const createCategory = async () => {
    const name = categoryName.trim();
    if (!name) return;
    setPending("category");
    try {
      const answer = await api<{ tag: AnimeTag }>("/api/anime/tags", { method: "POST", body: JSON.stringify({ name }) });
      setData((current) => current.tags.some((category) => category.id === answer.tag.id) ? current : { ...current, tags: [...current.tags, answer.tag].sort((a, b) => a.name.localeCompare(b.name, "zh-TW")) });
      setCategoryName("");
      setNotice("已新增類別。");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "無法新增類別。");
    } finally {
      setPending(null);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setPending("remove");
    try {
      await api("/api/anime/library", { method: "DELETE", body: JSON.stringify({ id: removing.id }) });
      setData((current) => ({ ...current, library: current.library.filter((anime) => anime.id !== removing.id) }));
      setSelected(null);
      setRemoving(null);
      setNotice("已移至垃圾桶。");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "無法移除動漫。");
    } finally {
      setPending(null);
    }
  };

  return <section className="anime-workspace">
    {pending && <OperationStatus label={pending === "category" ? "正在新增類別…" : "正在儲存動漫資料…"} />}
    <div className="anime-toolbar">
      <div className="anime-tabs" role="tablist" aria-label="動漫功能">
        <button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")} type="button">我的動漫</button>
        <button className={tab === "discover" ? "active" : ""} onClick={() => setTab("discover")} type="button">探索</button>
        <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")} type="button">搜尋動漫</button>
        <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")} type="button">統計</button>
      </div>
      <button className="button compact" onClick={() => setAdding(true)} type="button">＋ 新增動漫</button>
    </div>
    {notice && <div className="notice success anime-notice"><span>{notice}</span><button aria-label="關閉提示" onClick={() => setNotice(null)} type="button">×</button></div>}
    {tab === "discover" && <AnimeDiscovery library={data.library} onAdd={setPrefill} onSearch={(value) => { setSearchInput(value); setSubmittedSearch(value); setTab("search"); }} />}
    {tab === "library" && <>
      <div className="anime-filter-bar">
        <div className="anime-filter-scroll">{visibleFilters.map((value) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)} type="button">{value === "all" ? "全部" : animeStatusLabels[value]}</button>)}</div>
        <input aria-label="搜尋自己的動漫" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋名稱、類別或備註" value={query} />
      </div>
      <section className="anime-category-bar" aria-label="動漫類別">
        <div className="anime-category-scroll"><button className={!categoryFilter ? "active" : ""} onClick={() => setCategoryFilter(null)} type="button">所有類別</button>{data.tags.map((category) => <button className={categoryFilter === category.id ? "active" : ""} key={category.id} onClick={() => setCategoryFilter(category.id)} type="button">{category.name} <small>{data.library.filter((anime) => anime.tags.some((item) => item.id === category.id)).length}</small></button>)}</div>
        <form className="anime-category-add" onSubmit={(event) => { event.preventDefault(); void createCategory(); }}><input disabled={Boolean(pending)} onChange={(event) => setCategoryName(event.target.value)} placeholder="新增類別" value={categoryName} /><button className="secondary-button compact" disabled={Boolean(pending) || !categoryName.trim()} type="submit">＋ 類別</button></form>
      </section>
      <div className="anime-grid">{library.map((anime) => <article className="anime-card" key={anime.id}>
        <button className="anime-card-main" onClick={() => setSelected(anime)} type="button"><Cover anime={anime} /><div className="anime-card-copy"><div className="anime-card-line"><Status value={anime.watchStatus} />{anime.rating !== null && <span className="anime-rating-summary">★ {anime.rating}</span>}</div><h3>{anime.title}</h3><p>{anime.tags.map((category) => category.name).join(" · ") || "未分類"}</p><div className="anime-card-link">{anime.sourceUrl ? "已設定觀看連結" : "尚未設定觀看連結"}</div></div></button>
      </article>)}</div>
      {!library.length && <div className="anime-empty"><h3>{data.library.length ? "找不到符合的動漫" : "還沒有加入動漫"}</h3><button className="button compact" onClick={() => setAdding(true)} type="button">＋ 新增動漫</button></div>}
    </>}
    {tab === "search" && <><div className="anime-search-heading"><p className="eyebrow">ANIME DATABASE</p><h2>搜尋動漫</h2><p>輸入名稱後按 Enter 或搜尋按鈕；資料只用來帶入名稱與封面，不會連動任何串流平台。</p></div><form className="anime-search-box" onSubmit={(event) => { event.preventDefault(); const value = searchInput.trim(); if (value.length < 2) { setResults([]); setSearchError("請至少輸入 2 個字再搜尋。"); return; } setSearchError(null); setSubmittedSearch(value); }}><i>⌕</i><input autoFocus onChange={(event) => setSearchInput(event.target.value)} placeholder="例如：葬送的芙莉蓮、Frieren、進撃の巨人" value={searchInput} /><button aria-label="搜尋動漫" className="button compact" type="submit">搜尋</button></form>{searching && <div className="anime-search-state">正在搜尋動漫資料庫…</div>}{searchError && <div className="notice error">{searchError}</div>}<div className="anime-search-grid">{results.map((anime) => <article className="anime-search-card" key={searchKey(anime)}>{anime.coverUrl ? <img alt={`${anime.title} 封面`} className="anime-search-cover" src={anime.coverUrl} /> : <div className="anime-search-cover anime-cover-fallback">ANIME</div>}<div><p className="anime-result-type">{anime.animeType ?? "Anime"}{anime.releaseYear ? ` · ${anime.releaseYear}` : ""}</p><h3>{anime.title}</h3><p>{anime.titleJapanese || anime.titleEnglish || "未提供其他名稱"}</p><small>{anime.episodes ? `${anime.episodes} 集` : "集數未定"}</small><div className="anime-result-actions"><button className="secondary-button" onClick={() => setPrefill(anime)} type="button">新增此動漫</button></div></div></article>)}</div>{!searching && submittedSearch.trim().length >= 2 && !searchError && !results.length && <div className="anime-empty"><h3>找不到相關動漫</h3><p>試試不同名稱、羅馬拼音或日文名稱。</p></div>}</>}
    {tab === "stats" && <AnimeStats data={data} />}
    {adding && <AnimeEditor categories={data.tags} onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); setPending("refresh"); try { await refresh(); setTab("library"); setNotice("已新增動漫。"); } finally { setPending(null); } }} />}
    {prefill && <AnimeEditor categories={data.tags} prefill={prefill} onClose={() => setPrefill(null)} onSaved={async () => { setPrefill(null); setPending("refresh"); try { await refresh(); setTab("library"); setNotice("已新增動漫。"); } finally { setPending(null); } }} />}
    {selected && <AnimeDetailDialog anime={selected} onClose={() => setSelected(null)} onEdit={() => { setEditing(selected); setSelected(null); }} />}
    {editing && <AnimeEditor anime={editing} categories={data.tags} onClose={() => setEditing(null)} onRemove={() => { setRemoving(editing); setEditing(null); }} onSaved={async () => { setPending("refresh"); try { await refresh(); setEditing(null); setNotice("已儲存動漫資料。"); } finally { setPending(null); } }} />}
    <ConfirmDialog confirmLabel="移至垃圾桶" description={removing ? `確定要將《${removing.title}》移至垃圾桶嗎？` : ""} onCancel={() => setRemoving(null)} onConfirm={() => void remove()} open={Boolean(removing)} pending={pending === "remove"} title="移除我的動漫" />
  </section>;
}

function AnimeStats({ data }: { data: AnimeWorkspaceData }) {
  const watched = data.library.reduce((total, anime) => total + anime.watchedEpisodes, 0);
  const scores = data.library.flatMap((anime) => anime.rating === null ? [] : [anime.rating]);
  const average = scores.length ? (scores.reduce((total, score) => total + score, 0) / scores.length).toFixed(1) : "—";
  const date = (value: string) => new Intl.DateTimeFormat("zh-TW", { month: "short", day: "numeric" }).format(new Date(value));
  return <><div className="anime-stats-grid"><article><small>總收藏</small><strong>{data.library.length}</strong><span>部動漫</span></article><article><small>已觀看集數</small><strong>{watched}</strong><span>集</span></article><article><small>正在觀看</small><strong>{data.library.filter((anime) => anime.watchStatus === "watching").length}</strong><span>部</span></article><article><small>平均評分</small><strong>{average}</strong><span>/ 10</span></article></div><section className="anime-status-summary"><h2>觀看狀態</h2>{statuses.map((status) => <div key={status}><span><Status value={status} /></span><strong>{data.library.filter((anime) => anime.watchStatus === status).length} 部</strong></div>)}</section><section className="anime-history"><h2>最近觀看</h2>{data.logs.length ? data.logs.slice(0, 8).map((log) => <div key={log.id}><span>{date(log.watchedAt)}</span><strong>{data.library.find((anime) => anime.id === log.animeId)?.title ?? "已移除的動漫"}</strong><small>第 {log.fromEpisode} 集 → 第 {log.toEpisode} 集</small></div>) : <p className="anime-field-hint">還沒有觀看紀錄。</p>}</section></>;
}

function AnimeDetailDialog({ anime, onClose, onEdit }: { anime: AnimeLibraryItem; onClose: () => void; onEdit: () => void }) {
  const names = [anime.titleJapanese, anime.titleEnglish, anime.titleChinese, anime.originalTitle].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  const metadata = [anime.animeType, anime.broadcastStatus, anime.releaseYear ? `${anime.releaseYear} 年` : null, anime.episodes ? `${anime.episodes} 集` : null, anime.publicScore ? `公開評分 ${anime.publicScore}` : null].filter((value): value is string => Boolean(value));
  return <ModalDialog onClose={onClose} open title="動漫詳細資訊"><div className="anime-detail"><div className="anime-detail-hero">{anime.bannerUrl && <img alt="" src={anime.bannerUrl} />}<div><Cover anime={anime} /><div><Status value={anime.watchStatus} /><h3>{anime.title}</h3>{names.length > 0 && <p>{names.join(" · ")}</p>}<div className="anime-detail-rating"><StarRating readonly value={anime.rating} /> <span>{anime.rating === null ? "尚未評分" : `${anime.rating} / 10`}</span></div></div></div></div>{metadata.length > 0 && <div className="anime-detail-metadata">{metadata.map((item) => <span key={item}>{item}</span>)}</div>}{anime.tags.length > 0 && <section><h4>類別</h4><div className="anime-tags">{anime.tags.map((category) => <span key={category.id}>{category.name}</span>)}</div></section>}{anime.synopsis && <section><h4>劇情介紹</h4><p>{anime.synopsis}</p></section>}{anime.notes && <section><h4>私人備註</h4><p>{anime.notes}</p></section>}{anime.sourceUrl && <section className="anime-view-link"><h4>觀看連結</h4><a className="button compact" href={anime.sourceUrl} rel="noreferrer" target="_blank">▶ 前往觀看</a></section>}<div className="dialog-actions anime-detail-view-actions"><button className="secondary-button" onClick={onClose} type="button">關閉</button><button className="button" onClick={onEdit} type="button">修改</button></div></div></ModalDialog>;
}

function AnimeEditor({ anime, prefill, categories, onClose, onSaved, onRemove }: { anime?: AnimeLibraryItem; prefill?: ExternalAnime; categories: AnimeTag[]; onClose: () => void; onSaved: () => Promise<void>; onRemove?: () => void }) {
  const [title, setTitle] = useState(anime?.title ?? prefill?.title ?? "");
  const [sourceUrl, setSourceUrl] = useState(anime?.sourceUrl ?? "");
  const [watchStatus, setWatchStatus] = useState<AnimeWatchStatus>(anime?.watchStatus ?? "planning");
  const [rating, setRating] = useState<number | null>(anime?.rating ?? null);
  const [notes, setNotes] = useState(anime?.notes ?? "");
  const [categoryIds, setCategoryIds] = useState(anime?.tags.map((category) => category.id) ?? []);
  const [cover, setCover] = useState<CoverSelection>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const save = async () => {
    if (!title.trim()) { setMessage("請輸入動漫名稱。"); return; }
    setPending(true); setMessage(null);
    try {
      const coverTicket = await uploadCover(cover);
      const body = { ...(anime ? { id: anime.id } : {}), title, sourceUrl: sourceUrl.trim() || null, coverUrl: !cover && !anime ? prefill?.coverUrl ?? null : undefined, metadata: !anime && prefill ? prefill : undefined, coverTicket, watchStatus, rating, notes, categoryIds };
      await api("/api/anime/library", { method: anime ? "PATCH" : "POST", body: JSON.stringify(body) });
      await onSaved();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "無法儲存動漫。");
    } finally {
      setPending(false);
    }
  };
  const currentCover = anime ? coverUrl(anime) : prefill?.coverUrl ?? null;
  return <ModalDialog onClose={onClose} open pending={pending} title={anime ? "修改動漫" : "新增動漫"}>
    <div className="anime-dialog">
      <label>動漫名稱<input autoFocus onChange={(event) => setTitle(event.target.value)} placeholder="例如：葬送的芙莉蓮" value={title} /></label>
      <CoverImageField cropSize={{ width: 720, height: 1040 }} initialUrl={currentCover} onChange={setCover} />
      <label>觀看連結（選填）<input onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." type="url" value={sourceUrl} /></label>
      <label>觀看狀態<select onChange={(event) => setWatchStatus(event.target.value as AnimeWatchStatus)} value={watchStatus}>{statuses.map((status) => <option key={status} value={status}>{animeStatusLabels[status]}</option>)}</select></label>
      <fieldset><legend>我的評分（10 星）</legend><StarRating onChange={setRating} value={rating} /><small className="anime-rating-help">{rating === null ? "尚未評分" : `${rating} / 10`}</small></fieldset>
      <fieldset><legend>類別（可複選）</legend><div className="anime-tag-picker">{categories.length ? categories.map((category) => <label key={category.id}><input checked={categoryIds.includes(category.id)} onChange={() => setCategoryIds((ids) => ids.includes(category.id) ? ids.filter((id) => id !== category.id) : [...ids, category.id])} type="checkbox" /> {category.name}</label>) : <p className="anime-field-hint">先在清單上方新增類別後即可選取。</p>}</div></fieldset>
      <label>私人備註<textarea onChange={(event) => setNotes(event.target.value)} placeholder="記錄心得、進度或提醒…" rows={4} value={notes} /></label>
      {message && <p className="notice error">{message}</p>}
      <div className="anime-editor-actions"><div>{anime && onRemove && <button className="danger-button" disabled={pending} onClick={onRemove} type="button">移至垃圾桶</button>}</div><div><button className="secondary-button" disabled={pending} onClick={onClose} type="button">取消</button><button className="button" disabled={pending} onClick={() => void save()} type="button">{pending ? "儲存中…" : anime ? "儲存修改" : "新增動漫"}</button></div></div>
    </div>
  </ModalDialog>;
}
