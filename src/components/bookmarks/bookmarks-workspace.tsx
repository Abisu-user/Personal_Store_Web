"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Category = { id: string; name: string; sort_order: number };
type Tag = { id: string; name: string; color: string | null };
type Bookmark = { id: string; title: string; description: string | null; category: Category | null; detail: { url: string } | null; tags: Tag[] };
type Data = { bookmarks: Bookmark[]; categories: Category[]; tags: Tag[] };

export function BookmarksWorkspace() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const load = useCallback(async () => {
    const result = await fetch("/api/bookmarks", { cache: "no-store" });
    if (!result.ok) { setError("目前無法讀取書籤。"); return; }
    setData(await result.json() as Data);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const filtered = useMemo(() => (data?.bookmarks ?? []).filter((bookmark) => {
    const text = `${bookmark.title} ${bookmark.description ?? ""} ${bookmark.detail?.url ?? ""} ${bookmark.tags.map((tag) => tag.name).join(" ")}`.toLowerCase();
    return (category === "all" || bookmark.category?.id === category) && text.includes(query.toLowerCase());
  }), [data, query, category]);

  async function createBookmark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null);
    const form = new FormData(event.currentTarget);
    const body = { url: String(form.get("url") ?? ""), title: String(form.get("title") ?? ""), description: String(form.get("description") ?? ""), categoryId: String(form.get("categoryId") ?? "") || null, tags: String(form.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean) };
    const result = await fetch("/api/bookmarks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setPending(false);
    if (!result.ok) { const message = await result.json().catch(() => null); setError(message?.error ?? "無法儲存書籤。"); return; }
    event.currentTarget.reset(); await load();
  }

  async function deleteBookmark(id: string) {
    if (!window.confirm("確定刪除此書籤？此動作無法復原。")) return;
    const result = await fetch("/api/bookmarks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!result.ok) { setError("無法刪除書籤。"); return; } await load();
  }

  async function createTaxonomy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = await fetch("/api/taxonomy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: form.get("kind"), name: form.get("name") }) });
    if (!result.ok) { const message = await result.json().catch(() => null); setError(message?.error ?? "無法建立項目。"); return; }
    event.currentTarget.reset(); await load();
  }

  async function deleteTaxonomy(kind: "category" | "tag", id: string) {
    if (!window.confirm(`確定刪除此${kind === "category" ? "分類" : "標籤"}？`)) return;
    const result = await fetch("/api/taxonomy", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id }) });
    if (!result.ok) { setError("無法刪除項目。"); return; } await load();
  }

  if (!data && !error) return <p className="lead">正在讀取收藏…</p>;
  return <section className="bookmarks-workspace">
    {error && <p className="notice error" role="alert">{error}</p>}
    <form className="bookmark-form" id="new-bookmark" onSubmit={createBookmark}>
      <h2>新增書籤</h2><input aria-label="網址" name="url" placeholder="https://example.com" required type="url" />
      <input aria-label="標題" name="title" placeholder="標題" required /><textarea aria-label="備註" name="description" placeholder="備註（選填）" rows={2} />
      <select aria-label="分類" defaultValue="" name="categoryId"><option value="">未分類</option>{data?.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <input aria-label="標籤" name="tags" placeholder="標籤，以逗號分隔" /><button className="button" disabled={pending} type="submit">{pending ? "儲存中…" : "儲存書籤"}</button>
    </form>
    <form className="taxonomy-form" onSubmit={createTaxonomy}><select aria-label="項目類型" defaultValue="category" name="kind"><option value="category">分類</option><option value="tag">標籤</option></select><input aria-label="分類或標籤名稱" name="name" placeholder="新增分類或標籤" required /><button className="button secondary" type="submit">新增</button></form>
    <div className="taxonomy-chips"><div>{data?.categories.map((item) => <span className="chip" key={item.id}>{item.name}<button aria-label={`刪除分類 ${item.name}`} onClick={() => void deleteTaxonomy("category", item.id)} type="button">×</button></span>)}</div><div>{data?.tags.map((item) => <span className="chip tag" key={item.id}>#{item.name}<button aria-label={`刪除標籤 ${item.name}`} onClick={() => void deleteTaxonomy("tag", item.id)} type="button">×</button></span>)}</div></div>
    <div className="bookmark-toolbar"><input aria-label="搜尋書籤" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋標題、網址或標籤" value={query} /><select aria-label="篩選分類" onChange={(event) => setCategory(event.target.value)} value={category}><option value="all">所有分類</option>{data?.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <div className="bookmark-list">{filtered.map((bookmark) => <article className="bookmark-card" key={bookmark.id}><div><p className="bookmark-meta">{bookmark.category?.name ?? "未分類"}</p><a className="bookmark-title" href={bookmark.detail?.url} rel="noreferrer noopener" target="_blank">{bookmark.title}</a><p>{bookmark.description}</p><div className="tag-line">{bookmark.tags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}</div></div><button aria-label={`刪除 ${bookmark.title}`} className="delete-button" onClick={() => void deleteBookmark(bookmark.id)} type="button">刪除</button></article>)}{filtered.length === 0 && <p className="lead">尚無符合條件的書籤。</p>}</div>
  </section>;
}
