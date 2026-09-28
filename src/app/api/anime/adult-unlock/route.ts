import { NextRequest, NextResponse } from "next/server";
import { getAnimePreferences } from "@/lib/anime/data";
import { getSecurityContext } from "@/lib/security/activity";
import { hasAdultContentAccess } from "@/lib/security/adult-content";
import { completedPasskeyChallenge, issueAdultUnlock, issuePasskeyChallenge } from "@/lib/security/adult-unlock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [permission, preferences] = await Promise.all([
    hasAdultContentAccess(context.userId), getAnimePreferences(context.userId),
  ]);
  if (!permission || !preferences.adultModeEnabled)
    return NextResponse.json({ error: "成人內容模式尚未啟用或沒有存取權。" }, { status: 403 });
  const body = await request.json().catch(() => null) as { action?: unknown; challenge?: unknown } | null;
  try {
    if (body?.action === "none" && preferences.adultAccessMode === "none")
      return NextResponse.json({ token: issueAdultUnlock(context) }, { headers: { "Cache-Control": "no-store" } });
    if (body?.action === "begin-passkey" && preferences.adultAccessMode === "passkey")
      return NextResponse.json({ challenge: issuePasskeyChallenge(context) }, { headers: { "Cache-Control": "no-store" } });
    if (body?.action === "complete-passkey" && preferences.adultAccessMode === "passkey" &&
      typeof body.challenge === "string" && completedPasskeyChallenge(context, body.challenge))
      return NextResponse.json({ token: issueAdultUnlock(context) }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "成人區驗證尚未完成。" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "目前無法建立成人區驗證狀態。" }, { status: 503 });
  }
}
