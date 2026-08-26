"use client";

import { useEffect, useMemo, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";

type Folder = { id: string; name: string; is_visible: boolean };
type Category = { id: string; name: string; folder_id: string | null };

export function BulkOrganizeDialog({ categories, count, folders, onClose, onSave, open, pending }: { categories: Category[]; count: number; folders: Folder[]; onClose: () => void; onSave: (folderId: string | null, categoryId: string | null) => void; open: boolean; pending: boolean }) {
  const [folderId, setFolderId] = useState(""); const [categoryId, setCategoryId] = useState("");
  useEffect(() => { if (open) { setFolderId(""); setCategoryId(""); } }, [open]);
  const scoped = useMemo(() => categories.filter((category) => (category.folder_id ?? null) === (folderId || null)), [categories, folderId]);
  return <ModalDialog className="mobile-sheet-dialog" onClose={() => !pending && onClose()} open={open} pending={pending} title="移動選取資料"><form className="collection-category-dialog" onSubmit={(event) => { event.preventDefault(); onSave(folderId || null, categoryId || null); }}><p>將 {count} 筆資料移到一個資料夾；類別會依目標資料夾自動限制。</p><label>目標資料夾<select disabled={pending} onChange={(event) => { setFolderId(event.target.value); setCategoryId(""); }} value={folderId}><option value="">未整理</option>{folders.filter((folder) => folder.is_visible).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><label>類別<select disabled={pending} onChange={(event) => setCategoryId(event.target.value)} value={categoryId}><option value="">未分類</option>{scoped.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><p className="hint">目前每筆資料使用一個主類別；若需要一筆資料同時擁有多個類別，會以新的多對多資料模型另外升級，避免影響既有資料。</p><div className="dialog-actions"><button className="secondary-button" disabled={pending} onClick={onClose} type="button">取消</button><button className="button" disabled={pending} type="submit">移動資料</button></div></form></ModalDialog>;
}
