import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type VocabularyAiAction = "explain" | "compare" | "translate" | "autocomplete";
export type VocabularyAiResult = { answer: string; examples: { sentence: string; translation: string }[]; notes: string[]; suggestedCard?: Record<string, unknown> };

const normalize = (value: string) => value.trim().toLocaleLowerCase();
const maxDuration = 12_000;

function instruction(action: VocabularyAiAction, language: "ja" | "en" | "auto") {
  const task = action === "compare" ? "比較字詞差異、語感、典型使用時機與對照例句" : action === "translate" ? "翻譯，並說明關鍵語法與可加入單字庫的重點字" : action === "autocomplete" ? "補全單字卡欄位；詞性、讀音、JLPT／CEFR 等無法確認時必須填「未確認」" : "解釋單字的核心意思、語感、常見搭配與使用時機";
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
