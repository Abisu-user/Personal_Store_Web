"use client";

import { FormEvent, FocusEvent, useCallback, useMemo, useState } from "react";
import type { Bookmark, BookmarksWorkspaceData } from "@/lib/bookmarks/types";

type View = "all" | "favorite" | "pinned" | "archived" | "trash";
type Confirmation =
  | { kind: "bookmark"; id: string; title: string; action: "trash" | "permanent" }
  | { kind: "taxonomy"; id: string; title: string; taxonomyKind: "category" | "tag" };
type DraftPreview = { hostname: string; title: string | null; description: string | null; imageUrl: string | null; faviconUrl: string | null };

const viewLabels: Record<View, string> = { all: "全部", favorite: "我的最愛", pinned: "置頂", archived: "封存", trash: "垃圾桶" };

function WebsitePreview({ bookmark }: { bookmark: Bookmark }) {
  const url = bookmark.detail?.url;
  let hostname = "網站連結";
  let fallbackFaviconUrl: string | null = null;
  try {
    if (url) {
      const parsed = new URL(url);
      hostname = parsed.hostname.replace(/^www\./, "");
      fallbackFaviconUrl = new URL("/favicon.ico", parsed.origin).toString();
    }
  } catch { /* A saved bookmark always has a validated URL; keep a safe fallback for old records. */ }

  const imageUrl = bookmark.detail?.favicon_url ?? fallbackFaviconUrl;
  return <a className={imageUrl ? "bookmark-preview has-image" : "bookmark-preview"} href={url} rel="noreferrer noopener" target="_blank">
    <span aria-hidden="true" className="bookmark-preview-fallback">{hostname.slice(0, 1).toUpperCase()}</span>
    {imageUrl && <img alt="" loading="lazy" referrerPolicy="no-referrer" src={imageUrl} />}
    <span>{hostname}</span>
  </a>;
}

