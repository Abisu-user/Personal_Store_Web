"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";

type CatalogItem = {
  id: string; language: "ja" | "en"; word: string; reading: string | null; romaji: string | null; ipa: string | null; meaningZhTw: string; englishDefinition: string | null; partOfSpeech: string | null; jlptLevel: string | null; topics: string[]; importance: number; source: string; license: string; datasetVersion: string;
  userState: { favorite: boolean; learning: boolean; mastered: boolean; cardId: string | null };
};
type Response = { items: CatalogItem[]; page: number; total: number; hasNext: boolean; error?: string };
type CatalogStats = { collections: Record<string, { language: string; counts: { total?: number; levels?: Record<string, number>; kanaGroups?: Record<string, number>; alphabet?: Record<string, number>; topicCounts?: Record<string, number> }; importedAt: string | null }> };
type CatalogExample = { id: string; senseId: string | null; sentence: string; reading: string | null; translationZhTw: string | null; originalTranslation?: string | null; difficultyLevel: string; source: string; isVerified: boolean; kind: "system" | "user" | "ai" };
type ExampleResponse = { cardId: string | null; examples: CatalogExample[]; userExamples: CatalogExample[]; total: number; hasMore: boolean; nextOffset: number };
const kanaRows = [
  { label: "あ行", items: ["あ", "い", "う", "え", "お"] },
  { label: "か行", items: ["か", "き", "く", "け", "こ"] },
  { label: "さ行", items: ["さ", "し", "す", "せ", "そ"] },
  { label: "た行", items: ["た", "ち", "つ", "て", "と"] },
  { label: "な行", items: ["な", "に", "ぬ", "ね", "の"] },
  { label: "は行", items: ["は", "ひ", "ふ", "へ", "ほ"] },
  { label: "ま行", items: ["ま", "み", "む", "め", "も"] },
  { label: "や行", items: ["や", "ゆ", "よ"] },
  { label: "ら行", items: ["ら", "り", "る", "れ", "ろ"] },
  { label: "わ行", items: ["わ", "を", "ん"] },
];
const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

