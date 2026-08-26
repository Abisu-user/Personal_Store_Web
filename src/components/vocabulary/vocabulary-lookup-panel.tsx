"use client";

import { FormEvent, useEffect, useState } from "react";
import type { VocabularyCard } from "@/lib/vocabulary/types";

type Language = "ja" | "en";
type LookupEntry = { id: string; language: Language; word: string; reading: string | null; kana: string | null; romaji: string | null; ipa: string | null; pronunciation: string | null; partOfSpeech: string | null; primaryTranslation: string | null; englishDefinition: string | null; meanings: string[]; examples: { sentence: string; translation: string | null }[]; synonyms: string[]; antonyms: string[]; source: string; translations?: { inputLanguage: "zh" | Language; chinese: string | null; japanese: string | null; english: string | null } };
type AssistantResult = { answer: string; examples: { sentence: string; translation: string }[]; notes: string[] };
type PreparedCard = { language: Language; word: string; reading: string; romaji: string; primaryTranslation: string; englishDefinition: string; partOfSpeech: string; examplesText: string; meaningsText: string; languageDetails: string };
const lookupCss = `.vocabulary-lookup{display:grid;gap:22px}.vocabulary-lookup-intro{display:flex;justify-content:space-between;gap:16px;align-items:start}.vocabulary-lookup-intro h2,.vocabulary-lookup-intro h3{margin:4px 0}.vocabulary-lookup-intro p{margin:0;color:var(--muted)}.vocabulary-language-switch{display:flex;gap:8px;flex-wrap:wrap}.vocabulary-language-switch button{min-height:40px;padding:0 13px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);font-weight:800}.vocabulary-language-switch button.active{background:var(--brand);border-color:var(--brand);color:#fff}.vocabulary-lookup-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}.vocabulary-lookup-form input,.vocabulary-ai-actions textarea,.vocabulary-ai-actions select{width:100%;min-width:0;font-size:max(16px,1rem)}.vocabulary-history{display:grid;gap:8px}.vocabulary-history>div{display:flex;gap:8px;flex-wrap:wrap}.vocabulary-history button{padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--ink)}.vocabulary-history .text-button{border:0;background:transparent;color:var(--brand)}.vocabulary-lookup-results{display:grid;gap:18px}.vocabulary-lookup-results section,.vocabulary-ai-panel{display:grid;gap:11px;padding:18px;border:1px solid var(--line);border-radius:18px;background:var(--surface)}.vocabulary-lookup-results h3,.vocabulary-ai-panel h3{margin:0}.vocabulary-lookup-results .eyebrow,.vocabulary-ai-panel .eyebrow{margin:0}.vocabulary-lookup-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:10px}.vocabulary-lookup-card{display:grid;align-content:start;gap:7px;min-height:148px;padding:15px;border:1px solid var(--line);border-radius:14px;background:color-mix(in srgb,var(--surface) 82%,var(--brand) 4%);color:var(--ink);text-align:left}.vocabulary-lookup-card.local{cursor:pointer}.vocabulary-lookup-card h4,.vocabulary-lookup-card p{margin:0}.vocabulary-lookup-card h4{font-size:1.2rem}.vocabulary-lookup-card small,.vocabulary-lookup-card>span{color:var(--muted)}.vocabulary-result-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:auto}.vocabulary-added{color:#167a56!important;font-weight:800}.vocabulary-result-empty{margin:0;color:var(--muted)}.vocabulary-ai-panel{grid-template-columns:minmax(0,.9fr) minmax(280px,1.1fr);align-items:start}.vocabulary-ai-panel p{margin:0;color:var(--muted)}.vocabulary-ai-actions{display:grid;gap:9px}.vocabulary-ai-actions select{max-width:180px}.vocabulary-ai-result{grid-column:1/-1;display:grid;gap:8px;padding:14px;border-radius:14px;background:color-mix(in srgb,var(--brand) 10%,var(--surface));white-space:pre-wrap}.vocabulary-ai-result p{color:var(--ink)}.vocabulary-ai-result ul{margin:0;padding-left:20px}.vocabulary-ai-result div{display:grid;gap:6px}@media(max-width:700px){.vocabulary-lookup-intro{display:grid}.vocabulary-lookup-form{grid-template-columns:1fr}.vocabulary-lookup-form .button{width:100%}.vocabulary-lookup-grid{grid-template-columns:1fr}.vocabulary-ai-panel{grid-template-columns:1fr}.vocabulary-ai-actions select{max-width:none}.vocabulary-language-switch{width:100%}.vocabulary-language-switch button{flex:1}}`;
const lookupSurfaceCss = `.vocabulary-lookup-intro,.vocabulary-history,.vocabulary-lookup-results section,.vocabulary-ai-panel{border:1px solid color-mix(in srgb,var(--line) 86%,transparent);border-radius:18px;background:color-mix(in srgb,var(--surface) 94%,var(--canvas));box-shadow:0 10px 28px rgb(20 42 80 / 6%);backdrop-filter:blur(12px) saturate(1.04);-webkit-backdrop-filter:blur(12px) saturate(1.04)}.vocabulary-lookup-intro,.vocabulary-history{padding:16px}.vocabulary-history>div{margin-top:2px}.vocabulary-language-switch button,.vocabulary-history button{background:color-mix(in srgb,var(--surface) 96%,var(--canvas))}.vocabulary-translation-list{display:grid;gap:5px;margin:2px 0}.vocabulary-translation-list p{display:grid;grid-template-columns:50px minmax(0,1fr);gap:8px;margin:0}.vocabulary-translation-list b{color:var(--muted);font-size:.78rem}.vocabulary-translation-list span{overflow-wrap:anywhere}@media(max-width:700px){.vocabulary-lookup{gap:16px}.vocabulary-lookup-intro,.vocabulary-history,.vocabulary-lookup-results section,.vocabulary-ai-panel{padding:14px;border-radius:15px}.vocabulary-lookup-intro h2{font-size:1.35rem}.vocabulary-lookup-intro p{font-size:.88rem;line-height:1.55}.vocabulary-language-switch button{min-height:38px;padding-inline:10px;font-size:.86rem}.vocabulary-lookup-form{gap:8px}.vocabulary-lookup-form .button{min-height:42px}.vocabulary-lookup-card{min-height:0;padding:14px}.vocabulary-ai-actions textarea{min-height:108px}}`;

