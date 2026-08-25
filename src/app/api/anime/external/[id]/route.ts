import { NextRequest, NextResponse } from "next/server";
import { getAnimeDetail } from "@/lib/anime/jikan-service";
import { getSecurityContext } from "@/lib/security/activity";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: RouteContext<"/api/anime/external/[id]">) {
  if (!(await getSecurityContext())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const source = request.nextUrl.searchParams.get("source") === "anilist" ? "anilist" : "jikan";
  try { return NextResponse.json({ anime: await getAnimeDetail(source, id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "找不到動漫資料，請稍後再試。" }, { status: 404 }); }
}
