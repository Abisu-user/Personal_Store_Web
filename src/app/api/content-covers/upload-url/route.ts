import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createCoverUploadTicket } from "@/lib/security/cover-upload-ticket";
import { createAdminClient } from "@/lib/supabase/admin";

const uploadSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().positive().max(5_242_880),
});

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "封面需為 JPG、PNG 或 WebP，且不得超過 5 MB。" }, { status: 400 });
  try {
    const storagePath = `${context.userId}/covers/${randomUUID()}`;
    const { data, error } = await createAdminClient().storage.from("content-covers").createSignedUploadUrl(storagePath);
    if (error || !data) throw error;
    return NextResponse.json({
      storagePath,
      token: data.token,
      ticket: createCoverUploadTicket({ ownerId: context.userId, storagePath, mimeType: parsed.data.mimeType, byteSize: parsed.data.byteSize, expiresAt: Date.now() + 10 * 60 * 1000 }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "暫時無法準備封面上傳。" }, { status: 503 }); }
}
