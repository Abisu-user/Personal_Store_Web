import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { runVocabularyAssistant } from "@/lib/vocabulary/ai-assistant";
import { clearVocabularySearchHistory, getVocabularySearchHistory, recordVocabularySearch, searchDictionary } from "@/lib/vocabulary/dictionary";

export const dynamic = "force-dynamic";
const languageSchema = z.enum(["ja", "en"]);

export async function GET(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const language = languageSchema.safeParse(request.nextUrl.searchParams.get("language"));
  if (!language.success) return NextResponse.json({ error: "請選擇日文或英文。" }, { status: 400 });
  if (request.nextUrl.searchParams.get("history") === "1") return NextResponse.json({ items: await getVocabularySearchHistory(context.userId, language.data) }, { headers: { "Cache-Control": "private, no-store" } });
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > 300) return NextResponse.json({ error: "請輸入 1 至 300 個字元的查詢。" }, { status: 400 });
  try {
    let dictionaryQuery = query;
    if (/[^\x00-\x7F\u3040-\u30FF\u3400-\u9FFF]/.test(query) || /[\u3400-\u9FFF]/.test(query)) {
      try {
        const expansion = await runVocabularyAssistant(context.userId, "autocomplete", language.data, `使用者以繁體中文搜尋「${query}」。只需在 suggestedCard.word 放入最適合查字的${language.data === "ja" ? "日文" : "英文"}單字；不可猜測不確定資料。`);
        const suggested = expansion.suggestedCard?.word;
        if (typeof suggested === "string" && suggested.trim()) dictionaryQuery = suggested.trim();
      } catch (error) {
        if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") return NextResponse.json({ error: "中文反向搜尋需要先啟用 AI 單字助手；仍可直接輸入日文或英文查字。" }, { status: 503 });
        throw error;
      }
    }
    const items = await searchDictionary(language.data, dictionaryQuery);
    await recordVocabularySearch(context.userId, language.data, query);
    return NextResponse.json({ items, source: "dictionary", dictionaryQuery }, { headers: { "Cache-Control": "private, no-store" } });
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
