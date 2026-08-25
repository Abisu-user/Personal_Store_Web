"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CoverImageField, type CoverSelection, uploadCover } from "@/components/content/cover-image-field";
import { AnimeDiscovery } from "@/components/anime/anime-discovery";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalDialog, OperationStatus } from "@/components/ui/modal-dialog";
import { animeStatusLabels, type AnimeLibraryItem, type AnimePreferences, type AnimeTag, type AnimeWatchStatus, type AnimeWorkspaceData, type ExternalAnime } from "@/lib/anime/types";

type Tab = "discover" | "library" | "stats" | "adult";
type Filter = "all" | AnimeWatchStatus;
const statuses: AnimeWatchStatus[] = ["planning", "watching", "completed", "paused", "dropped"];
const visibleFilters: Filter[] = ["all", ...statuses];
const defaultPreferences: AnimePreferences = { adultModeEnabled: false, adultHiddenByDefault: true, requireAdultPasskey: false, blurAdultCovers: true, showAdultInMainLibrary: false };
const empty: AnimeWorkspaceData = { library: [], tags: [], logs: [], preferences: defaultPreferences };
const displayTitle = (anime: Pick<AnimeLibraryItem, "title" | "titleChinese">) => anime.titleChinese ?? anime.title;
async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "操作失敗，請稍後再試。");
  return body as T;
}

function coverUrl(anime: AnimeLibraryItem) {
  return anime.coverUrl?.startsWith("/") || anime.coverUrl?.startsWith("http") ? anime.coverUrl : anime.coverUrl ? `/api/anime/library/${anime.id}/cover?v=${encodeURIComponent(anime.updatedAt)}` : null;
}

