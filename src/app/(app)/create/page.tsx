"use client";

import { CreateItemButton, type CreateKind } from "@/components/layout/create-item-provider";

const choices = [
  { href: "/create/bookmark", icon: "◇", title: "新增網站收藏", description: "貼上連結，自動取得標題與預覽縮圖。" },
  { href: "/create/note", icon: "□", title: "建立筆記", description: "記下文字、想法與 Markdown 內容。" },
  { href: "/create/code", icon: "⌘", title: "建立程式碼", description: "儲存程式片段、語言與說明。" },
  { href: "/create/file", icon: "▣", title: "上傳檔案", description: "上傳到受保護的私人檔案空間。" },
  { href: "/create/photo", icon: "▧", title: "儲存照片", description: "上傳私有照片，以類別與資料夾整理。" },
  { href: "/vocabulary?new=1", icon: "文", title: "新增單字", description: "記錄日文、英文與其他語言的單字。" },
];

export default function CreatePage() {
  return <main className="dashboard"><section className="dashboard-card"><p className="eyebrow">CREATE NEW ITEM</p><h1>新增資料</h1><p>選擇想要新增的資料類型；你的網站收藏、筆記、程式碼與檔案頁會專心顯示已儲存的內容。</p><div className="create-choice-grid">{choices.map((choice) => <CreateItemButton className="create-choice" kind={(choice.href.includes("vocabulary") ? "vocabulary" : choice.href.split("/").pop()) as CreateKind} key={choice.href}><i>{choice.icon}</i><div><h2>{choice.title}</h2><p>{choice.description}</p></div><span>→</span></CreateItemButton>)}</div></section></main>;
}