export function VocabularyCatalog({ onChanged }: { onChanged: () => Promise<void> }) {
  const [language, setLanguage] = useState<"ja" | "en">("ja");
  const [level, setLevel] = useState("");
  const [startsWith, setStartsWith] = useState("");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [topic, setTopic] = useState("");
  const [data, setData] = useState<Response>({ items: [], page: 1, total: 0, hasNext: false });
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncingExamples, setSyncingExamples] = useState(false);
  const [syncingAiExamples, setSyncingAiExamples] = useState(false);
  const [detailItem, setDetailItem] = useState<CatalogItem | null>(null);
  const [kanaOpen, setKanaOpen] = useState(false);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    const params = new URLSearchParams({ language, page: String(page), limit: "12" });
    if (level) params.set("level", level);
    if (startsWith) params.set("startsWith", startsWith);
    if (submittedQuery) params.set("q", submittedQuery);
    if (topic) params.set("topic", topic);
    try {
      const response = await fetch(`/api/vocabulary/catalog?${params.toString()}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "無法讀取內建單字庫。");
      if (requestId === latestRequest.current) setData(result);
    } catch (error) {
      if (requestId === latestRequest.current) setData({ items: [], page, total: 0, hasNext: false, error: error instanceof Error ? error.message : "無法讀取內建單字庫。" });
    }
    finally { if (requestId === latestRequest.current) setLoading(false); }
  }, [language, level, page, startsWith, submittedQuery, topic]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); setStartsWith(""); setTopic(""); setChosen(new Set()); }, [language, submittedQuery]);
  useEffect(() => {
    let active = true;
    void fetch("/api/vocabulary/catalog?mode=stats", { cache: "force-cache" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (active && result?.collections) setStats(result); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 3000); return () => window.clearTimeout(timer); }, [notice]);

  const selectedAll = data.items.length > 0 && data.items.every((item) => chosen.has(item.id));
  const selectedCount = chosen.size;
  const statusLabel = useMemo(() => language === "ja" ? "JLPT 常見單字" : "TOEIC 常見單字", [language]);
  const currentStats = stats?.collections[language === "ja" ? "jlpt_common" : "toeic_common"]?.counts;
  const levelCount = (item: string) => currentStats?.levels?.[item] ?? 0;
  const topicCounts = currentStats?.topicCounts ?? {};

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

  async function syncSystemExamples() {
    setSyncingExamples(true);
    setNotice("正在補齊系統例句，這可能需要一兩分鐘…");
    try {
      const response = await fetch("/api/vocabulary/catalog/examples/sync", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "系統例句同步失敗。");
      const inserted = Number(result?.report?.inserted ?? 0);
      setNotice(inserted > 0 ? `已補齊 ${inserted.toLocaleString("zh-TW")} 筆系統例句。` : "系統例句已是最新狀態。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "系統例句同步失敗，請稍後再試。");
    } finally {
      setSyncingExamples(false);
    }
  }

  async function syncAiExamples() {
    setSyncingAiExamples(true);
    setNotice("正在以 AI 補齊尚無例句的日文單字，這需要幾分鐘…");
    try {
      const response = await fetch("/api/vocabulary/catalog/examples/sync-ai", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "AI 例句補齊失敗。");
      const inserted = Number(result?.report?.inserted ?? 0);
      const remaining = Number(result?.report?.remaining ?? 0);
      const rateLimited = Boolean(result?.report?.rateLimited);
      setNotice(rateLimited
        ? `已安全寫入 ${inserted.toLocaleString("zh-TW")} 筆 AI 例句；AI 服務暫時限流，約一分鐘後可再次按此按鈕繼續補齊（尚餘 ${remaining} 個）。`
        : remaining > 0
          ? `已新增 ${inserted.toLocaleString("zh-TW")} 筆 AI 例句，另有 ${remaining} 個單字待補。`
          : inserted > 0 ? `已新增 ${inserted.toLocaleString("zh-TW")} 筆 AI 補充例句。` : "所有日文單字都已有例句。 ");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI 例句補齊失敗，請稍後再試。");
    } finally {
      setSyncingAiExamples(false);
    }
  }

  return <><section className="vocabulary-catalog" aria-busy={loading}>
    <header className="vocabulary-catalog-header"><div><p className="eyebrow">BUILT-IN VOCABULARY</p><h2>探索單字庫</h2><p className="vocabulary-catalog-description">系統目錄不會計入你的學習統計；只有按「加入學習」後才會建立個人複習資料。</p></div><div className="vocabulary-catalog-header-actions"><span>{statusLabel}</span><button className="secondary-button compact" disabled={syncingExamples || syncingAiExamples} onClick={() => void syncSystemExamples()} type="button">{syncingExamples ? "同步中…" : "補齊系統例句"}</button>{language === "ja" && <button className="secondary-button compact" disabled={syncingExamples || syncingAiExamples} onClick={() => void syncAiExamples()} type="button">{syncingAiExamples ? "AI 補齊中…" : "AI 補齊缺少例句"}</button>}</div></header>
    {notice && <p className="notice success" role="status">{notice}</p>}
    <div className="vocabulary-catalog-switch" role="tablist" aria-label="單字庫語言"><button aria-selected={language === "ja"} className={language === "ja" ? "active" : ""} onClick={() => setLanguage("ja")} role="tab" type="button">日文 · JLPT</button><button aria-selected={language === "en"} className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} role="tab" type="button">英文 · TOEIC</button></div>
    <form className="vocabulary-catalog-search" onSubmit={(event) => { event.preventDefault(); setSubmittedQuery(query.trim()); }}><input aria-label="搜尋內建單字庫" onChange={(event) => setQuery(event.target.value)} placeholder={language === "ja" ? "搜尋日文、讀音或中文意思" : "搜尋英文、音標或中文意思"} value={query} /><button className="button" type="submit">搜尋</button></form>
    <div className="vocabulary-catalog-filters"><div className="vocabulary-filter-chips"><button className={!level ? "active" : ""} onClick={() => { setLevel(""); setPage(1); setStartsWith(""); }} type="button">全部</button>{language === "ja" ? ["N5", "N4", "N3", "N2", "N1"].map((item) => <button className={level === item ? "active" : ""} key={item} onClick={() => { setLevel(item); setPage(1); setStartsWith(""); }} type="button">{item} {stats ? levelCount(item) : "…"}</button>) : <span>TOEIC 常見字彙（非官方固定字表）</span>}</div>{language === "ja" ? <div className="vocabulary-kana-filter"><button aria-expanded={kanaOpen} className="vocabulary-kana-toggle" onClick={() => setKanaOpen((value) => !value)} type="button"><span>五十音篩選{startsWith ? `：${startsWith}` : ""}</span><span>{kanaOpen ? "收合" : "展開"}</span></button><div aria-label="五十音索引" className={`vocabulary-kana-grid ${kanaOpen ? "open" : ""}`}>{kanaRows.map((row) => <div className="vocabulary-kana-row" key={row.label}><span>{row.label}</span><div>{row.items.map((item) => <button className={startsWith === item ? "active" : ""} key={item} onClick={() => { setStartsWith(startsWith === item ? "" : item); setPage(1); setKanaOpen(false); }} type="button">{item}</button>)}</div></div>)}</div></div> : <div className="vocabulary-catalog-index" aria-label="字首索引">{letters.map((item) => <button className={startsWith === item ? "active" : ""} key={item} onClick={() => { setStartsWith(startsWith === item ? "" : item); setPage(1); }} type="button">{item}</button>)}</div>}{language === "en" && Object.keys(topicCounts).length > 0 && <div className="vocabulary-catalog-index" aria-label="TOEIC 主題"><button className={!topic ? "active" : ""} onClick={() => { setTopic(""); setPage(1); }} type="button">全部主題</button>{Object.entries(topicCounts).map(([item, count]) => <button className={topic === item ? "active" : ""} key={item} onClick={() => { setTopic(item); setPage(1); }} type="button">{item} {count}</button>)}</div>}</div>
    <div className="vocabulary-catalog-actions"><p>共 {data.total} 筆 · 依 {language === "ja" ? "讀音" : "字母"} 排列</p><button className="secondary-button compact" onClick={() => { setBatchMode((value) => !value); setChosen(new Set()); }} type="button">{batchMode ? "結束選取" : "批量加入"}</button>{batchMode && <><button className="secondary-button compact" onClick={() => setChosen(selectedAll ? new Set() : new Set(data.items.map((item) => item.id)))} type="button">{selectedAll ? "取消全選" : "全選本頁"}</button><button className="button compact" disabled={!selectedCount || pendingIds.size > 0} onClick={() => void mutate("batchLearn", [...chosen])} type="button">加入學習 {selectedCount || ""}</button></>}</div>
    {data.error ? <div className="vocabulary-empty"><strong>單字庫尚未可用</strong><p>{data.error}</p></div> : <div className="vocabulary-catalog-grid">{loading ? Array.from({ length: 6 }).map((_, index) => <div className="vocabulary-catalog-card skeleton" key={index} />) : data.items.map((item) => <article className="vocabulary-catalog-card" key={item.id}>{batchMode && <label className="vocabulary-catalog-check"><input aria-label={`選取 ${item.word}`} checked={chosen.has(item.id)} onChange={() => setChosen((previous) => { const next = new Set(previous); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })} type="checkbox" /></label>}<div className="vocabulary-catalog-card-top"><div><div className="vocabulary-word-meta"><span className="vocabulary-language-badge">{item.language === "ja" ? "日文" : "英文"}</span>{item.jlptLevel && <span className="vocabulary-level-badge">{item.jlptLevel}</span>}</div><h3>{item.word}</h3><p>{item.reading || item.romaji || item.ipa || "—"}</p></div><button aria-label={item.userState.favorite ? "取消收藏" : "加入收藏"} className={item.userState.favorite ? "vocabulary-star active" : "vocabulary-star"} disabled={pendingIds.has(item.id)} onClick={() => void mutate(item.userState.favorite ? "unfavorite" : "favorite", [item.id])} type="button">★</button></div><strong>{/[\u3400-\u9fff]/.test(item.meaningZhTw) ? item.meaningZhTw : "中文釋義暫時無法取得"}</strong><p className="vocabulary-catalog-definition">{item.englishDefinition}</p><div className="vocabulary-card-tags">{item.topics.map((topic) => <span key={topic}>{topic}</span>)}</div><footer><button className="secondary-button compact" onClick={() => setDetailItem(item)} type="button">例句與詳情</button>{item.userState.mastered ? <em>✓ 已掌握</em> : item.userState.learning ? <em>✓ 已加入學習</em> : <button className="button compact" disabled={pendingIds.has(item.id)} onClick={() => void mutate("learn", [item.id])} type="button">＋ 加入學習</button>}</footer></article>)}</div>}
    {!loading && !data.error && !data.items.length && <div className="vocabulary-empty"><strong>找不到符合的單字</strong><p>試著改用其他關鍵字或移除篩選。</p></div>}
    <nav aria-label="單字庫分頁" className="vocabulary-catalog-pagination"><button className="secondary-button compact" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} type="button">上一頁</button><span>{page} 頁</span><button className="secondary-button compact" disabled={!data.hasNext || loading} onClick={() => setPage((value) => value + 1)} type="button">下一頁</button></nav>
    <small className="vocabulary-catalog-source">資料來源：{data.items[0]?.source || "尚未匯入正式資料集"} · {data.items[0]?.license || "請先執行資料匯入"} · {data.items[0]?.datasetVersion || "—"}</small>
  </section><CatalogExamplesDialog item={detailItem} onChanged={async () => { await Promise.all([load(), onChanged()]); }} onClose={() => setDetailItem(null)} /></>;
}

function CatalogExamplesDialog({ item, onClose, onChanged }: { item: CatalogItem | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const [data, setData] = useState<ExampleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [showReadings, setShowReadings] = useState(false);
  const [sentence, setSentence] = useState("");
  const [reading, setReading] = useState("");
  const [translation, setTranslation] = useState("");
  const [aiDifficulty, setAiDifficulty] = useState("N3");
  const [aiPreview, setAiPreview] = useState<Array<{ sentence: string; translation: string; senseId: string | null; difficultyLevel: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (offset = 0, append = false) => {
    if (!item) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/vocabulary/catalog/${item.id}/examples?limit=3&offset=${offset}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "無法讀取例句。");
      setData((previous) => append && previous ? { ...result, examples: [...previous.examples, ...result.examples] } : result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "無法讀取例句。"); }
    finally { setLoading(false); }
  }, [item]);
  useEffect(() => { if (item) { setData(null); setAiPreview([]); setSentence(""); setReading(""); setTranslation(""); void load(); } }, [item, load]);
  async function post(body: unknown) {
    if (!item) return null;
    const response = await fetch(`/api/vocabulary/catalog/${item.id}/examples`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "操作失敗。");
    return result;
  }
  async function addUserExample() {
    if (!data?.cardId || !sentence.trim() || !translation.trim()) return;
    setPending(true); setError(null);
    try { await post({ action: "addUser", cardId: data.cardId, example: { sentence, reading: reading || null, translationZhTw: translation, difficultyLevel: "unknown" } }); setSentence(""); setReading(""); setTranslation(""); await load(); await onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "無法保存自訂例句。"); }
    finally { setPending(false); }
  }
  async function generateAi() { setPending(true); setError(null); try { const result = await post({ action: "generateAi", difficultyLevel: aiDifficulty }); setAiPreview(result.preview ?? []); } catch (cause) { setError(cause instanceof Error ? cause.message : "AI 例句目前無法產生。"); } finally { setPending(false); } }
  async function saveAi() { if (!data?.cardId || !aiPreview.length) return; setPending(true); setError(null); try { await post({ action: "saveAi", cardId: data.cardId, examples: aiPreview.map((example) => ({ sentence: example.sentence, translationZhTw: example.translation, senseId: example.senseId, difficultyLevel: example.difficultyLevel })) }); setAiPreview([]); await load(); await onChanged(); } catch (cause) { setError(cause instanceof Error ? cause.message : "無法保存 AI 例句。"); } finally { setPending(false); } }
  const examples = [...(data?.examples ?? []), ...(data?.userExamples ?? [])];
  return <ModalDialog className="vocabulary-example-dialog" onClose={onClose} open={Boolean(item)} pending={pending} title={item ? `${item.word} · 例句` : "例句"}><div className="vocabulary-example-dialog-body">{item && <header><h3>{item.word}</h3><p>{item.reading || item.romaji || item.ipa || ""}</p><strong>{item.meaningZhTw}</strong></header>}{loading && !data ? <p>正在載入例句…</p> : <><div className="vocabulary-example-heading"><h4>例句</h4><button className="secondary-button compact" onClick={() => setShowReadings((value) => !value)} type="button">{showReadings ? "隱藏讀音" : "顯示讀音"}</button></div>{examples.length ? <ol className="vocabulary-example-list">{examples.map((example) => <li key={example.id}><p>{example.sentence}</p>{showReadings && example.reading && <small>{example.reading}</small>}{example.translationZhTw ? <strong>{example.translationZhTw}</strong> : example.originalTranslation ? <strong>英文原始譯文：{example.originalTranslation}</strong> : <strong>尚未提供翻譯</strong>}<footer><span>{example.kind === "system" ? "系統例句" : example.kind === "ai" ? "AI 補充例句（未校對）" : "我的例句"}</span>{example.isVerified && <span>✓ 已校對</span>}{example.difficultyLevel !== "unknown" && <span>{example.difficultyLevel}</span>}</footer></li>)}</ol> : <p className="vocabulary-empty">此單字尚未有已收錄的例句。</p>}{data?.hasMore && <button className="secondary-button compact" disabled={loading} onClick={() => void load(data.nextOffset, true)} type="button">查看更多例句</button>}{!data?.cardId ? <p className="vocabulary-example-hint">先按「加入學習」建立個人單字後，即可保存自己的例句或 AI 草稿。</p> : <section className="vocabulary-example-form"><h4>＋ 新增自己的例句</h4><textarea aria-label="例句" onChange={(event) => setSentence(event.target.value)} placeholder="輸入例句" value={sentence} /><input aria-label="例句讀音" onChange={(event) => setReading(event.target.value)} placeholder="讀音（選填）" value={reading} /><textarea aria-label="例句繁中翻譯" onChange={(event) => setTranslation(event.target.value)} placeholder="繁體中文翻譯" value={translation} /><button className="button compact" disabled={pending || !sentence.trim() || !translation.trim()} onClick={() => void addUserExample()} type="button">儲存自訂例句</button><div className="vocabulary-ai-example"><select aria-label="AI 例句難度" onChange={(event) => setAiDifficulty(event.target.value)} value={aiDifficulty}>{["N5", "N4", "N3", "N2", "N1", "A1", "A2", "B1", "B2", "C1", "C2", "unknown"].map((level) => <option key={level}>{level}</option>)}</select><button className="secondary-button compact" disabled={pending} onClick={() => void generateAi()} type="button">✨ AI 產生例句</button></div>{aiPreview.length > 0 && <div className="vocabulary-ai-preview"><p>AI 預覽：確認後才會保存至你的單字。</p>{aiPreview.map((example, index) => <div key={`${example.sentence}-${index}`}><strong>{example.sentence}</strong><span>{example.translation}</span></div>)}<button className="button compact" disabled={pending} onClick={() => void saveAi()} type="button">儲存 AI 例句</button></div>}</section>}</>}{error && <p className="notice error">{error}</p>}</div></ModalDialog>;
}