function Cover({ anime, className = "anime-cover", blur = false }: { anime: AnimeLibraryItem; className?: string; blur?: boolean }) {
  const src = coverUrl(anime);
  return src ? <img alt={blur ? "成人內容封面（已模糊）" : `${displayTitle(anime)} 封面`} className={`${className}${blur ? " anime-adult-cover-blur" : ""}`} loading="lazy" src={src} /> : <div className={`${className} anime-cover-fallback`}>ANIME</div>;
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
  const [categoryQuery, setCategoryQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [categoryAddOpen, setCategoryAddOpen] = useState(false);
  const [categoryMoreOpen, setCategoryMoreOpen] = useState(false);
  const [prefill, setPrefill] = useState<ExternalAnime | null>(null);
  const [adultPrefill, setAdultPrefill] = useState<ExternalAnime | null>(null);
  const [adultData, setAdultData] = useState<AnimeWorkspaceData | null>(null);
  const [adultUnlocked, setAdultUnlocked] = useState(false);
  const [adultSettingsOpen, setAdultSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState(initialData?.preferences ?? defaultPreferences);
  const [libraryPage, setLibraryPage] = useState(1);
  const libraryPageSize = 12;

  const refresh = async () => {
    const next = await api<AnimeWorkspaceData>("/api/anime/library");
    setData(next);
  };
  const updateAdultPreferences = async (changes: Partial<AnimePreferences>) => {
    setPending("adult-settings");
    try {
      const next = await api<AnimePreferences>("/api/anime/preferences", { method: "PATCH", body: JSON.stringify(changes) });
      setPreferences(next); setData((current) => ({ ...current, preferences: next }));
      if (!next.adultModeEnabled) { setAdultData(null); setAdultUnlocked(false); if (tab === "adult") setTab("library"); }
      setNotice("成人內容設定已儲存。");
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "無法儲存成人內容設定。"); }
    finally { setPending(null); }
  };
  const openAdult = async () => {
    if (!preferences.adultModeEnabled) { setAdultSettingsOpen(true); return; }
    setPending("adult-access"); setNotice(null);
    try {
      if (preferences.requireAdultPasskey) {
        const { error } = await createClient().auth.signInWithPasskey();
        if (error) throw new Error("Face ID / Passkey 驗證未完成，成人內容仍保持隱藏。");
      }
      const next = await api<AnimeWorkspaceData>("/api/anime/library?scope=adult");
      if (document.visibilityState !== "visible") return;
      setAdultData(next); setAdultUnlocked(true); setTab("adult");
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "無法開啟成人內容。"); }
    finally { setPending(null); }
  };
  useEffect(() => {
    const hideAdult = () => { if (document.visibilityState !== "visible") { setAdultUnlocked(false); setAdultData(null); if (tab === "adult") setTab("library"); } };
    document.addEventListener("visibilitychange", hideAdult);
    return () => document.removeEventListener("visibilitychange", hideAdult);
  }, [tab]);
  const library = useMemo(() => data.library.filter((anime) => {
    const matchesFilter = filter === "all" || anime.watchStatus === filter;
    const matchesCategory = !categoryFilter || anime.tags.some((category) => category.id === categoryFilter);
    const haystack = [anime.title, anime.titleChinese, anime.titleJapanese, anime.titleEnglish, anime.notes, ...anime.tags.map((category) => category.name)].filter(Boolean).join(" ").toLocaleLowerCase();
    return matchesFilter && matchesCategory && haystack.includes(query.toLocaleLowerCase());
  }), [categoryFilter, data.library, filter, query]);
  const libraryPageCount = Math.max(1, Math.ceil(library.length / libraryPageSize));
  const activeLibraryPage = Math.min(libraryPage, libraryPageCount);
  const pagedLibrary = library.slice((activeLibraryPage - 1) * libraryPageSize, activeLibraryPage * libraryPageSize);
  useEffect(() => { setLibraryPage(1); }, [filter, categoryFilter, query]);

  const createCategory = async () => {
    const name = categoryName.trim();
    if (!name) return;
    setPending("category");
    try {
      const answer = await api<{ tag: AnimeTag }>("/api/anime/tags", { method: "POST", body: JSON.stringify({ name }) });
      setData((current) => current.tags.some((category) => category.id === answer.tag.id) ? current : { ...current, tags: [...current.tags, answer.tag].sort((a, b) => a.name.localeCompare(b.name, "zh-TW")) });
      setCategoryName("");
      setCategoryAddOpen(false);
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
    {pending && <OperationStatus label={pending === "category" ? "正在新增類別…" : pending === "adult-access" ? "正在驗證成人內容存取權…" : pending === "adult-settings" ? "正在儲存成人內容設定…" : "正在儲存動漫資料…"} />}
    <div className="anime-toolbar">
      <div className="anime-tabs" role="tablist" aria-label="動漫功能">
        <button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")} type="button">我的動漫</button>
        <button className={tab === "discover" ? "active" : ""} onClick={() => setTab("discover")} type="button">探索</button>
        <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")} type="button">統計</button>
        {preferences.adultModeEnabled && <button className={tab === "adult" ? "active" : ""} onClick={() => void openAdult()} type="button">成人內容</button>}
      </div>
      <div className="anime-toolbar-actions"><button className="secondary-button compact" onClick={() => setAdultSettingsOpen(true)} type="button">成人內容設定</button><button className="button compact" onClick={() => setAdding(true)} type="button">＋ 新增動漫</button></div>
    </div>
    {notice && <div className="notice success anime-notice"><span>{notice}</span><button aria-label="關閉提示" onClick={() => setNotice(null)} type="button">×</button></div>}
    {tab === "discover" && <AnimeDiscovery library={data.library} onAdd={setPrefill} />}
    {tab === "adult" && adultUnlocked && adultData && <section className="anime-adult-workspace"><div className="anime-adult-heading"><div><p className="eyebrow">ADULT CONTENT</p><h2>成人內容</h2><p>此區內容不會出現在一般動漫頁、探索首頁或最近觀看中；離開 App 時會立即重新隱藏。</p></div><button className="button compact" onClick={() => setAdding(true)} type="button">＋ 手動新增成人作品</button></div><AnimeDiscovery adultMode library={adultData.library} onAdd={setAdultPrefill} /><div className="anime-grid">{adultData.library.map((anime) => <article className="anime-card anime-adult-card" key={anime.id}><button className="anime-card-main" onClick={() => setSelected(anime)} type="button"><Cover anime={anime} blur={preferences.blurAdultCovers} /><div className="anime-card-copy"><div className="anime-card-line"><Status value={anime.watchStatus} /><span className="anime-adult-badge">18+</span></div><h3>{displayTitle(anime)}</h3><p>{anime.tags.map((category) => category.name).join(" · ") || "未分類"}</p></div></button></article>)}</div>{!adultData.library.length && <p className="anime-field-hint">尚未收藏成人作品。可使用下方搜尋，或手動新增並設定外部作品連結。</p>}</section>}
    {tab === "library" && <>
      <div className="anime-filter-bar">
        <div className="anime-filter-scroll">{visibleFilters.map((value) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)} type="button">{value === "all" ? "全部" : animeStatusLabels[value]}</button>)}</div>
        <input aria-label="搜尋自己的動漫" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋名稱、類別或備註" value={query} />
        <button aria-expanded={filterOpen} className="secondary-button compact anime-mobile-filter" onClick={() => setFilterOpen(true)} type="button">篩選{filter === "all" ? "" : `：${animeStatusLabels[filter]}`}</button>
      </div>
      <section className="anime-category-bar" aria-label="動漫類別">
        <div className="anime-category-scroll"><button className={!categoryFilter ? "active" : ""} onClick={() => setCategoryFilter(null)} type="button">所有類別</button>{data.tags.map((category) => <button className={categoryFilter === category.id ? "active" : ""} key={category.id} onClick={() => setCategoryFilter(category.id)} type="button">{category.name} <small>{data.library.filter((anime) => anime.tags.some((item) => item.id === category.id)).length}</small></button>)}<button aria-label="查看更多類別" className="anime-category-utility" onClick={() => setCategoryMoreOpen(true)} type="button">更多</button><button aria-label="新增類別" className="anime-category-utility anime-category-add-button" onClick={() => setCategoryAddOpen(true)} type="button">＋</button></div>
      </section>
      <div className="anime-grid">{pagedLibrary.map((anime) => <article className="anime-card" key={anime.id}>
        <button className="anime-card-main" onClick={() => setSelected(anime)} type="button"><Cover anime={anime} /><div className="anime-card-copy"><div className="anime-card-line"><Status value={anime.watchStatus} />{anime.rating !== null && <span className="anime-rating-summary">★ {anime.rating}</span>}</div><h3>{displayTitle(anime)}</h3><p>{anime.tags.map((category) => category.name).join(" · ") || "未分類"}</p><div className="anime-card-link">{anime.sourceUrl ? "已設定觀看連結" : "尚未設定觀看連結"}</div></div></button>
      </article>)}</div>
      {library.length > libraryPageSize && <nav aria-label="我的動漫分頁" className="anime-pagination"><button aria-label="上一頁" className="secondary-button compact" disabled={activeLibraryPage === 1} onClick={() => setLibraryPage((current) => Math.max(1, current - 1))} type="button">上一頁</button>{Array.from({ length: libraryPageCount }, (_, index) => index + 1).slice(Math.max(0, activeLibraryPage - 4), Math.min(libraryPageCount, activeLibraryPage + 3)).map((number) => <button aria-current={number === activeLibraryPage ? "page" : undefined} className={number === activeLibraryPage ? "active" : ""} key={number} onClick={() => setLibraryPage(number)} type="button">{number}</button>)}<button aria-label="下一頁" className="secondary-button compact" disabled={activeLibraryPage === libraryPageCount} onClick={() => setLibraryPage((current) => Math.min(libraryPageCount, current + 1))} type="button">下一頁</button></nav>}
      {!library.length && <div className="anime-empty"><h3>{data.library.length ? "找不到符合的動漫" : "還沒有加入動漫"}</h3><button className="button compact" onClick={() => setAdding(true)} type="button">＋ 新增動漫</button></div>}
      <ModalDialog className="mobile-sheet-dialog" onClose={() => setFilterOpen(false)} open={filterOpen} title="篩選我的動漫"><div className="anime-mobile-filter-panel"><p>觀看狀態</p><div>{visibleFilters.map((value) => <button className={filter === value ? "active" : ""} key={value} onClick={() => { setFilter(value); setFilterOpen(false); }} type="button">{value === "all" ? "全部" : animeStatusLabels[value]}</button>)}</div></div></ModalDialog>
      <ModalDialog className="mobile-sheet-dialog" onClose={() => setCategoryAddOpen(false)} open={categoryAddOpen} pending={pending === "category"} title="新增動漫類別"><form className="anime-category-dialog" onSubmit={(event) => { event.preventDefault(); void createCategory(); }}><label>類別名稱<input autoFocus disabled={Boolean(pending)} onChange={(event) => setCategoryName(event.target.value)} placeholder="例如：搞笑、動畫" value={categoryName} /></label><div className="dialog-actions"><button className="secondary-button" disabled={Boolean(pending)} onClick={() => setCategoryAddOpen(false)} type="button">取消</button><button className="button" disabled={Boolean(pending) || !categoryName.trim()} type="submit">新增類別</button></div></form></ModalDialog>
      <ModalDialog className="mobile-sheet-dialog" onClose={() => setCategoryMoreOpen(false)} open={categoryMoreOpen} title="動漫類別"><div className="anime-category-dialog"><p>選擇類別以篩選我的動漫。</p><input aria-label="搜尋動漫類別" onChange={(event) => setCategoryQuery(event.target.value)} placeholder="搜尋類別" value={categoryQuery} /><div className="anime-category-manager-list"><button className={!categoryFilter ? "active" : ""} onClick={() => { setCategoryFilter(null); setCategoryMoreOpen(false); }} type="button">所有類別</button>{data.tags.filter((item) => item.name.toLocaleLowerCase().includes(categoryQuery.trim().toLocaleLowerCase())).map((item) => <button className={categoryFilter === item.id ? "active" : ""} key={item.id} onClick={() => { setCategoryFilter(item.id); setCategoryMoreOpen(false); }} type="button">{item.name} <small>{data.library.filter((anime) => anime.tags.some((tag) => tag.id === item.id)).length}</small></button>)}</div></div></ModalDialog>
    </>}
    {tab === "stats" && <AnimeStats data={data} />}
    {adding && <AnimeEditor adult={tab === "adult"} categories={data.tags} onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); setPending("refresh"); try { await refresh(); if (tab === "adult") await openAdult(); else setTab("library"); setNotice("已新增動漫。"); } finally { setPending(null); } }} />}
    {prefill && <AnimeEditor categories={data.tags} prefill={prefill} onClose={() => setPrefill(null)} onSaved={async () => { setPrefill(null); setPending("refresh"); try { await refresh(); setTab("library"); setNotice("已新增動漫。"); } finally { setPending(null); } }} />}
    {adultPrefill && <AnimeEditor adult categories={data.tags} prefill={adultPrefill} onClose={() => setAdultPrefill(null)} onSaved={async () => { setAdultPrefill(null); await openAdult(); setNotice("已新增成人作品。"); }} />}
    {selected && <AnimeDetailDialog anime={selected} onClose={() => setSelected(null)} onEdit={() => { setEditing(selected); setSelected(null); }} />}
    {editing && <AnimeEditor anime={editing} categories={data.tags} onClose={() => setEditing(null)} onRemove={() => { setRemoving(editing); setEditing(null); }} onSaved={async () => { setPending("refresh"); try { await refresh(); setEditing(null); setNotice("已儲存動漫資料。"); } finally { setPending(null); } }} />}
    <ConfirmDialog confirmLabel="移至垃圾桶" description={removing ? `確定要將《${removing.title}》移至垃圾桶嗎？` : ""} onCancel={() => setRemoving(null)} onConfirm={() => void remove()} open={Boolean(removing)} pending={pending === "remove"} title="移除我的動漫" />
    <ModalDialog className="mobile-sheet-dialog" onClose={() => setAdultSettingsOpen(false)} open={adultSettingsOpen} title="成人內容設定"><div className="anime-adult-settings"><p>成人內容預設關閉，且不會顯示在一般動漫頁。此設定只保存作品 metadata 與你提供的 HTTPS 外部連結，不會存取第三方帳號或 Cookie。</p><label><input checked={preferences.adultModeEnabled} onChange={(event) => void updateAdultPreferences({ adultModeEnabled: event.target.checked })} type="checkbox" /> 啟用 18+ 成人內容模式</label><label><input checked={preferences.adultHiddenByDefault} disabled={!preferences.adultModeEnabled} onChange={(event) => void updateAdultPreferences({ adultHiddenByDefault: event.target.checked })} type="checkbox" /> 成人內容預設隱藏</label><label><input checked={preferences.blurAdultCovers} disabled={!preferences.adultModeEnabled} onChange={(event) => void updateAdultPreferences({ blurAdultCovers: event.target.checked })} type="checkbox" /> 成人封面預設模糊</label><label><input checked={preferences.requireAdultPasskey} disabled={!preferences.adultModeEnabled} onChange={(event) => void updateAdultPreferences({ requireAdultPasskey: event.target.checked })} type="checkbox" /> 每次開啟成人區要求 Face ID / Passkey</label><label><input checked={preferences.showAdultInMainLibrary} disabled={!preferences.adultModeEnabled} onChange={(event) => void updateAdultPreferences({ showAdultInMainLibrary: event.target.checked })} type="checkbox" /> 解鎖後允許在一般動漫清單顯示成人內容</label><p className="anime-field-hint">切換 App、鎖定螢幕或頁面進入背景時，成人區會立即隱藏；iOS 多工預覽由既有 Vault 鎖定遮罩保護。</p></div></ModalDialog>
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
  return <ModalDialog onClose={onClose} open title="動漫詳細資訊"><div className="anime-detail"><div className="anime-detail-hero">{anime.bannerUrl && <img alt="" src={anime.bannerUrl} />}<div><Cover anime={anime} /><div><Status value={anime.watchStatus} /><h3>{displayTitle(anime)}</h3>{names.length > 0 && <p>{names.join(" · ")}</p>}<div className="anime-detail-rating"><StarRating readonly value={anime.rating} /> <span>{anime.rating === null ? "尚未評分" : `${anime.rating} / 10`}</span></div></div></div></div>{metadata.length > 0 && <div className="anime-detail-metadata">{metadata.map((item) => <span key={item}>{item}</span>)}</div>}{anime.tags.length > 0 && <section><h4>類別</h4><div className="anime-tags">{anime.tags.map((category) => <span key={category.id}>{category.name}</span>)}</div></section>}{anime.synopsis && <section><h4>劇情介紹</h4><p>{anime.synopsis}</p></section>}{anime.notes && <section><h4>私人備註</h4><p>{anime.notes}</p></section>}{anime.sourceUrl && <section className="anime-view-link"><h4>觀看連結</h4><a className="button compact" href={anime.sourceUrl} rel="noreferrer" target="_blank">▶ 前往觀看</a></section>}<div className="dialog-actions anime-detail-view-actions"><button className="secondary-button" onClick={onClose} type="button">關閉</button><button className="button" onClick={onEdit} type="button">修改</button></div></div></ModalDialog>;
}

