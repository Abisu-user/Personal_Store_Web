import { NextResponse } from "next/server";
import { getAnimeDetail } from "@/lib/anime/jikan-service";
import { getSecurityContext } from "@/lib/security/activity";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: RouteContext<"/api/anime/external/[id]">) {
  if (!(await getSecurityContext())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try { return NextResponse.json({ anime: await getAnimeDetail("jikan", id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "找不到動漫資料，請稍後再試。" }, { status: 404 }); }
}
