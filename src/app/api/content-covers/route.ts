import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

const entrySchema = z.string().uuid();

export async function GET(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("entry");
  if (!id || !entrySchema.safeParse(id).success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("entries").select("cover_image_path").eq("id", id).eq("owner_id", context.userId).maybeSingle();
  if (error || !data?.cover_image_path) return NextResponse.json({ error: "找不到封面。" }, { status: 404 });
  // Stream the private object from the server instead of redirecting the browser
  // to a signed Storage URL. This keeps the image same-origin and avoids an
  // expired/cross-origin signed URL being blocked by browser policy.
  const { data: object, error: objectError } = await admin.storage.from("content-covers").download(data.cover_image_path);
  if (objectError || !object) return NextResponse.json({ error: "暫時無法讀取封面。" }, { status: 503 });
  return new NextResponse(object, { headers: { "Content-Type": object.type || "image/webp", "Cache-Control": "private, no-store" } });
}
