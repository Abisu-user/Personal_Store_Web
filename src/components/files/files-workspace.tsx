"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FilesWorkspaceData } from "@/lib/files/types";

const maxFileBytes = 52_428_800;
const formatBytes = (value: number) => value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;

async function sha256(file: File) { const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

export function FilesWorkspace({ initialData }: { initialData: FilesWorkspaceData }) {
  const [data, setData] = useState(initialData); const [query, setQuery] = useState(""); const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { const response = await fetch("/api/files", { cache: "no-store" }); if (!response.ok) { setError("目前無法讀取檔案。"); return; } setData(await response.json() as FilesWorkspaceData); }, []);
  const files = useMemo(() => data.files.filter((file) => `${file.title} ${file.description ?? ""} ${file.originalFilename} ${file.tags.map((tag) => tag.name).join(" ")}`.toLowerCase().includes(query.toLowerCase())), [data.files, query]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const file = form.get("file"); if (!(file instanceof File) || !file.size) { setError("請選擇檔案。"); return; } if (file.size > maxFileBytes) { setError("單一檔案上限為 50 MB。"); return; }
    setPending(true); setError(null);
    try {
      const hash = await sha256(file); const ticketResponse = await fetch("/api/files/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ originalFilename: file.name, mimeType: file.type || "application/octet-stream", byteSize: file.size, sha256: hash }) }); const ticket = await ticketResponse.json(); if (!ticketResponse.ok) throw new Error(ticket.error ?? "無法準備上傳。");
      const { error: uploadError } = await createClient().storage.from("vault-files").uploadToSignedUrl(ticket.storagePath, ticket.token, file, { contentType: file.type || "application/octet-stream" }); if (uploadError) throw uploadError;
      const completeResponse = await fetch("/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: ticket.ticket, title: String(form.get("title") || file.name), description: String(form.get("description") || ""), categoryId: String(form.get("categoryId") || "") || null, tags: String(form.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean) }) }); const completed = await completeResponse.json(); if (!completeResponse.ok) throw new Error(completed.error ?? "無法完成上傳。");
      event.currentTarget.reset(); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "無法上傳檔案。"); } finally { setPending(false); }
  }

  async function download(id: string) { setError(null); const response = await fetch(`/api/files?download=${encodeURIComponent(id)}`, { cache: "no-store" }); const result = await response.json().catch(() => null); if (!response.ok || !result?.url) { setError(result?.error ?? "無法準備下載。"); return; } window.location.assign(result.url); }
  async function remove(id: string) { if (!window.confirm("確定要永久刪除這個檔案嗎？")) return; setPending(true); const response = await fetch("/api/files", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); setPending(false); if (!response.ok) { setError("無法刪除檔案。"); return; } await load(); }

  return <section className="files-workspace">{error && <p className="notice error" role="alert">{error}</p>}<form className="file-upload-form" onSubmit={upload}><div><p className="eyebrow">PRIVATE FILE STORAGE</p><h2>上傳檔案</h2><p>檔案直接傳至私有儲存空間，最大 50 MB。</p></div><input aria-label="選擇檔案" name="file" required type="file" /><input aria-label="檔案標題" name="title" placeholder="檔案標題（未填則使用檔名）" /><textarea aria-label="檔案說明" name="description" placeholder="說明（選填）" rows={2} /><div className="file-upload-meta"><select aria-label="分類" defaultValue="" name="categoryId"><option value="">未分類</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><input aria-label="標籤" name="tags" placeholder="標籤，以逗號分隔" /></div><button className="button" disabled={pending} type="submit">{pending ? "上傳中…" : "上傳至保管庫"}</button></form><div className="file-toolbar"><input aria-label="搜尋檔案" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋檔案名稱、說明或標籤" value={query} /></div><div className="file-list">{files.map((file) => <article className="file-card" key={file.id}><div><p className="bookmark-meta">{file.category?.name ?? "未分類"}</p><h3>{file.title}</h3><p>{file.description}</p><small>{file.originalFilename} · {formatBytes(file.byteSize)} · {file.mimeType}</small><div className="tag-line">{file.tags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}</div></div><div className="file-actions"><button className="button secondary compact" onClick={() => void download(file.id)} type="button">下載</button><button className="delete-button" disabled={pending} onClick={() => void remove(file.id)} type="button">刪除</button></div></article>)}{files.length === 0 && <p className="lead">尚未找到檔案。</p>}</div></section>;
}