export function BookmarksWorkspace({ initialData }: { initialData: BookmarksWorkspaceData }) {
  const [data, setData] = useState<BookmarksWorkspaceData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState<View>("all");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [draftPreview, setDraftPreview] = useState<DraftPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    const result = await fetch("/api/bookmarks", { cache: "no-store" });
    if (!result.ok) { setError("目前無法讀取書籤。"); return; }
    setData(await result.json() as BookmarksWorkspaceData);
  }, []);

  const bookmarksForView = useCallback((bookmark: Bookmark) => {
    if (view === "trash") return Boolean(bookmark.deletedAt);
    if (bookmark.deletedAt) return false;
    if (view === "favorite") return bookmark.favorite && !bookmark.archived;
    if (view === "pinned") return bookmark.pinned && !bookmark.archived;
    if (view === "archived") return bookmark.archived;
    return !bookmark.archived;
  }, [view]);

  const filtered = useMemo(() => data.bookmarks.filter((bookmark) => {
    const text = `${bookmark.title} ${bookmark.description ?? ""} ${bookmark.detail?.url ?? ""} ${bookmark.tags.map((tag) => tag.name).join(" ")}`.toLowerCase();
    return bookmarksForView(bookmark) && (category === "all" || bookmark.category?.id === category) && text.includes(query.toLowerCase());
  }), [bookmarksForView, category, data.bookmarks, query]);

  const counts = useMemo(() => data.bookmarks.reduce<Record<View, number>>((total, bookmark) => {
    if (bookmark.deletedAt) { total.trash += 1; return total; }
    if (bookmark.archived) total.archived += 1;
    else { total.all += 1; if (bookmark.favorite) total.favorite += 1; if (bookmark.pinned) total.pinned += 1; }
    return total;
  }, { all: 0, favorite: 0, pinned: 0, archived: 0, trash: 0 }), [data.bookmarks]);

  async function createBookmark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; setPending(true); setError(null);
    const form = new FormData(formElement);
    const body = { url: String(form.get("url") ?? ""), title: String(form.get("title") ?? ""), description: String(form.get("description") ?? ""), categoryId: String(form.get("categoryId") ?? "") || null, tags: String(form.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean) };
    const result = await fetch("/api/bookmarks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setPending(false);
    if (!result.ok) { const message = await result.json().catch(() => null); setError(message?.error ?? "無法儲存書籤。"); return; }
    formElement.reset(); setDraftPreview(null); await load();
  }

  async function previewBookmark(event: FocusEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const url = input.value.trim();
    if (!url) { setDraftPreview(null); return; }
    try { new URL(url); } catch { return; }
    setPreviewing(true); setError(null);
    try {
      const result = await fetch("/api/bookmarks/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const payload = await result.json().catch(() => null) as DraftPreview | { error?: string } | null;
      if (!result.ok || !payload || !("hostname" in payload) || typeof payload.hostname !== "string") { setDraftPreview(null); return; }
      const preview = payload;
      setDraftPreview(preview);
      const form = input.form;
      const title = form?.elements.namedItem("title");
      const description = form?.elements.namedItem("description");
      if (title instanceof HTMLInputElement && !title.value) title.value = preview.title ?? preview.hostname;
      if (description instanceof HTMLTextAreaElement && !description.value && preview.description) description.value = preview.description;
    } finally { setPreviewing(false); }
  }

  async function updateBookmark(id: string, action: "toggle_favorite" | "toggle_pinned" | "archive" | "unarchive" | "restore") {
    setPending(true); setError(null);
    const result = await fetch("/api/bookmarks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    setPending(false);
    if (!result.ok) { const message = await result.json().catch(() => null); setError(message?.error ?? "無法更新書籤狀態。"); return; }
    await load();
  }

  async function trashBookmark(id: string) {
    setPending(true); setError(null);
    const result = await fetch("/api/bookmarks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "trash" }) });
    setPending(false); setConfirmation(null);
    if (!result.ok) { setError("無法移至垃圾桶。"); return; }
    await load();
  }

  async function permanentlyDeleteBookmark(id: string) {
    setPending(true); setError(null);
    const result = await fetch("/api/bookmarks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setPending(false); setConfirmation(null);
    if (!result.ok) { setError("無法永久刪除書籤。"); return; }
    await load();
  }

  async function createTaxonomy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const result = await fetch("/api/taxonomy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: form.get("kind"), name: form.get("name") }) });
    if (!result.ok) { const message = await result.json().catch(() => null); setError(message?.error ?? "無法建立項目。"); return; }
    formElement.reset(); await load();
  }

  async function deleteTaxonomy(kind: "category" | "tag", id: string) {
    setPending(true); setError(null);
    const result = await fetch("/api/taxonomy", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id }) });
    setPending(false); setConfirmation(null);
    if (!result.ok) { setError("無法刪除項目。"); return; }
    await load();
  }

  async function confirmAction() {
    if (!confirmation) return;
    if (confirmation.kind === "taxonomy") await deleteTaxonomy(confirmation.taxonomyKind, confirmation.id);
    else if (confirmation.action === "trash") await trashBookmark(confirmation.id);
    else await permanentlyDeleteBookmark(confirmation.id);
  }

  return <section className="bookmarks-workspace">
    {error && <p className="notice error" role="alert">{error}</p>}
    <form className="bookmark-form" id="new-bookmark" onSubmit={createBookmark}>
      <h2>新增書籤</h2><input aria-label="網址" name="url" onBlur={(event) => void previewBookmark(event)} placeholder="貼上網址後自動帶入標題與預覽圖" required type="url" />
      {previewing && <p className="bookmark-preview-loading" role="status">正在取得連結預覽…</p>}{draftPreview && <div className="bookmark-draft-preview">{(draftPreview.imageUrl ?? draftPreview.faviconUrl) && <img alt="" referrerPolicy="no-referrer" src={draftPreview.imageUrl ?? draftPreview.faviconUrl ?? undefined} />}<div><strong>{draftPreview.title ?? draftPreview.hostname}</strong>{draftPreview.description && <span>{draftPreview.description}</span>}<small>{draftPreview.hostname}</small></div></div>}
      <input aria-label="標題" name="title" placeholder="標題會自動帶入，也可自行改寫" /><textarea aria-label="備註" name="description" placeholder="備註（選填）" rows={2} />
      <select aria-label="分類" defaultValue="" name="categoryId"><option value="">未分類</option>{data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <input aria-label="標籤" name="tags" placeholder="標籤，以逗號分隔" /><button className="button" disabled={pending} type="submit">{pending ? "儲存中…" : "儲存書籤"}</button>
    </form>
    <form className="taxonomy-form" onSubmit={createTaxonomy}><select aria-label="項目類型" defaultValue="category" name="kind"><option value="category">分類</option><option value="tag">標籤</option></select><input aria-label="分類或標籤名稱" name="name" placeholder="新增分類或標籤" required /><button className="button secondary" type="submit">新增</button></form>
    <div className="taxonomy-chips"><div>{data.categories.map((item) => <span className="chip" key={item.id}>{item.name}<button aria-label={`刪除分類 ${item.name}`} onClick={() => setConfirmation({ kind: "taxonomy", taxonomyKind: "category", id: item.id, title: item.name })} type="button">×</button></span>)}</div><div>{data.tags.map((item) => <span className="chip tag" key={item.id}>#{item.name}<button aria-label={`刪除標籤 ${item.name}`} onClick={() => setConfirmation({ kind: "taxonomy", taxonomyKind: "tag", id: item.id, title: item.name })} type="button">×</button></span>)}</div></div>
    <div className="bookmark-view-tabs" role="tablist" aria-label="書籤狀態">{(Object.keys(viewLabels) as View[]).map((item) => <button aria-selected={view === item} className={view === item ? "active" : ""} key={item} onClick={() => setView(item)} role="tab" type="button">{viewLabels[item]} <span>{counts[item]}</span></button>)}</div>
    <div className="bookmark-toolbar"><input aria-label="搜尋書籤" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋標題、網址或標籤" value={query} /><select aria-label="篩選分類" onChange={(event) => setCategory(event.target.value)} value={category}><option value="all">所有分類</option>{data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <div className="bookmark-list">{filtered.map((bookmark) => <article className="bookmark-card" key={bookmark.id}><WebsitePreview bookmark={bookmark} /><div className="bookmark-card-content"><p className="bookmark-meta">{bookmark.category?.name ?? "未分類"}</p><a className="bookmark-title" href={bookmark.detail?.url} rel="noreferrer noopener" target="_blank">{bookmark.title}</a><p>{bookmark.description}</p><div className="bookmark-status">{bookmark.favorite && <span>★ 我的最愛</span>}{bookmark.pinned && <span>⌖ 已置頂</span>}{bookmark.archived && <span>已封存</span>}</div><div className="tag-line">{bookmark.tags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}</div></div><div className="bookmark-actions">{bookmark.deletedAt ? <><button className="secondary-button" disabled={pending} onClick={() => void updateBookmark(bookmark.id, "restore")} type="button">還原</button><button className="delete-button" disabled={pending} onClick={() => setConfirmation({ kind: "bookmark", id: bookmark.id, title: bookmark.title, action: "permanent" })} type="button">永久刪除</button></> : <><button className="secondary-button" disabled={pending} onClick={() => void updateBookmark(bookmark.id, "toggle_favorite")} type="button">{bookmark.favorite ? "取消收藏" : "收藏"}</button><button className="secondary-button" disabled={pending} onClick={() => void updateBookmark(bookmark.id, "toggle_pinned")} type="button">{bookmark.pinned ? "取消置頂" : "置頂"}</button><button className="secondary-button" disabled={pending} onClick={() => void updateBookmark(bookmark.id, bookmark.archived ? "unarchive" : "archive")} type="button">{bookmark.archived ? "取消封存" : "封存"}</button><button className="delete-button" disabled={pending} onClick={() => setConfirmation({ kind: "bookmark", id: bookmark.id, title: bookmark.title, action: "trash" })} type="button">移至垃圾桶</button></>}</div></article>)}{filtered.length === 0 && <p className="lead">{view === "trash" ? "垃圾桶目前是空的。" : "尚無符合條件的書籤。"}</p>}</div>
    {confirmation && <div aria-modal="true" className="inline-dialog" role="alertdialog"><p>{confirmation.kind === "bookmark" ? confirmation.action === "permanent" ? `確定永久刪除「${confirmation.title}」？此操作無法復原。` : `確定將「${confirmation.title}」移至垃圾桶？你之後仍可還原。` : `確定刪除${confirmation.taxonomyKind === "category" ? "分類" : "標籤"}「${confirmation.title}」？`}</p><div><button className="delete-button" disabled={pending} onClick={() => void confirmAction()} type="button">確認</button><button className="secondary-button" disabled={pending} onClick={() => setConfirmation(null)} type="button">取消</button></div></div>}
  </section>;
}
