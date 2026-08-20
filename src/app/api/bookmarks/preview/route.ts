import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getLinkPreview } from "@/lib/bookmarks/preview";
import { getSecurityContext } from "@/lib/security/activity";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ url: z.string().trim().min(1).max(2000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請輸入有效網址。" }, { status: 400 });
  try {
    const preview = await getLinkPreview(parsed.data.url);
    return NextResponse.json(preview, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "網址無法取得預覽。" }, { status: 400 }); }
}
