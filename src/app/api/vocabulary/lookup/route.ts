import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { clearVocabularySearchHistory, detectLookupInputLanguage, getVocabularySearchHistory, recordVocabularySearch, searchDictionary, translateDictionaryText } from "@/lib/vocabulary/dictionary";

export const dynamic = "force-dynamic";
const languageSchema = z.enum(["ja", "en"]);
const commonChineseJapanese: Record<string, string> = { "你好": "こんにちは", "您好": "こんにちは", "謝謝": "ありがとう", "對不起": "すみません", "再見": "さようなら" };

export async function GET(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const language = languageSchema.safeParse(request.nextUrl.searchParams.get("language"));
  if (!language.success) return NextResponse.json({ error: "請選擇日文或英文。" }, { status: 400 });
  if (request.nextUrl.searchParams.get("history") === "1") return NextResponse.json({ items: await getVocabularySearchHistory(context.userId, language.data) }, { headers: { "Cache-Control": "private, no-store" } });
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > 300) return NextResponse.json({ error: "請輸入 1 至 300 個字元的查詢。" }, { status: 400 });
  try {
    const inputLanguage = detectLookupInputLanguage(query);
    const dictionaryLanguage = inputLanguage === "en" ? "en" : "ja";
    let dictionaryQuery = query;
    if (inputLanguage === "zh") {
      dictionaryQuery = commonChineseJapanese[query] ?? await translateDictionaryText(query, "zh-TW", "ja") ?? "";
      if (!dictionaryQuery) return NextResponse.json({ error: "目前無法將中文轉為日文查詢，請稍後再試。" }, { status: 503 });
    }
    const items = await searchDictionary(dictionaryLanguage, dictionaryQuery);
    const localizedItems = await Promise.all(items.map(async (item) => {
      const english = item.meanings[0] || item.primaryTranslation || item.englishDefinition?.split("；")[0] || null;
      const japanese = item.language === "ja" ? item.word : await translateDictionaryText(item.word, "en", "ja");
      const chinese = inputLanguage === "zh" ? query : await translateDictionaryText(item.language === "ja" ? item.word : item.word, item.language, "zh-TW");
      return { ...item, translations: { inputLanguage, chinese, japanese, english: inputLanguage === "en" ? query : english } };
    }));
    await recordVocabularySearch(context.userId, language.data, query);
    return NextResponse.json({ items: localizedItems, source: "dictionary", dictionaryQuery, dictionaryLanguage }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[vocabulary.lookup] dictionary provider failed", { language: language.data, queryLength: query.length, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "字典資料服務暫時無法使用，請稍後再試。" }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const language = languageSchema.safeParse(request.nextUrl.searchParams.get("language"));
  if (!language.success) return NextResponse.json({ error: "請選擇日文或英文。" }, { status: 400 });
  await clearVocabularySearchHistory(context.userId, language.data);
  return NextResponse.json({ ok: true });
}
