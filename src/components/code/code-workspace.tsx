"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import type { CodeSnippet, CodeWorkspaceData } from "@/lib/code/types";

const languages = ["TypeScript", "JavaScript", "Python", "SQL", "HTML", "CSS", "JSON", "Shell", "Other"];
type Draft = { title: string; description: string; language: string; sourceCode: string; categoryId: string; tags: string };
const emptyDraft: Draft = { title: "", description: "", language: "TypeScript", sourceCode: "", categoryId: "", tags: "" };
const toDraft = (snippet: CodeSnippet): Draft => ({ title: snippet.title, description: snippet.description ?? "", language: snippet.language, sourceCode: snippet.sourceCode, categoryId: snippet.category?.id ?? "", tags: snippet.tags.map((tag) => tag.name).join(", ") });

export function CodeWorkspace({ initialData }: { initialData: CodeWorkspaceData }) {
  const [data, setData] = useState(initialData); const [draft, setDraft] = useState<Draft>(emptyDraft); const [selectedId, setSelectedId] = useState<string | null>(null); const [query, setQuery] = useState(""); const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { const response = await fetch("/api/code", { cache: "no-store" }); if (!response.ok) { setError("目前無法讀取程式碼片段。"); return; } setData(await response.json() as CodeWorkspaceData); }, []);
  const snippets = useMemo(() => data.snippets.filter((snippet) => `${snippet.title} ${snippet.description ?? ""} ${snippet.language} ${snippet.sourceCode} ${snippet.tags.map((tag) => tag.name).join(" ")}`.toLowerCase().includes(query.toLowerCase())), [data.snippets, query]);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const startNew = () => { setSelectedId(null); setDraft(emptyDraft); setError(null); };
  const select = (snippet: CodeSnippet) => { setSelectedId(snippet.id); setDraft(toDraft(snippet)); setError(null); };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null);
    const body = { ...draft, categoryId: draft.categoryId || null, tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean) };
    const response = await fetch("/api/code", { method: selectedId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selectedId ? { ...body, id: selectedId } : body) });
    setPending(false); if (!response.ok) { const message = await response.json().catch(() => null); setError(message?.error ?? "無法儲存程式碼片段。"); return; }
    await load(); if (!selectedId) startNew();
  }

  async function remove() {
    if (!selectedId || !window.confirm("確定要刪除這個程式碼片段嗎？")) return;
    setPending(true); const response = await fetch("/api/code", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selectedId }) }); setPending(false);
    if (!response.ok) { setError("無法刪除程式碼片段。"); return; } startNew(); await load();
  }

  return <section className="code-workspace">
    {error && <p className="notice error" role="alert">{error}</p>}
    <aside className="code-list-panel"><div className="notes-list-header"><div><p className="eyebrow">SNIPPET LIBRARY</p><h2>程式片段</h2></div><button className="button compact" onClick={startNew} type="button">＋ 新片段</button></div><input aria-label="搜尋程式碼片段" className="note-search" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋標題、語言或內容" value={query} /><div className="notes-list">{snippets.map((snippet) => <button className={snippet.id === selectedId ? "note-list-item active" : "note-list-item"} key={snippet.id} onClick={() => select(snippet)} type="button"><strong>{snippet.title}</strong><span>{snippet.description || snippet.sourceCode.slice(0, 72)}</span><small>{snippet.language}{snippet.category ? ` · ${snippet.category.name}` : ""}</small></button>)}{snippets.length === 0 && <p className="lead">尚未找到程式碼片段。</p>}</div></aside>
    <form className="code-editor" onSubmit={save}><div className="note-editor-heading"><div><p className="eyebrow">{selectedId ? "EDIT SNIPPET" : "CREATE SNIPPET"}</p><h2>{selectedId ? "編輯程式片段" : "建立程式片段"}</h2></div></div><input aria-label="片段標題" onChange={(event) => update("title", event.target.value)} placeholder="片段標題" required value={draft.title} /><textarea aria-label="片段摘要" onChange={(event) => update("description", event.target.value)} placeholder="摘要（選填）" rows={2} value={draft.description} /><div className="code-editor-meta"><select aria-label="程式語言" onChange={(event) => update("language", event.target.value)} value={draft.language}>{languages.map((language) => <option key={language}>{language}</option>)}</select><select aria-label="分類" onChange={(event) => update("categoryId", event.target.value)} value={draft.categoryId}><option value="">未分類</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><input aria-label="標籤" onChange={(event) => update("tags", event.target.value)} placeholder="標籤，以逗號分隔" value={draft.tags} /></div><textarea aria-label="原始程式碼" className="source-code" onChange={(event) => update("sourceCode", event.target.value)} placeholder="貼上程式碼…" required rows={17} spellCheck={false} value={draft.sourceCode} /><div className="note-editor-actions"><button className="button" disabled={pending} type="submit">{pending ? "儲存中…" : selectedId ? "儲存修改" : "建立片段"}</button>{selectedId && <button className="delete-button" disabled={pending} onClick={() => void remove()} type="button">刪除片段</button>}</div></form>
  </section>;
}
