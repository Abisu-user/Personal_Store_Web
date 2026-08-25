import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BahamutLookupError, findBahamutAnime } from "@/lib/anime/bahamut-anime-service";
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
    return NextResponse.json({ match }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[api/anime/bahamut] catalogue lookup failed", {
      error: error instanceof Error ? error.message : "unknown",
      name: error instanceof Error ? error.name : "unknown",
      status: error instanceof BahamutLookupError ? error.status : null,
      titleLength: parsed.data.title.length,
    });
    return NextResponse.json({ error: "動畫瘋資料暫時無法確認。" }, { status: 503 });
  }
}
