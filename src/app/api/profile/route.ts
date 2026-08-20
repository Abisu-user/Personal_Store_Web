import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { profileAvatars } from "@/lib/profile/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  action: z.literal("profile"),
  displayName: z.string().trim().max(80),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{2,31}$/),
  avatar: z.enum(profileAvatars),
  email: z.string().trim().toLowerCase().email().max(320),
});
const passwordSchema = z.object({
  action: z.literal("password"),
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(10).max(256),
  confirmPassword: z.string(),
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: "新密碼與確認密碼不一致。",
  path: ["confirmPassword"],
});

const requestSchema = z.discriminatedUnion("action", [profileSchema, passwordSchema]);

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "請檢查輸入內容。", 400);

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user || userData.user.id !== context.userId) return jsonError("Unauthorized", 401);

  if (parsed.data.action === "password") {
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: userData.user.email ?? "",
      password: parsed.data.currentPassword,
    });
    if (verifyError) return jsonError("目前密碼不正確。", 400);

    const { error: passwordError } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
    if (passwordError) return jsonError(passwordError.message, 400);
    return NextResponse.json({ message: "密碼已更新。" });
  }

  if (parsed.data.email !== (userData.user.email ?? "").toLowerCase()) {
    const { error: emailError } = await supabase.auth.updateUser({ email: parsed.data.email });
    if (emailError) return jsonError(emailError.message, 400);
  }

  const { error: profileError } = await createAdminClient().from("profiles").update({
    display_name: parsed.data.displayName || null,
    username: parsed.data.username,
    avatar_path: parsed.data.avatar,
  }).eq("id", context.userId);
  if (profileError) {
    if (profileError.code === "23505") return jsonError("此使用者名稱已被使用。", 409);
    return jsonError("無法儲存個人資料。", 503);
  }

  return NextResponse.json({
    message: parsed.data.email !== (userData.user.email ?? "").toLowerCase()
      ? "個人資料已儲存；請至新信箱完成驗證。"
      : "個人資料已儲存。",
  });
}
