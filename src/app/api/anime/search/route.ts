import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchAnime } from "@/lib/anime/jikan-service";
import { getSecurityContext } from "@/lib/security/activity";

export const dynamic = "force-dynamic";
const querySchema = z.string().trim().min(2).max(100);

export async function GET(request: NextRequest) {
  if (!(await getSecurityContext())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = querySchema.safeParse(request.nextUrl.searchParams.get("q") ?? "");
  if (!parsed.success) return NextResponse.json({ error: "請至少輸入 2 個字搜尋動漫。" }, { status: 400 });
  try { return NextResponse.json({ results: await searchAnime(parsed.data) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "動漫資料服務暫時無法使用，請稍後再試。" }, { status: 503 }); }
}
