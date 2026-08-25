import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BahamutLookupError, findBahamutAnime, type BahamutLookupResponse } from "@/lib/anime/bahamut-anime-service";
import { getSecurityContext } from "@/lib/security/activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const title = z.string().trim().min(1).max(240);

export async function GET(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ title, japanese: title.optional(), english: title.optional(), chinese: title.optional() }).safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "請提供有效的動漫名稱。" }, { status: 400 });
  try {
    const match = await findBahamutAnime([parsed.data.chinese, parsed.data.title, parsed.data.japanese, parsed.data.english]);
    const body: BahamutLookupResponse = { match, state: match.available ? "available" : "not_found", reason: null };
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[api/anime/bahamut] catalogue lookup failed", {
      error: error instanceof Error ? error.message : "unknown",
      name: error instanceof Error ? error.name : "unknown",
      status: error instanceof BahamutLookupError ? error.status : null,
      titleLength: parsed.data.title.length,
    });
    const status = error instanceof BahamutLookupError ? error.status : null;
    const reason = status === 403 ? "forbidden" : status === 429 ? "rate_limited" : status === null && /timed out/i.test(error instanceof Error ? error.message : "") ? "timeout" : status && [500, 502, 503, 504].includes(status) ? "upstream" : "network";
    // Bahamut is an optional metadata provider. Its availability must never turn
    // an otherwise valid anime search into a 503 failure for the user.
    const body: BahamutLookupResponse = { match: null, state: "unavailable", reason };
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  }
}
