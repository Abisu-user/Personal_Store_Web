import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { permanentlyDeleteAccount } from "@/lib/security/account-deletion";
import { getSecurityContext } from "@/lib/security/activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const deleteSchema = z.object({ confirmation: z.literal("DELETE") }).strict();

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "請完整輸入 DELETE 才能刪除帳號。" }, { status: 400 });
  }

  try {
    await permanentlyDeleteAccount(context.userId);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store", "Clear-Site-Data": '"cache", "cookies", "storage"' } },
    );
  } catch (cause) {
    console.error("[account-deletion] unable to delete account", {
      userId: context.userId,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return NextResponse.json(
      { error: "目前無法完整刪除帳號，帳號尚未刪除。請稍後再試。" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
