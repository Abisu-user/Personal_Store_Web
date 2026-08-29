import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { clearVocabularySearchHistory, detectLookupInputLanguage, DictionaryProviderError, getVocabularySearchHistory, recordVocabularySearch, resolveChineseTranslation, searchDictionary, translateLookupCandidate } from "@/lib/vocabulary/dictionary";
import { getVerifiedJapaneseTranslationByForm } from "@/lib/vocabulary/system-japanese-translations";

export const dynamic = "force-dynamic";
const languageSchema = z.enum(["ja", "en"]);

function responseForDictionaryError(error: unknown) {
  if (error instanceof DictionaryProviderError) {
    if (error.code === "TIMEOUT") return { status: 504, message: "字典資料服務回應較慢，請再試一次。" };
    if (error.code === "NETWORK") return { status: 503, message: "目前無法連線至字典資料服務，請確認網路後再試。" };
    if (error.status === 429) return { status: 429, message: "字典查詢太頻繁，請稍後再試。" };
    if (error.status === 403) return { status: 502, message: "字典資料服務暫時拒絕查詢，請稍後再試。" };
    if (error.status && error.status >= 500) return { status: 502, message: "字典資料服務暫時維護中，請稍後再試。" };
  }
  return { status: 503, message: "字典查詢失敗，請稍後再試。" };
}

async function localize(items: Awaited<ReturnType<typeof searchDictionary>>["exact"], originalChinese: string | null) {
  return Promise.all(items.map(async (item) => {
    const verifiedJapanese = item.language === "ja"
      ? getVerifiedJapaneseTranslationByForm(item.word, item.reading, item.kana)
      : null;
    const chinese = originalChinese || verifiedJapanese?.primaryMeaning || await resolveChineseTranslation(item);
    return {
      ...item,
      primaryTranslation: chinese || item.primaryTranslation,
      translations: {
        chinese,
        japanese: item.language === "ja" ? item.word : null,
        english: item.language === "en" ? item.word : null,
      },
      // Keep each Japanese dictionary sense separate for detail UIs.  This
      // intentionally does not flatten English glosses into one Chinese line.
      translationSensesZhTw: verifiedJapanese?.senses ?? [],
    };
  }));
}

function isLikelyJapaneseKanjiResult(result: Awaited<ReturnType<typeof searchDictionary>>) {
  return result.exact.some((entry) => /[\u3040-\u309f]/.test(entry.reading || entry.kana || ""));
}

export async function GET(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const language = languageSchema.safeParse(request.nextUrl.searchParams.get("language"));
  if (!language.success) return NextResponse.json({ error: "請選擇日文或英文。" }, { status: 400 });
  if (request.nextUrl.searchParams.get("history") === "1") {
    return NextResponse.json({ items: await getVocabularySearchHistory(context.userId, language.data) }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > 300) return NextResponse.json({ error: "請輸入 1 至 300 個字元的查詢。" }, { status: 400 });

  const startedAt = Date.now();
  try {
    const inputLanguage = detectLookupInputLanguage(query);
    const dictionaryLanguage = language.data;
    let dictionaryQuery = query;
    let originalChinese: string | null = null;
    let result;

    // Kanji-only input can be Japanese or Chinese. Jisho also indexes Chinese loan entries
    // (for example 你好 → ニーハオ), so a katakana-only reading is not enough to call it Japanese.
    if (inputLanguage === "zh" && dictionaryLanguage === "ja") {
      result = await searchDictionary("ja", query);
      if (!isLikelyJapaneseKanjiResult(result)) {
        const translated = await translateLookupCandidate(query, "ja");
        if (!translated) {
          return NextResponse.json({ error: "無法將中文轉為可驗證的日文查詢，請改用更完整的詞語再試。" }, { status: 422 });
        }
        dictionaryQuery = translated;
        const translatedResult = await searchDictionary("ja", dictionaryQuery);
        // Never invent a word from translation alone: only prefer it after the dictionary confirms it.
        if (translatedResult.exact.length || translatedResult.related.length) result = translatedResult;
        originalChinese = query;
      }
    } else if (inputLanguage !== dictionaryLanguage) {
      const source = inputLanguage === "zh" ? "zh-TW" : inputLanguage;
      const translated = inputLanguage === "zh" ? await translateLookupCandidate(query, dictionaryLanguage) : null;
      dictionaryQuery = translated || "";
      if (!dictionaryQuery) {
        return NextResponse.json({ error: `目前無法將輸入內容轉為${dictionaryLanguage === "ja" ? "日文" : "英文"}查詢，請稍後再試。` }, { status: 422 });
      }
      result = await searchDictionary(dictionaryLanguage, dictionaryQuery);
      if (source === "zh-TW") originalChinese = query;
    } else {
      result = await searchDictionary(dictionaryLanguage, dictionaryQuery);
    }

    const [exact, related] = await Promise.all([
      localize(result.exact, originalChinese),
      localize(result.related, originalChinese),
    ]);
    await recordVocabularySearch(context.userId, dictionaryLanguage, query);
    console.info("[vocabulary.lookup] success", {
      provider: dictionaryLanguage === "ja" ? "Jisho" : "Free Dictionary",
      language: dictionaryLanguage,
      inputLanguage,
      durationMs: Date.now() - startedAt,
      exact: exact.length,
      related: related.length,
    });
    return NextResponse.json({
      exact,
      related,
      // Keep this compatibility field for clients not yet updated.
      items: [...exact, ...related],
      source: "dictionary",
      dictionaryQuery,
      dictionaryLanguage,
      dictionaryForm: result.dictionaryForm,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const mapped = responseForDictionaryError(error);
    console.error("[vocabulary.lookup] provider failed", {
      provider: language.data === "ja" ? "Jisho" : "Free Dictionary",
      language: language.data,
      queryLength: query.length,
      durationMs: Date.now() - startedAt,
      code: error instanceof DictionaryProviderError ? error.code : "UNKNOWN",
      upstreamStatus: error instanceof DictionaryProviderError ? error.status : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
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
