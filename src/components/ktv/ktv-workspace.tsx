"use client";

import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { ResponsiveChipOverflow } from "@/components/ui/responsive-chip-overflow";
import { AppIcon } from "@/components/ui/app-icon";
import type { KtvCategory, KtvSong, KtvWorkspaceData } from "@/lib/ktv/types";
import styles from "./ktv.module.css";

type Draft = { id: string | null; songNumber: string; title: string; artist: string; categoryId: string | null };
type SortKey = "songNumber" | "title" | "artist";
type DuplicateState = { song: KtvSong; draft: Draft } | null;

const emptyDraft = (): Draft => ({ id: null, songNumber: "", title: "", artist: "", categoryId: null });

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) {
    const error = new Error(body.error || "操作未完成，請稍後再試。") as Error & { status?: number; payload?: T };
    error.status = response.status;
    error.payload = body;
    throw error;
  }
  return body;
}

function subscribeDesktop(callback: () => void) {
  const query = window.matchMedia("(min-width: 1280px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function useInlineDesktop() {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia("(min-width: 1280px)").matches, () => true);
}

export function KtvWorkspace({ initialData }: { initialData: KtvWorkspaceData }) {
  const inlineDesktop = useInlineDesktop();
  const [songs, setSongs] = useState(initialData.songs);
  const [categories, setCategories] = useState(initialData.categories);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | "all" | "uncategorized">("all");
  const [sortKey, setSortKey] = useState<SortKey>("songNumber");
  const [ascending, setAscending] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editorClosing, setEditorClosing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateState>(null);
  const [deleteSong, setDeleteSong] = useState<KtvSong | null>(null);
  const [openSongMenuId, setOpenSongMenuId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(() => new Set());
  const [batchCategoryOpen, setBatchCategoryOpen] = useState(false);
  const [batchCategoryId, setBatchCategoryId] = useState<string | null>(null);
  const [categoryMoreOpen, setCategoryMoreOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [categoryDrafts, setCategoryDrafts] = useState<KtvCategory[]>(categories);
  const [newCategory, setNewCategory] = useState("");
  const [deleteCategory, setDeleteCategory] = useState<KtvCategory | null>(null);

  useEffect(() => {
    const open = () => { setEditorClosing(false); setError(null); setDraft(emptyDraft()); };
    window.addEventListener("personal-vault:new-item", open);
    return () => window.removeEventListener("personal-vault:new-item", open);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-ktv-song-menu]")) return;
      setOpenSongMenuId(null);
    };
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenSongMenuId(null); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, []);

  const visibleSongs = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const next = songs.filter((song) => {
      const categoryMatches = categoryId === "all" || (categoryId === "uncategorized" ? !song.category : song.category?.id === categoryId);
      const queryMatches = !needle || [song.songNumber, song.title, song.artist].some((value) => value.toLocaleLowerCase().includes(needle));
      return categoryMatches && queryMatches;
    });
    return next.sort((left, right) => {
      const a = left[sortKey];
      const b = right[sortKey];
      return a.localeCompare(b, "zh-Hant", { numeric: sortKey === "songNumber", sensitivity: "base" }) * (ascending ? 1 : -1);
    });
  }, [ascending, categoryId, query, songs, sortKey]);

  function openCreate() { setEditorClosing(false); setError(null); setDraft(emptyDraft()); }
  function openEdit(song: KtvSong) {
    setEditorClosing(false);
    setError(null);
    setDraft({ id: song.id, songNumber: song.songNumber, title: song.title, artist: song.artist, categoryId: song.category?.id ?? null });
  }
  function closeEditor() {
    if (pending) return;
    if (!inlineDesktop) { setDraft(null); setError(null); return; }
    setEditorClosing(true);
    window.setTimeout(() => { setDraft(null); setEditorClosing(false); setError(null); }, 240);
  }
  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((current) => current ? { ...current, [key]: value } : current); }

  async function saveSong(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const normalized = { ...draft, songNumber: draft.songNumber.trim(), title: draft.title.trim(), artist: draft.artist.trim() };
    if (!/^[0-9]{5}$/.test(normalized.songNumber)) { setError("點歌號碼必須是剛好 5 位數字。"); return; }
    if (!normalized.title || !normalized.artist) { setError("請填寫歌曲名稱與歌手。"); return; }
    setPending(true); setError(null);
    try {
      const response = await request<{ song: KtvSong; duplicate?: KtvSong }>("/api/ktv", {
        method: normalized.id ? "PATCH" : "POST",
        body: JSON.stringify(normalized),
      });
      setSongs((current) => normalized.id ? current.map((song) => song.id === response.song.id ? response.song : song) : [response.song, ...current]);
      setNotice(normalized.id ? "歌曲資料已更新。" : "歌曲已加入 KTV 收藏。");
      setDraft(null);
    } catch (cause) {
      const typed = cause as Error & { status?: number; payload?: { duplicate?: KtvSong } };
      if (typed.status === 409 && typed.payload?.duplicate) setDuplicate({ song: typed.payload.duplicate, draft: normalized });
      else setError(typed.message);
    } finally { setPending(false); }
  }

  async function removeSong() {
    if (!deleteSong) return;
    setPending(true); setError(null);
    try {
      await request("/api/ktv", { method: "DELETE", body: JSON.stringify({ id: deleteSong.id }) });
      setSongs((current) => current.filter((song) => song.id !== deleteSong.id));
      if (draft?.id === deleteSong.id) setDraft(null);
      setDeleteSong(null); setNotice("歌曲已刪除。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "無法刪除歌曲。"); }
    finally { setPending(false); }
  }

  function toggleSongSelection(songId: string) {
    setSelectedSongIds((current) => {
      const next = new Set(current);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  }

  function closeSelectionMode() {
    setSelectionMode(false);
    setSelectedSongIds(new Set());
    setBatchCategoryOpen(false);
  }

  function toggleVisibleSongs() {
    const visibleIds = visibleSongs.map((song) => song.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSongIds.has(id));
    setSelectedSongIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => allVisibleSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  async function categorizeSelectedSongs() {
    const ids = [...selectedSongIds];
    if (!ids.length) return;
    setPending(true); setError(null);
    try {
      const { affectedIds, category } = await request<{ affectedIds: string[]; category: Pick<KtvCategory, "id" | "name"> | null }>("/api/ktv", {
        method: "PATCH",
        body: JSON.stringify({ action: "categorize", ids, categoryId: batchCategoryId }),
      });
      const affected = new Set(affectedIds);
      setSongs((current) => current.map((song) => affected.has(song.id) ? { ...song, category } : song));
      setNotice(`已將 ${affected.size} 首歌曲分類到「${category?.name ?? "未分類"}」。`);
      closeSelectionMode();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法批量分類歌曲。");
    } finally { setPending(false); }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    setPending(true); setError(null);
    try {
      const { category } = await request<{ category: KtvCategory }>("/api/ktv/categories", { method: "POST", body: JSON.stringify({ name }) });
      setCategories((current) => [...current, category]);
      setCategoryDrafts((current) => [...current, category]);
      setNewCategory(""); setNotice("分類已新增。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "無法新增分類。"); }
    finally { setPending(false); }
  }

  function moveCategory(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= categoryDrafts.length) return;
    setCategoryDrafts((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function saveCategories() {
    setPending(true); setError(null);
    try {
      const { categories: saved } = await request<{ categories: KtvCategory[] }>("/api/ktv/categories", {
        method: "PATCH",
        body: JSON.stringify({ categories: categoryDrafts.map(({ id, name }) => ({ id, name: name.trim() })) }),
      });
      setCategories(saved);
      setSongs((current) => current.map((song) => song.category ? { ...song, category: { ...song.category, name: saved.find((item) => item.id === song.category?.id)?.name ?? song.category.name } } : song));
      setCategoryManagerOpen(false); setNotice("分類設定已儲存。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "無法儲存分類。"); }
    finally { setPending(false); }
  }

  async function removeCategory() {
    if (!deleteCategory) return;
    setPending(true); setError(null);
    try {
      await request("/api/ktv/categories", { method: "DELETE", body: JSON.stringify({ id: deleteCategory.id }) });
      setCategories((current) => current.filter((item) => item.id !== deleteCategory.id));
      setCategoryDrafts((current) => current.filter((item) => item.id !== deleteCategory.id));
      setSongs((current) => current.map((song) => song.category?.id === deleteCategory.id ? { ...song, category: null } : song));
      if (categoryId === deleteCategory.id) setCategoryId("all");
      setDeleteCategory(null); setNotice("分類已刪除；原歌曲已移至未分類。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "無法刪除分類。"); }
    finally { setPending(false); }
  }

  const editor = draft ? <SongEditor categories={categories} draft={draft} error={error} pending={pending} onClose={closeEditor} onSave={saveSong} update={updateDraft} /> : null;

  return <div className={`${styles.workspace}${draft ? ` ${styles.editorOpen}` : ""}`}>
    {notice && <div className="create-success-toast" role="status">{notice}<button aria-label="關閉通知" onClick={() => setNotice(null)} type="button">×</button></div>}
    <button className={styles.mobileHeaderAdd} onClick={openCreate} type="button"><AppIcon name="plus" />新增</button>
    <div className={styles.workspaceGrid}>
      <section className={styles.collectionPanel}>
        <div className={styles.toolbar}>
          <label className={styles.search}><AppIcon name="search" /><span className="sr-only">搜尋歌曲</span><input onChange={(event) => setQuery(event.target.value)} placeholder="搜尋號碼、歌名或歌手" value={query} /></label>
          <button className={`button compact ${styles.addButton}`} onClick={openCreate} type="button"><AppIcon name="plus" />新增歌曲</button>
        </div>
        <div className={styles.categoryRow} data-chip-overflow-container>
          <ResponsiveChipOverflow activeId={categoryId} leading={<><button aria-pressed={categoryId === "all"} className={categoryId === "all" ? styles.activeChip : ""} onClick={() => setCategoryId("all")} type="button">全部</button><button aria-pressed={categoryId === "uncategorized"} className={categoryId === "uncategorized" ? styles.activeChip : ""} onClick={() => setCategoryId("uncategorized")} type="button">未分類</button></>} leadingCount={2} items={categories} itemId={(item) => item.id} itemMeasureKey={(item) => item.name} renderItem={(item) => <button aria-pressed={categoryId === item.id} className={categoryId === item.id ? styles.activeChip : ""} key={item.id} onClick={() => setCategoryId((current) => current === item.id ? "all" : item.id)} type="button">{item.name}</button>} renderMore={(hiddenActive) => <button aria-expanded={categoryMoreOpen} aria-haspopup="dialog" className={hiddenActive ? styles.activeChip : ""} onClick={() => setCategoryMoreOpen(true)} type="button">更多</button>} trailing={<button className={styles.manageButton} onClick={() => { setCategoryDrafts(categories); setCategoryManagerOpen(true); setError(null); }} type="button">管理分類</button>} trailingCount={1} />
        </div>
        <div className={styles.listToolbar}>
          <p>{visibleSongs.length} 首歌曲</p>
          <div><button className={styles.selectionToggle} data-active={selectionMode} onClick={() => selectionMode ? closeSelectionMode() : setSelectionMode(true)} type="button">{selectionMode ? "結束選取" : "批量分類"}</button><select aria-label="排序方式" onChange={(event) => setSortKey(event.target.value as SortKey)} value={sortKey}><option value="songNumber">點歌號碼</option><option value="title">歌曲名稱</option><option value="artist">歌手</option></select><button aria-label={ascending ? "目前升冪，切換降冪" : "目前降冪，切換升冪"} onClick={() => setAscending((current) => !current)} type="button">{ascending ? "↑" : "↓"}</button></div>
        </div>
        {selectionMode && <section className={styles.batchToolbar}><label><input checked={visibleSongs.length > 0 && visibleSongs.every((song) => selectedSongIds.has(song.id))} onChange={toggleVisibleSongs} type="checkbox" />全選目前清單</label><strong>已選 {selectedSongIds.size} 首</strong><button className="button compact" disabled={!selectedSongIds.size || pending} onClick={() => { setBatchCategoryId(null); setBatchCategoryOpen(true); setError(null); }} type="button">分類到…</button></section>}
        <div className={styles.songList} role="table" aria-label="KTV 歌曲收藏">
          <div className={styles.tableHead} role="row"><span>點歌號碼</span><span>歌曲名稱</span><span>歌手</span><span>分類</span><span>{selectionMode ? "選取" : "操作"}</span></div>
          {visibleSongs.map((song) => <article className={`${styles.songRow}${selectedSongIds.has(song.id) ? ` ${styles.selectedSong}` : ""}`} key={song.id} role="row">
            <button className={styles.songNumber} onClick={() => navigator.clipboard.writeText(song.songNumber).then(() => setNotice("點歌號碼已複製。"))} title="複製點歌號碼" type="button">{song.songNumber}</button>
            <button className={styles.songTitle} onClick={() => openEdit(song)} title={`編輯 ${song.title}`} type="button">{song.title}</button><span title={song.artist}>{song.artist}</span><span className={styles.categoryBadge}>{song.category?.name ?? "未分類"}</span>
            {selectionMode ? <label className={styles.selectionCheck}><input aria-label={`選取 ${song.title}`} checked={selectedSongIds.has(song.id)} onChange={() => toggleSongSelection(song.id)} type="checkbox" /><span className="sr-only">選取 {song.title}</span></label> : <details className={styles.songMenu} data-ktv-song-menu onToggle={(event) => {
              const opened = event.currentTarget.open;
              setOpenSongMenuId((current) => opened ? song.id : current === song.id ? null : current);
            }} open={openSongMenuId === song.id}><summary aria-label={`操作 ${song.title}`}><AppIcon name="more" /></summary><div><button onClick={() => { setOpenSongMenuId(null); openEdit(song); }} type="button">編輯</button><button className={styles.dangerItem} onClick={() => { setOpenSongMenuId(null); setDeleteSong(song); }} type="button">刪除</button></div></details>}
          </article>)}
          {!visibleSongs.length && <div className={styles.empty}><AppIcon name="music" /><h2>{songs.length ? `找不到符合${query.trim() ? `「${query.trim()}」` : "目前條件"}的歌曲` : "還沒有 KTV 歌曲"}</h2><p>{songs.length ? "請調整搜尋文字或分類。" : "把常唱的 KTV 歌曲與點歌號碼收藏起來，下次就不用再找一次。"}</p>{songs.length && query ? <button className="secondary-button compact" onClick={() => setQuery("")} type="button">清除搜尋</button> : <button className="button compact" onClick={openCreate} type="button">新增第一首歌曲</button>}</div>}
        </div>
      </section>
      {inlineDesktop && draft && <aside className={`${styles.editorPanel}${editorClosing ? ` ${styles.closing}` : ""}`}>{editor}</aside>}
    </div>

    {!inlineDesktop && <MobileBottomSheet className={`mobile-sheet-dialog ${styles.mobileEditor}`} eyebrow={draft?.id ? "EDIT SONG" : "CREATE SONG"} onClose={closeEditor} open={Boolean(draft)} title={draft?.id ? "編輯歌曲" : "新增歌曲"}>{editor}</MobileBottomSheet>}

    <ModalDialog className={styles.categoryDialog} onClose={() => { if (!pending) { setCategoryManagerOpen(false); setError(null); } }} open={categoryManagerOpen} pending={pending} title="管理分類">
      <form className={styles.newCategoryForm} onSubmit={addCategory}><label>新增分類<input maxLength={50} onChange={(event) => setNewCategory(event.target.value)} placeholder="例如：合唱、男歌手" value={newCategory} /></label><button className="button compact" disabled={pending || !newCategory.trim()} type="submit">新增</button></form>
      <div className={styles.categoryManager}>{categoryDrafts.map((category, index) => <div key={category.id}><input aria-label={`分類 ${index + 1}`} maxLength={50} onChange={(event) => setCategoryDrafts((current) => current.map((item) => item.id === category.id ? { ...item, name: event.target.value } : item))} value={category.name} /><div><button aria-label="往上移" disabled={index === 0 || pending} onClick={() => moveCategory(index, -1)} type="button">↑</button><button aria-label="往下移" disabled={index === categoryDrafts.length - 1 || pending} onClick={() => moveCategory(index, 1)} type="button">↓</button><button className={styles.dangerItem} disabled={pending} onClick={() => setDeleteCategory(category)} type="button">刪除</button></div></div>)}{!categoryDrafts.length && <p>目前沒有自訂分類。</p>}</div>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={pending} onClick={() => setCategoryManagerOpen(false)} type="button">取消</button><button className="button" disabled={pending || categoryDrafts.some((item) => !item.name.trim())} onClick={() => void saveCategories()} type="button">{pending ? "儲存中…" : "儲存分類"}</button></div>
    </ModalDialog>

    <ModalDialog className={styles.batchCategoryDialog} onClose={() => { if (!pending) { setBatchCategoryOpen(false); setError(null); } }} open={batchCategoryOpen} pending={pending} title={`分類 ${selectedSongIds.size} 首歌曲`}>
      <p className={styles.batchHint}>選取一個目的分類；所有已勾選歌曲會一次移動，不會逐首發送請求。</p>
      <div className={styles.batchCategoryChoices}><button aria-pressed={batchCategoryId === null} className={batchCategoryId === null ? styles.activeChip : ""} onClick={() => setBatchCategoryId(null)} type="button">未分類</button>{categories.map((category) => <button aria-pressed={batchCategoryId === category.id} className={batchCategoryId === category.id ? styles.activeChip : ""} key={category.id} onClick={() => setBatchCategoryId(category.id)} type="button">{category.name}</button>)}</div>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={pending} onClick={() => setBatchCategoryOpen(false)} type="button">取消</button><button className="button" disabled={pending || !selectedSongIds.size} onClick={() => void categorizeSelectedSongs()} type="button">{pending ? "套用中…" : "套用分類"}</button></div>
    </ModalDialog>

    <ModalDialog className={styles.categoryDialog} onClose={() => setCategoryMoreOpen(false)} open={categoryMoreOpen} title="更多分類">
      <p className={styles.batchHint}>選擇分類後會立即套用目前歌曲篩選。</p>
      <div className={styles.batchCategoryChoices}>{categories.map((category) => <button aria-pressed={categoryId === category.id} className={categoryId === category.id ? styles.activeChip : ""} key={category.id} onClick={() => { setCategoryId((current) => current === category.id ? "all" : category.id); setCategoryMoreOpen(false); }} type="button">{category.name}</button>)}</div>
    </ModalDialog>

    <ModalDialog onClose={() => setDuplicate(null)} open={Boolean(duplicate)} title="點歌號碼已存在"><div className={styles.duplicateDialog}><p>「{duplicate?.song.songNumber}」已收藏為「{duplicate?.song.title}」。不會覆蓋原資料。</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setDuplicate(null)} type="button">保留目前輸入</button><button className="button" onClick={() => { if (duplicate) openEdit(duplicate.song); setDuplicate(null); }} type="button">編輯原歌曲</button></div></div></ModalDialog>
    <ConfirmDialog description={`「${deleteSong?.title ?? "這首歌"}」將永久刪除，無法還原。`} error={error} onCancel={() => { setDeleteSong(null); setError(null); }} onConfirm={() => void removeSong()} open={Boolean(deleteSong)} pending={pending} title="刪除歌曲？" />
    <ConfirmDialog description={`刪除「${deleteCategory?.name ?? "這個分類"}」後，歌曲不會被刪除，會改列為「未分類」並繼續出現在「全部」。`} error={error} onCancel={() => { setDeleteCategory(null); setError(null); }} onConfirm={() => void removeCategory()} open={Boolean(deleteCategory)} pending={pending} title="刪除分類？" />
  </div>;
}

function SongEditor({ categories, draft, error, pending, onClose, onSave, update }: { categories: KtvCategory[]; draft: Draft; error: string | null; pending: boolean; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void; update: <K extends keyof Draft>(key: K, value: Draft[K]) => void }) {
  return <form className={styles.editorForm} noValidate onSubmit={onSave}>
    <header><div><p className="eyebrow">{draft.id ? "EDIT SONG" : "CREATE SONG"}</p><h2>{draft.id ? "編輯歌曲" : "新增歌曲"}</h2></div><button aria-label="關閉編輯器" disabled={pending} onClick={onClose} type="button">×</button></header>
    <label>點歌號碼<span>*</span><input autoFocus inputMode="numeric" maxLength={5} onChange={(event) => update("songNumber", event.target.value.replace(/\D/g, "").slice(0, 5))} pattern="[0-9]{5}" placeholder="例如：01234" required value={draft.songNumber} />{error && !/^[0-9]{5}$/.test(draft.songNumber.trim()) && <small role="alert">點歌號碼必須是剛好 5 位數字。</small>}</label>
    <label>歌曲名稱<span>*</span><input maxLength={300} onChange={(event) => update("title", event.target.value)} required value={draft.title} />{error && !draft.title.trim() && <small role="alert">請輸入歌曲名稱。</small>}</label>
    <label>歌手<span>*</span><input maxLength={200} onChange={(event) => update("artist", event.target.value)} required value={draft.artist} />{error && !draft.artist.trim() && <small role="alert">請輸入歌手。</small>}</label>
    <label>分類<select onChange={(event) => update("categoryId", event.target.value || null)} value={draft.categoryId ?? ""}><option value="">未分類</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
    {error && <p className="notice error" role="alert">{error}</p>}
    <footer><button className="secondary-button" disabled={pending} onClick={onClose} type="button">取消</button><button className="button" disabled={pending} type="submit">{pending ? "儲存中…" : "儲存歌曲"}</button></footer>
  </form>;
}
