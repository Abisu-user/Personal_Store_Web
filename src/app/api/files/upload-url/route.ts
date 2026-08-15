import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createFileUploadTicket } from "@/lib/security/file-upload-ticket";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

const uploadSchema = z.object({ originalFilename: z.string().trim().min(1).max(255).refine((value) => !/[\\/\u0000-\u001f]/.test(value)), mimeType: z.string().trim().min(1).max(150), byteSize: z.number().int().positive().max(52_428_800), sha256: z.string().regex(/^[a-f0-9]{64}$/i) });

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "檔案資訊無效，單一檔案上限為 50 MB。" }, { status: 400 });
  try {
    const storagePath = `${context.userId}/${randomUUID()}`;
    const { data, error } = await createAdminClient().storage.from("vault-files").createSignedUploadUrl(storagePath);
    if (error || !data) throw error;
    const ticket = createFileUploadTicket({ ownerId: context.userId, storagePath, originalFilename: parsed.data.originalFilename, mimeType: parsed.data.mimeType, byteSize: parsed.data.byteSize, sha256: parsed.data.sha256.toLowerCase(), expiresAt: Date.now() + 10 * 60 * 1000 });
    return NextResponse.json({ storagePath, token: data.token, ticket }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "暫時無法準備上傳。" }, { status: 503 }); }
}
