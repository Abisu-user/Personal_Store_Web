"use client";

import { FormEvent, useState } from "react";
import { TaxonomyMultiSelect } from "@/components/content/taxonomy-multi-select";
import { CreateFormActions } from "@/components/ui/create-form-actions";
import { AppIcon } from "@/components/ui/app-icon";
import { defaultVaultFields, newVaultField, type VaultField } from "./vault-fields";
import styles from "./vault-ui.module.css";

type Category = { id: string; name: string };
type Draft = { label: string; notes: string; fields: VaultField[]; categoryIds: string[] };

export function VaultItemEditor({
  initial,
  categories,
  pending,
  error,
  onCancel,
  onSave,
}: {
  initial?: Draft;
  categories: Category[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (event: FormEvent<HTMLFormElement>, fields: VaultField[]) => void;
}) {
  const [fields, setFields] = useState<VaultField[]>(() => initial?.fields.map((field) => ({ ...field })) ?? defaultVaultFields());
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [confirmFieldId, setConfirmFieldId] = useState<string | null>(null);

  function updateField(id: string, change: Partial<VaultField>) {
    setFields((current) => current.map((field) => field.id === id ? { ...field, ...change } : field));
  }
  function removeField(id: string) {
    setFields((current) => current.filter((field) => field.id !== id));
    setConfirmFieldId(null);
    setRevealed((current) => { const next = new Set(current); next.delete(id); return next; });
  }
  function requestRemove(field: VaultField) {
    if (!field.value) removeField(field.id);
    else setConfirmFieldId(field.id);
  }
  function toggleReveal(id: string) {
    setRevealed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  return <form className={`vault-item-form ${styles.editor}`} onSubmit={(event) => onSave(event, fields)}>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className={styles.editorColumns}>
      <div className={styles.editorBasics}>
        <label>項目名稱<input autoComplete="off" defaultValue={initial?.label ?? ""} name="label" placeholder="例如：主要銀行" required /></label>
        <TaxonomyMultiSelect
          categories={categories.map((category) => ({ ...category, folder_id: null }))}
          defaultCategoryIds={initial?.categoryIds ?? []}
          folders={[]}
          showFolders={false}
        />
        <label>備註<textarea defaultValue={initial?.notes ?? ""} name="notes" placeholder="選填" rows={3} /></label>
      </div>
      <section className={styles.editorFields} aria-label="登入資料與自訂欄位">
        <div className={styles.editorSectionTitle}><strong>登入資料</strong><span>欄位名稱、類型與內容都可自行調整</span></div>
        {fields.map((field) => <article className={styles.fieldEditorCard} key={field.id}>
          <div className={styles.fieldEditorTop}>
            <label className={styles.fieldLabel}>欄位名稱<input aria-label="欄位名稱" onChange={(event) => updateField(field.id, { label: event.target.value })} placeholder="自訂欄位" value={field.label} /></label>
            <button aria-label={`移除 ${field.label || "自訂欄位"} 欄位`} className={styles.removeField} onClick={() => requestRemove(field)} type="button"><AppIcon name="trash" /></button>
          </div>
          <div className={styles.fieldValue}><label htmlFor={field.id}>欄位內容</label><div className={styles.fieldInputRow}><input autoComplete="off" id={field.id} onChange={(event) => updateField(field.id, { value: event.target.value })} placeholder={field.type === "password" ? "輸入敏感內容" : "輸入內容"} type={field.type === "password" && !revealed.has(field.id) ? "password" : "text"} value={field.value} />{field.type === "password" && <button aria-label={revealed.has(field.id) ? `隱藏 ${field.label}` : `顯示 ${field.label}`} onClick={() => toggleReveal(field.id)} type="button">{revealed.has(field.id) ? "隱藏" : "顯示"}</button>}</div></div>
          <div className={styles.fieldType} role="group" aria-label={`${field.label || "自訂欄位"}的類型`}><button aria-pressed={field.type === "text"} className={field.type === "text" ? styles.active : ""} onClick={() => updateField(field.id, { type: "text" })} type="button">一般文字</button><button aria-pressed={field.type === "password"} className={field.type === "password" ? styles.active : ""} onClick={() => { updateField(field.id, { type: "password" }); setRevealed((current) => { const next = new Set(current); next.delete(field.id); return next; }); }} type="button">密碼／敏感</button></div>
          {confirmFieldId === field.id && <div className={styles.fieldRemoveConfirm} role="alertdialog" aria-label="確認移除欄位"><span>確定移除「{field.label || "自訂欄位"}」欄位？</span><button onClick={() => setConfirmFieldId(null)} type="button">取消</button><button onClick={() => removeField(field.id)} type="button">移除</button></div>}
        </article>)}
        <button className={styles.addField} onClick={() => setFields((current) => [...current, newVaultField("text", current.length, "自訂欄位")])} type="button"><AppIcon name="plus" />新增自訂欄位</button>
      </section>
    </div>
    <CreateFormActions label="儲存保管項目" onCancel={onCancel} pending={pending} pendingLabel="加密儲存中…" />
  </form>;
}
