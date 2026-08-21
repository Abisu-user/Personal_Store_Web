"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const choices = [
  { href: "/create/bookmark", icon: "◇", title: "收藏網址", description: "貼上連結，自動取得標題與預覽縮圖。" },
  { href: "/create/note", icon: "□", title: "建立筆記", description: "記下文字、想法與 Markdown 內容。" },
  { href: "/create/code", icon: "⌘", title: "建立程式碼", description: "儲存程式片段、語言與說明。" },
  { href: "/create/file", icon: "▣", title: "上傳檔案", description: "上傳到受保護的私人檔案空間。" },
];

export default function CreatePage() {
  const router = useRouter();
  return <main className="dashboard"><section className="dashboard-card"><p className="eyebrow">CREATE NEW ITEM</p><h1>新增資料</h1><p>選擇想要新增的資料類型；你的收藏、筆記、程式碼與檔案頁會專心顯示已儲存的內容。</p><div className="create-choice-grid">{choices.map((choice) => <Link className="create-choice" href={choice.href} key={choice.href} onFocus={() => router.prefetch(choice.href)} onMouseEnter={() => router.prefetch(choice.href)} prefetch><i>{choice.icon}</i><div><h2>{choice.title}</h2><p>{choice.description}</p></div><span>→</span></Link>)}</div></section></main>;
}
