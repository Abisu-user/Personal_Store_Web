"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CatalogItem = {
  id: string; language: "ja" | "en"; word: string; reading: string | null; romaji: string | null; ipa: string | null; meaningZhTw: string; englishDefinition: string | null; partOfSpeech: string | null; jlptLevel: string | null; topics: string[]; importance: number; source: string; license: string; datasetVersion: string;
  userState: { favorite: boolean; learning: boolean; mastered: boolean; cardId: string | null };
};
type Response = { items: CatalogItem[]; page: number; total: number; hasNext: boolean; error?: string };
const kana = ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ"];
const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

export function VocabularyCatalog({ onChanged }: { onChanged: () => Promise<void> }) {
  const [language, setLanguage] = useState<"ja" | "en">("ja");
  const [level, setLevel] = useState("");
  const [startsWith, setStartsWith] = useState("");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Response>({ items: [], page: 1, total: 0, hasNext: false });
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ language, page: String(page), limit: "12" });
    if (level) params.set("level", level);
    if (startsWith) params.set("startsWith", startsWith);
    if (submittedQuery) params.set("q", submittedQuery);
    try {
      const response = await fetch(`/api/vocabulary/catalog?${params.toString()}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "無法讀取內建單字庫。");
      setData(result);
    } catch (error) { setData({ items: [], page, total: 0, hasNext: false, error: error instanceof Error ? error.message : "無法讀取內建單字庫。" }); }
    finally { setLoading(false); }
  }, [language, level, page, startsWith, submittedQuery]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); setStartsWith(""); setChosen(new Set()); }, [language, level, submittedQuery]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 3000); return () => window.clearTimeout(timer); }, [notice]);

  const selectedAll = data.items.length > 0 && data.items.every((item) => chosen.has(item.id));
  const selectedCount = chosen.size;
  const statusLabel = useMemo(() => language === "ja" ? "JLPT 常見單字" : "TOEIC 常見單字", [language]);

  async function mutate(action: "favorite" | "unfavorite" | "learn" | "batchLearn", ids: string[]) {
    if (!ids.length) return;
    setPendingIds((previous) => new Set([...previous, ...ids]));
    try {
      const response = await fetch("/api/vocabulary/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ids }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "操作失敗。");
      setNotice(action === "favorite" ? "已加入收藏。" : action === "unfavorite" ? "已取消收藏。" : `已加入學習 ${ids.length} 筆單字。`);
      setChosen(new Set());
      await Promise.all([load(), onChanged()]);
    } catch (error) { setNotice(error instanceof Error ? error.message : "操作失敗，請稍後再試。"); }
    finally { setPendingIds((previous) => { const next = new Set(previous); ids.forEach((id) => next.delete(id)); return next; }); }
  }

  return <section className="vocabulary-catalog" aria-busy={loading}>
    <header className="vocabulary-catalog-header"><div><p className="eyebrow">BUILT-IN VOCABULARY</p><h2>探索單字庫</h2><p>系統目錄不會計入你的學習統計；只有按「加入學習」後才會建立個人複習資料。</p></div><span>{statusLabel}</span></header>
    {notice && <p className="notice success" role="status">{notice}</p>}
    <div className="vocabulary-catalog-switch" role="tablist" aria-label="單字庫語言"><button aria-selected={language === "ja"} className={language === "ja" ? "active" : ""} onClick={() => setLanguage("ja")} role="tab" type="button">日文 · JLPT</button><button aria-selected={language === "en"} className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} role="tab" type="button">英文 · TOEIC</button></div>
    <form className="vocabulary-catalog-search" onSubmit={(event) => { event.preventDefault(); setSubmittedQuery(query.trim()); }}><input aria-label="搜尋內建單字庫" onChange={(event) => setQuery(event.target.value)} placeholder={language === "ja" ? "搜尋日文、讀音或中文意思" : "搜尋英文、音標或中文意思"} value={query} /><button className="button" type="submit">搜尋</button></form>
    <div className="vocabulary-catalog-filters"><div className="vocabulary-filter-chips"><button className={!level ? "active" : ""} onClick={() => setLevel("")} type="button">全部</button>{language === "ja" ? ["N5", "N4", "N3", "N2", "N1"].map((item) => <button className={level === item ? "active" : ""} key={item} onClick={() => setLevel(item)} type="button">{item}</button>) : <span>職場、商務與 TOEIC 常見單字</span>}</div><div className="vocabulary-catalog-index" aria-label="字首索引">{(language === "ja" ? kana : letters).map((item) => <button className={startsWith === item ? "active" : ""} key={item} onClick={() => { setStartsWith(startsWith === item ? "" : item); setPage(1); }} type="button">{item}</button>)}</div></div>
    <div className="vocabulary-catalog-actions"><p>共 {data.total} 筆 · 依 {language === "ja" ? "讀音" : "字母"} 排列</p><button className="secondary-button compact" onClick={() => { setBatchMode((value) => !value); setChosen(new Set()); }} type="button">{batchMode ? "結束選取" : "批量加入"}</button>{batchMode && <><button className="secondary-button compact" onClick={() => setChosen(selectedAll ? new Set() : new Set(data.items.map((item) => item.id)))} type="button">{selectedAll ? "取消全選" : "全選本頁"}</button><button className="button compact" disabled={!selectedCount || pendingIds.size > 0} onClick={() => void mutate("batchLearn", [...chosen])} type="button">加入學習 {selectedCount || ""}</button></>}</div>
    {data.error ? <div className="vocabulary-empty"><strong>單字庫尚未可用</strong><p>{data.error}</p></div> : <div className="vocabulary-catalog-grid">{loading ? Array.from({ length: 6 }).map((_, index) => <div className="vocabulary-catalog-card skeleton" key={index} />) : data.items.map((item) => <article className="vocabulary-catalog-card" key={item.id}>{batchMode && <label className="vocabulary-catalog-check"><input aria-label={`選取 ${item.word}`} checked={chosen.has(item.id)} onChange={() => setChosen((previous) => { const next = new Set(previous); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })} type="checkbox" /></label>}<div className="vocabulary-catalog-card-top"><div><div className="vocabulary-word-meta"><span className="vocabulary-language-badge">{item.language === "ja" ? "日文" : "英文"}</span>{item.jlptLevel && <span className="vocabulary-level-badge">{item.jlptLevel}</span>}</div><h3>{item.word}</h3><p>{item.reading || item.romaji || item.ipa || "—"}</p></div><button aria-label={item.userState.favorite ? "取消收藏" : "加入收藏"} className={item.userState.favorite ? "vocabulary-star active" : "vocabulary-star"} disabled={pendingIds.has(item.id)} onClick={() => void mutate(item.userState.favorite ? "unfavorite" : "favorite", [item.id])} type="button">★</button></div><strong>{item.meaningZhTw}</strong><p className="vocabulary-catalog-definition">{item.englishDefinition}</p><div className="vocabulary-card-tags">{item.topics.map((topic) => <span key={topic}>{topic}</span>)}</div><footer>{item.userState.mastered ? <em>✓ 已掌握</em> : item.userState.learning ? <em>✓ 已加入學習</em> : <button className="button compact" disabled={pendingIds.has(item.id)} onClick={() => void mutate("learn", [item.id])} type="button">＋ 加入學習</button>}</footer></article>)}</div>}
    {!loading && !data.error && !data.items.length && <div className="vocabulary-empty"><strong>找不到符合的單字</strong><p>試著改用其他關鍵字或移除篩選。</p></div>}
    <nav aria-label="單字庫分頁" className="vocabulary-catalog-pagination"><button className="secondary-button compact" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} type="button">上一頁</button><span>{page} 頁</span><button className="secondary-button compact" disabled={!data.hasNext || loading} onClick={() => setPage((value) => value + 1)} type="button">下一頁</button></nav>
    <small className="vocabulary-catalog-source">資料來源：{data.items[0]?.source || "Personal Vault curated starter set"} · {data.items[0]?.license || "Original curated metadata"} · {data.items[0]?.datasetVersion || "pv-starter-v1"}</small>
  </section>;
}
