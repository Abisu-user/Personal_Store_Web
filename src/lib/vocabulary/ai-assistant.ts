import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type VocabularyAiAction = "explain" | "compare" | "translate" | "autocomplete" | "examples";
export type VocabularyAiResult = { answer: string; examples: { sentence: string; translation: string }[]; notes: string[]; suggestedCard?: Record<string, unknown> };
export type JapaneseExamplePresentation = { id: string; reading: string; translationZhTw: string };

const normalize = (value: string) => value.trim().toLocaleLowerCase();
const maxDuration = 12_000;

function instruction(action: VocabularyAiAction, language: "ja" | "en" | "auto") {
  const task = action === "compare" ? "比較字詞差異、語感、典型使用時機與對照例句" : action === "translate" ? "翻譯，並說明關鍵語法與可加入單字庫的重點字" : action === "autocomplete" ? "補全單字卡欄位；詞性、讀音、JLPT／CEFR 等無法確認時必須填「未確認」" : action === "examples" ? "只產生 2 至 4 個不同情境、能對應指定詞義的學習例句；每句提供自然繁體中文翻譯，讀音或難度不確定時明確說明未確認" : "解釋單字的核心意思、語感、常見搭配與使用時機";
  return `你是 Personal Vault 的語言教學助手。使用繁體中文，目標語言為 ${language === "ja" ? "日文" : language === "en" ? "英文" : "依使用者輸入判斷"}。${task}。字典資料才是事實來源；你不可把不確定的讀音、級別、詞性偽裝成確定事實。請輸出 JSON，格式為 {"answer":"...","examples":[{"sentence":"...","translation":"..."}],"notes":["..."],"suggestedCard":{}}。answer 請精簡清楚；提供最多四句不同情境例句。`;
}

async function callOpenAi(action: VocabularyAiAction, language: "ja" | "en" | "auto", prompt: string): Promise<VocabularyAiResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), maxDuration);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_VOCABULARY_MODEL || "gpt-4.1-mini", temperature: 0.35, response_format: { type: "json_object" }, messages: [{ role: "system", content: instruction(action, language) }, { role: "user", content: prompt }] }), signal: controller.signal });
    if (!response.ok) throw new Error(`AI_UPSTREAM_${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error("AI_EMPTY_RESPONSE");
    const parsed = JSON.parse(text) as Partial<VocabularyAiResult>;
    return { answer: typeof parsed.answer === "string" ? parsed.answer : "AI 未提供可用說明。", examples: Array.isArray(parsed.examples) ? parsed.examples.filter((item): item is { sentence: string; translation: string } => Boolean(item?.sentence && item?.translation)).slice(0, 4) : [], notes: Array.isArray(parsed.notes) ? parsed.notes.filter((item): item is string => typeof item === "string").slice(0, 8) : [], suggestedCard: parsed.suggestedCard && typeof parsed.suggestedCard === "object" ? parsed.suggestedCard : undefined };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("AI_TIMEOUT");
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function runVocabularyAssistant(userId: string, action: VocabularyAiAction, language: "ja" | "en" | "auto", prompt: string) {
  const admin = createAdminClient();
  const normalizedPrompt = normalize(prompt);
  try {
    const { data } = await admin.from("vocabulary_ai_cache").select("payload,expires_at").eq("user_id", userId).eq("action", action).eq("language", language).eq("normalized_prompt", normalizedPrompt).maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now()) return data.payload as VocabularyAiResult;
  } catch { /* cache optional */ }
  const payload = await callOpenAi(action, language, prompt);
  try {
    await admin.from("vocabulary_ai_cache").upsert({ user_id: userId, action, language, normalized_prompt: normalizedPrompt, payload, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }, { onConflict: "user_id,action,language,normalized_prompt" });
  } catch { /* cache optional */ }
  return payload;
}

/**
 * Source-backed Japanese examples may legally include only the original
 * English translation.  Enrich the exact existing sentence once, then the
 * caller persists the zh-TW translation and reading for future requests.
 */
export async function localizeJapaneseExamplePresentations(examples: Array<{ id: string; sentence: string; originalTranslation?: string | null }>): Promise<JapaneseExamplePresentation[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !examples.length) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), maxDuration);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_VOCABULARY_MODEL || "gpt-4.1-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是日文教材編輯。請針對輸入的每一個既有日文例句，提供完整讀音與自然台灣繁體中文翻譯。reading 必須是整句的平假名讀音（保留標點）；translationZhTw 必須是繁體中文，不可使用英文。不可更改 sentence，不可新增、刪除或猜測其他句子。只輸出 JSON：{\\\"items\\\":[{\\\"id\\\":\\\"...\\\",\\\"reading\\\":\\\"...\\\",\\\"translationZhTw\\\":\\\"...\\\"}]}。" },
          { role: "user", content: JSON.stringify({ examples }) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI_UPSTREAM_${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    const parsed = content ? JSON.parse(content) as { items?: unknown } : null;
    if (!Array.isArray(parsed?.items)) return [];
    const validIds = new Set(examples.map((example) => example.id));
    return parsed.items.flatMap((item): JapaneseExamplePresentation[] => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      const id = typeof value.id === "string" ? value.id : "";
      const reading = typeof value.reading === "string" ? value.reading.trim() : "";
      const translationZhTw = typeof value.translationZhTw === "string" ? value.translationZhTw.trim() : "";
      return validIds.has(id) && reading && translationZhTw ? [{ id, reading, translationZhTw }] : [];
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("AI_TIMEOUT");
    throw error;
  } finally { clearTimeout(timeout); }
}
