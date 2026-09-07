import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { isAdultContentAdmin } from "@/lib/security/adult-content";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  userId: z.string().uuid(),
  adultContentAccess: z.boolean(),
});

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });

async function requireAdmin() {
  const context = await getSecurityContext();
  if (!context) return { response: fail("Unauthorized", 401) } as const;
  if (!(await isAdultContentAdmin(context.userId))) {
    return { response: fail("你沒有管理成人功能權限。", 403) } as const;
  }
  return { context } as const;
}

export async function GET(request: NextRequest) {
  const authorization = await requireAdmin();
  if ("response" in authorization) return authorization.response;
  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  try {
    const { data, error } = await createAdminClient().rpc(
      "search_adult_permission_accounts",
      { search_term: query, result_limit: 20 },
    );
    if (error) throw error;
    const accounts = (data ?? []).map((account: Record<string, unknown>) => ({
      userId: String(account.user_id),
      email: String(account.email ?? ""),
      username: typeof account.username === "string" ? account.username : null,
      displayName: typeof account.display_name === "string" ? account.display_name : null,
      adultContentAccess: account.adult_content_access === true,
      adultContentAdmin: account.adult_content_admin === true,
    }));
    return NextResponse.json({ accounts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return fail("目前無法搜尋帳戶。", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const authorization = await requireAdmin();
  if ("response" in authorization) return authorization.response;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("請選擇有效的帳戶與權限。", 400);

  try {
    const admin = createAdminClient();
    const { data: target, error: targetError } = await admin
      .from("adult_content_permissions")
      .select("adult_content_admin")
      .eq("user_id", parsed.data.userId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (target?.adult_content_admin && !parsed.data.adultContentAccess) {
      return fail("成人功能管理員必須保留成人內容存取權。", 409);
    }

    const { error } = await admin.from("adult_content_permissions").upsert(
      {
        user_id: parsed.data.userId,
        adult_content_access: parsed.data.adultContentAccess,
        adult_content_admin: target?.adult_content_admin === true,
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    await admin.from("audit_logs").insert({
      owner_id: authorization.context.userId,
      action: parsed.data.adultContentAccess
        ? "adult_content_access_granted"
        : "adult_content_access_revoked",
      metadata: { target_user_id: parsed.data.userId },
      ip_hash: authorization.context.ipHash,
    });
    return NextResponse.json(
      { ok: true, adultContentAccess: parsed.data.adultContentAccess },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return fail("無法更新成人功能權限。", 503);
  }
}
