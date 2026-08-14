"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import type { Note, NotesWorkspaceData } from "@/lib/notes/types";

type Draft = { title: string; description: string; content: string; categoryId: string; tags: string };
const emptyDraft: Draft = { title: "", description: "", content: "", categoryId: "", tags: "" };

function toDraft(note: Note): Draft {
  return {
    title: note.title,
    description: note.description ?? "",
    content: note.content,
    categoryId: note.category?.id ?? "",
    tags: note.tags.map((tag) => tag.name).join(", "),
  };
}

export function NotesWorkspace({ initialData }: { initialData: NotesWorkspaceData }) {
  const [data, setData] = useState(initialData);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetch("/api/notes", { cache: "no-store" });
    if (!result.ok) { setError("目前無法讀取筆記。"); return; }
    setData(await result.json() as NotesWorkspaceData);
  }, []);

  const filteredNotes = useMemo(() => data.notes.filter((note) => {
    const text = `${note.title} ${note.description ?? ""} ${note.content} ${note.tags.map((tag) => tag.name).join(" ")}`.toLowerCase();
    return text.includes(query.toLowerCase());
  }), [data.notes, query]);

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectNote(note: Note) {
    setSelectedId(note.id);
    setDraft(toDraft(note));
    setError(null);
  }

  function startNewNote() {
    setSelectedId(null);
    setDraft(emptyDraft);
    setError(null);
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError(null);
    const body = {
      ...draft,
      categoryId: draft.categoryId || null,
      tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    };
    const result = await fetch("/api/notes", {
      method: selectedId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selectedId ? { ...body, id: selectedId } : body),
    });
    setPending(false);
    if (!result.ok) {
      const message = await result.json().catch(() => null);
      setError(message?.error ?? "無法儲存筆記。");
      return;
    }
    await load();
    if (!selectedId) startNewNote();
  }

  async function deleteNote() {
    if (!selectedId || !window.confirm("確定要刪除這則筆記嗎？")) return;
    setPending(true); setError(null);
    const result = await fetch("/api/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedId }),
    });
    setPending(false);
    if (!result.ok) { setError("無法刪除筆記。"); return; }
    startNewNote();
    await load();
  }

  return <section className="notes-workspace">
    {error && <p className="notice error" role="alert">{error}</p>}
    <aside className="notes-list-panel">
      <div className="notes-list-header"><div><p className="eyebrow">NOTE LIBRARY</p><h2>我的筆記</h2></div><button className="button compact" onClick={startNewNote} type="button">＋ 新筆記</button></div>
      <input aria-label="搜尋筆記" className="note-search" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋標題、內容或標籤" value={query} />
      <div className="notes-list">
        {filteredNotes.map((note) => <button className={note.id === selectedId ? "note-list-item active" : "note-list-item"} key={note.id} onClick={() => selectNote(note)} type="button"><strong>{note.title}</strong><span>{note.description || note.content.slice(0, 72) || "空白筆記"}</span><small>v{note.currentVersion}{note.category ? ` · ${note.category.name}` : ""}</small></button>)}
        {filteredNotes.length === 0 && <p className="lead">尚未找到筆記。</p>}
      </div>
    </aside>
    <form className="note-editor" onSubmit={saveNote}>
      <div className="note-editor-heading"><div><p className="eyebrow">{selectedId ? "EDIT NOTE" : "CREATE NOTE"}</p><h2>{selectedId ? "編輯筆記" : "建立新筆記"}</h2></div>{selectedId && <span className="note-version">版本 v{data.notes.find((note) => note.id === selectedId)?.currentVersion ?? 1}</span>}</div>
      <input aria-label="筆記標題" onChange={(event) => updateDraft("title", event.target.value)} placeholder="筆記標題" required value={draft.title} />
      <textarea aria-label="筆記摘要" onChange={(event) => updateDraft("description", event.target.value)} placeholder="摘要（選填）" rows={2} value={draft.description} />
      <textarea aria-label="筆記內容" className="note-content" onChange={(event) => updateDraft("content", event.target.value)} placeholder="支援 Markdown 格式。每次修改內容都會保留一個版本快照。" rows={16} value={draft.content} />
      <div className="note-editor-meta"><select aria-label="分類" onChange={(event) => updateDraft("categoryId", event.target.value)} value={draft.categoryId}><option value="">未分類</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><input aria-label="標籤" onChange={(event) => updateDraft("tags", event.target.value)} placeholder="標籤，以逗號分隔" value={draft.tags} /></div>
      <div className="note-editor-actions"><button className="button" disabled={pending} type="submit">{pending ? "儲存中…" : selectedId ? "儲存修改" : "建立筆記"}</button>{selectedId && <button className="delete-button" disabled={pending} onClick={() => void deleteNote()} type="button">刪除筆記</button>}</div>
    </form>
  </section>;
}
