import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AnimeSearchError, searchAnime } from "@/lib/anime/jikan-service";
import { getSecurityContext } from "@/lib/security/activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const querySchema = z.string().trim().min(2).max(100);
const messageFor = (code: AnimeSearchError["code"]) => ({
  rate_limited: "搜尋太頻繁，請稍後再試",
  forbidden: "動漫資料服務拒絕這次請求，請稍後再試",
  upstream_error: "動漫資料服務發生內部錯誤，請稍後再試",
  upstream_unavailable: "動漫資料服務暫時無法使用，請稍後再試",
  timeout: "動漫資料服務回應較慢，請再試一次",
  network: "動漫資料服務網路連線失敗，請再試一次",
  unknown: "搜尋失敗，請稍後再試",
}[code]);

export async function GET(request: NextRequest) {
  if (!(await getSecurityContext())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = querySchema.safeParse(request.nextUrl.searchParams.get("q") ?? "");
  if (!parsed.success) return NextResponse.json({ error: "請至少輸入 2 個字搜尋動漫。" }, { status: 400 });
  try {
    const results = await searchAnime(parsed.data, request.signal);
    console.info("[api/anime/search] catalogue lookup succeeded", { queryLength: parsed.data.length, resultCount: results.length });
    return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
  }
  catch (caught) {
    if (request.signal.aborted) return new NextResponse(null, { status: 499 });
    const failure = caught instanceof AnimeSearchError ? caught : new AnimeSearchError("unknown", 503, caught instanceof Error ? caught.message : "Unknown anime search failure");
    // Do not log the search phrase itself; a user's anime searches are private.
    console.error("[api/anime/search] catalogue lookup failed", {
      code: failure.code,
      provider: failure.provider,
      providerStatus: failure.status,
      providerResponse: failure.responseSnippet,
      timeout: failure.code === "timeout",
      rateLimit: failure.code === "rate_limited",
      error: failure.message,
      queryLength: parsed.data.length,
    });
    const headers = new Headers({ "Cache-Control": "private, no-store" });
    if (failure.code === "rate_limited" && failure.retryAfterSeconds) headers.set("Retry-After", String(failure.retryAfterSeconds));
    return NextResponse.json({ error: messageFor(failure.code), code: failure.code, retryAfterSeconds: failure.retryAfterSeconds ?? null }, { status: failure.status, headers });
  }
}
