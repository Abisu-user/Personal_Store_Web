import { NextRequest, NextResponse } from "next/server";
import { getAnimeDetail } from "@/lib/anime/jikan-service";
import { getSecurityContext } from "@/lib/security/activity";
import { hasAdultContentAccess } from "@/lib/security/adult-content";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: RouteContext<"/api/anime/external/[id]">) {
  const security = await getSecurityContext();
  if (!security) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const requestedSource = request.nextUrl.searchParams.get("source");
  const source = requestedSource === "anilist" || requestedSource === "bangumi" ? requestedSource : "jikan";
  try { const anime = await getAnimeDetail(source, id); if (anime.isAdult && !(await hasAdultContentAccess(security.userId))) return NextResponse.json({ error: "你沒有成人內容存取權。" }, { status: 403 }); return NextResponse.json({ anime }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "找不到動漫資料，請稍後再試。" }, { status: 404 }); }
}