function AnimeEditor({ anime, prefill, adult = false, categories, onClose, onSaved, onRemove }: { anime?: AnimeLibraryItem; prefill?: ExternalAnime; adult?: boolean; categories: AnimeTag[]; onClose: () => void; onSaved: () => Promise<void>; onRemove?: () => void }) {
  const [title, setTitle] = useState(anime?.title ?? prefill?.titleChinese ?? prefill?.title ?? "");
  const [sourceUrl, setSourceUrl] = useState(anime?.sourceUrl ?? "");
  const [watchStatus, setWatchStatus] = useState<AnimeWatchStatus>(anime?.watchStatus ?? "planning");
  const [rating, setRating] = useState<number | null>(anime?.rating ?? null);
  const [notes, setNotes] = useState(anime?.notes ?? "");
  const [categoryIds, setCategoryIds] = useState(anime?.tags.map((category) => category.id) ?? []);
  const [cover, setCover] = useState<CoverSelection>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isAdult = adult || Boolean(anime?.isAdult) || Boolean(prefill?.isAdult);
  const [contentRating, setContentRating] = useState(anime?.contentRating ?? prefill?.contentRating ?? (isAdult ? "成人內容" : ""));
  const [adultSource, setAdultSource] = useState(anime?.adultSource ?? "manual");
  const save = async () => {
    if (!title.trim()) { setMessage("請輸入動漫名稱。"); return; }
    setPending(true); setMessage(null);
    try {
      const coverTicket = await uploadCover(cover);
      const body = { ...(anime ? { id: anime.id } : {}), title, sourceUrl: sourceUrl.trim() || null, externalUrl: isAdult ? sourceUrl.trim() || null : undefined, isAdult, contentRating: isAdult ? contentRating.trim() || "成人內容" : null, adultSource: isAdult ? adultSource.trim() || "manual" : null, coverUrl: !cover && !anime ? prefill?.coverUrl ?? null : undefined, metadata: !anime && prefill ? prefill : undefined, coverTicket, watchStatus, rating, notes, categoryIds };
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
      <label>{isAdult ? "外部作品／觀看連結（選填）" : "觀看連結（選填）"}<input onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." type="url" value={sourceUrl} /></label>
      {isAdult && <div className="anime-adult-editor-fields"><label>內容分級<input onChange={(event) => setContentRating(event.target.value)} placeholder="例如：18+ 成人內容" value={contentRating} /></label><label>成人內容來源<input onChange={(event) => setAdultSource(event.target.value)} placeholder="例如：manual" value={adultSource} /></label></div>}
      <label>觀看狀態<select onChange={(event) => setWatchStatus(event.target.value as AnimeWatchStatus)} value={watchStatus}>{statuses.map((status) => <option key={status} value={status}>{animeStatusLabels[status]}</option>)}</select></label>
      <fieldset><legend>我的評分（10 星）</legend><StarRating onChange={setRating} value={rating} /><small className="anime-rating-help">{rating === null ? "尚未評分" : `${rating} / 10`}</small></fieldset>
      <fieldset><legend>類別（可複選）</legend><div className="anime-tag-picker">{categories.length ? categories.map((category) => <label key={category.id}><input checked={categoryIds.includes(category.id)} onChange={() => setCategoryIds((ids) => ids.includes(category.id) ? ids.filter((id) => id !== category.id) : [...ids, category.id])} type="checkbox" /> {category.name}</label>) : <p className="anime-field-hint">先在清單上方新增類別後即可選取。</p>}</div></fieldset>
      <label>私人備註<textarea onChange={(event) => setNotes(event.target.value)} placeholder="記錄心得、進度或提醒…" rows={4} value={notes} /></label>
      {message && <p className="notice error">{message}</p>}
      <div className="anime-editor-actions"><div>{anime && onRemove && <button className="danger-button" disabled={pending} onClick={onRemove} type="button">移至垃圾桶</button>}</div><div><button className="secondary-button" disabled={pending} onClick={onClose} type="button">取消</button><button className="button" disabled={pending} onClick={() => void save()} type="button">{pending ? "儲存中…" : anime ? "儲存修改" : "新增動漫"}</button></div></div>
    </div>
  </ModalDialog>;
}