export function VocabularyLookupPanel({ cards, onAdd }: { cards: VocabularyCard[]; onAdd: (card: PreparedCard) => void }) {
  const [language, setLanguage] = useState<Language>("ja");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LookupEntry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantAction, setAssistantAction] = useState<"explain" | "compare" | "translate">("explain");
  const [assistantResult, setAssistantResult] = useState<AssistantResult | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);

  async function loadHistory(scope = language) {
    const response = await fetch(`/api/vocabulary/lookup?language=${scope}&history=1`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setHistory((body.items || []).map((item: { query: string }) => item.query));
  }
  useEffect(() => { void loadHistory(); }, [language]);

  async function lookup(event?: FormEvent, nextQuery = query) {
    event?.preventDefault();
    const value = nextQuery.trim();
    if (!value) return;
    setLoading(true); setError(null); setItems([]);
    try {
      const response = await fetch(`/api/vocabulary/lookup?language=${language}&q=${encodeURIComponent(value)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "字典查詢失敗。");
      setItems(body.items || []);
      const dictionaryLanguage = body.dictionaryLanguage === "en" ? "en" : "ja";
      setLanguage(dictionaryLanguage);
      await loadHistory(dictionaryLanguage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "字典查詢失敗。"); }
    finally { setLoading(false); }
  }

  async function askAi(prompt = assistantPrompt, action = assistantAction) {
    const value = prompt.trim();
    if (!value) return;
    setAssistantLoading(true); setError(null); setAssistantResult(null);
    try {
      const response = await fetch("/api/vocabulary/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, language, prompt: value }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "AI 單字助手暫時無法使用。");
      setAssistantResult(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "AI 單字助手暫時無法使用。"); }
    finally { setAssistantLoading(false); }
  }

  function prepare(entry: LookupEntry) {
    onAdd({ language: entry.language, word: entry.word, reading: entry.reading || entry.kana || "", romaji: entry.romaji || "", primaryTranslation: entry.primaryTranslation || "", englishDefinition: entry.englishDefinition || "", partOfSpeech: entry.partOfSpeech || "", meaningsText: entry.meanings.join("\n"), examplesText: entry.examples.map((example) => `${example.sentence}${example.translation ? `｜${example.translation}` : ""}`).join("\n"), languageDetails: JSON.stringify({ dictionarySource: entry.source, ipa: entry.ipa || undefined, synonyms: entry.synonyms, antonyms: entry.antonyms }, null, 2) });
  }

  return <><style>{`${lookupCss}${lookupSurfaceCss}`}</style><section className="vocabulary-lookup">
    <div className="vocabulary-lookup-intro"><div><p className="eyebrow">DICTIONARY FIRST · AI TEACHES</p><h2>搜尋單字</h2><p>字典提供讀音、詞性與原始定義；AI 只負責協助你理解語感、比較與例句。</p></div><div aria-label="選擇字典語言" className="vocabulary-language-switch"><button className={language === "ja" ? "active" : ""} onClick={() => setLanguage("ja")} type="button">🇯🇵 日文</button><button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} type="button">🇬🇧 English</button></div></div>
    <form className="vocabulary-lookup-form" onSubmit={(event) => void lookup(event)}><input aria-label="搜尋中文、日文或英文單字" minLength={1} onChange={(event) => setQuery(event.target.value)} placeholder="輸入中文、日文或英文，自動辨識" value={query} /><button className="button" disabled={loading || !query.trim()} type="submit">{loading ? "查詢中…" : "搜尋"}</button></form>
    {history.length > 0 && <div className="vocabulary-history"><strong>最近搜尋</strong><div>{history.map((item) => <button key={item} onClick={() => { setQuery(item); void lookup(undefined, item); }} type="button">{item}</button>)}<button className="text-button" onClick={async () => { await fetch(`/api/vocabulary/lookup?language=${language}`, { method: "DELETE" }); setHistory([]); }} type="button">清除</button></div></div>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {query.trim() && <div className="vocabulary-lookup-results">
      <section><p className="eyebrow">ONLINE DICTIONARY</p><h3>線上字典結果</h3>{loading ? <p className="vocabulary-result-empty">正在查詢可靠字典資料…</p> : items.length ? <div className="vocabulary-lookup-grid">{items.map((entry) => { const exists = cards.some((card) => card.language === entry.language && card.word.trim().toLocaleLowerCase() === entry.word.trim().toLocaleLowerCase()); const order = entry.translations?.inputLanguage === "zh" ? [["中文", entry.translations.chinese], ["日文", entry.translations.japanese], ["英文", entry.translations.english]] : entry.translations?.inputLanguage === "ja" ? [["日文", entry.translations.japanese], ["中文", entry.translations.chinese], ["英文", entry.translations.english]] : [["英文", entry.translations?.english], ["中文", entry.translations?.chinese], ["日文", entry.translations?.japanese]]; return <article className="vocabulary-lookup-card" key={entry.id}><small>{entry.source} · {entry.partOfSpeech || "詞性未提供"}</small><div className="vocabulary-translation-list">{order.map(([label, value]) => value ? <p key={label}><b>{label}</b><span>{value}</span></p> : null)}</div>{entry.reading && <p>讀音：{entry.reading}</p>}{entry.ipa && <p>{entry.ipa}</p>}<div className="vocabulary-result-actions"><button className="secondary-button compact" onClick={() => { setAssistantPrompt(`${entry.word}${entry.reading ? `（${entry.reading}）` : ""} 怎麼用？請用繁體中文說明語感並給四個情境例句。`); setAssistantAction("explain"); void askAi(`${entry.word}${entry.reading ? `（${entry.reading}）` : ""} 怎麼用？請用繁體中文說明語感並給四個情境例句。`, "explain"); }} type="button">✨ 問 AI</button>{exists ? <span className="vocabulary-added">✓ 已在單字庫</span> : <button className="button compact" onClick={() => prepare(entry)} type="button">＋ 加入單字庫</button>}</div></article>; })}</div> : <p className="vocabulary-result-empty">{query && !loading ? "找不到符合的字典資料。請改用更完整的單字或詞語再試一次。" : "輸入後開始查詢。"}</p>}</section>
    </div>}
    <section className="vocabulary-ai-panel"><div><p className="eyebrow">AI LANGUAGE ASSISTANT</p><h3>問 AI 這個單字</h3><p>適合詢問用法、單字差異、常用搭配或翻譯；AI 建議不會自動寫入你的單字庫。</p></div><div className="vocabulary-ai-actions"><select aria-label="AI 單字助手功能" onChange={(event) => setAssistantAction(event.target.value as typeof assistantAction)} value={assistantAction}><option value="explain">解釋用法</option><option value="compare">比較差異</option><option value="translate">翻譯與文法</option></select><textarea aria-label="詢問 AI 單字助手" onChange={(event) => setAssistantPrompt(event.target.value)} placeholder="例如：当たる和当てる差在哪？" rows={3} value={assistantPrompt} /><button className="button" disabled={assistantLoading || !assistantPrompt.trim()} onClick={() => void askAi()} type="button">{assistantLoading ? "AI 思考中…" : "詢問 AI"}</button></div>{assistantResult && <div className="vocabulary-ai-result"><strong>AI 建議</strong><p>{assistantResult.answer}</p>{assistantResult.notes.length > 0 && <ul>{assistantResult.notes.map((note) => <li key={note}>{note}</li>)}</ul>}{assistantResult.examples.length > 0 && <div>{assistantResult.examples.map((example, index) => <p key={`${example.sentence}-${index}`}><b>{example.sentence}</b><br />{example.translation}</p>)}</div>}</div>}</section>
  </section></>;
}
