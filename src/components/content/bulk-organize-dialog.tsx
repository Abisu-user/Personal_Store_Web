"use client";

import { useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { TaxonomyMultiSelect } from "@/components/content/taxonomy-multi-select";

type Folder = { id: string; name: string; is_visible: boolean };
type Category = { id: string; name: string; folder_id: string | null };

export type BulkOrganizeChange = { mode: "add" | "remove" | "replace"; folderIds: string[]; categoryIds: string[] };

export function BulkOrganizeDialog({ categories, count, folders, onClose, onSave, open, pending }: { categories: Category[]; count: number; folders: Folder[]; onClose: () => void; onSave: (change: BulkOrganizeChange) => void; open: boolean; pending: boolean }) {
  const [mode, setMode] = useState<BulkOrganizeChange["mode"]>("add");
  const [formKey, setFormKey] = useState(0);
  const close = () => { if (pending) return; setMode("add"); setFormKey((value) => value + 1); onClose(); };
  return <ModalDialog className="mobile-sheet-dialog" onClose={close} open={open} pending={pending} title="批量整理選取資料"><form className="collection-category-dialog" key={formKey} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const change = { mode, folderIds: form.getAll("folderIds").map(String), categoryIds: form.getAll("categoryIds").map(String) }; setMode("add"); setFormKey((value) => value + 1); onSave(change); }}><p>整理 {count} 筆資料。預設「加入」會保留原有歸屬，不會覆蓋既有類別。</p><label>操作方式<select disabled={pending} onChange={(event) => setMode(event.target.value as BulkOrganizeChange["mode"])} value={mode}><option value="add">加入資料夾／類別</option><option value="remove">移除資料夾／類別</option><option value="replace">取代目前所有歸屬</option></select></label><TaxonomyMultiSelect categories={categories} disabled={pending} folders={folders} /><div className="dialog-actions"><button className="secondary-button" disabled={pending} onClick={close} type="button">取消</button><button className="button" disabled={pending} type="submit">套用批量整理</button></div></form></ModalDialog>;
}
