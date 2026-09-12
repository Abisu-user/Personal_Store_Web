import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

const id = z.string().uuid();
const name = z.string().trim().min(1, "請輸入分類名稱。").max(50, "分類名稱過長。");
const createSchema = z.object({ name });
const saveSchema = z.object({ categories: z.array(z.object({ id, name })).max(200) });
const deleteSchema = z.object({ id });

type QueryError = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
function logQueryError(scope: string, error: QueryError | null) {
  if (!error) return;
  console.error("[api:ktv-categories] " + scope + " failed", {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}
function privateJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
function jsonError(error: string, status: number) { return privateJson({ error }, status); }

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "請輸入分類名稱。", 400);
  const admin = createAdminClient();
  const { data: last, error: lastError } = await admin.from("ktv_categories").select("sort_order").eq("user_id", context.userId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  logQueryError("last sort order select", lastError);
  if (lastError) return jsonError("無法新增分類。", 503);
  const { data, error } = await admin.from("ktv_categories").insert({
    user_id: context.userId,
    name: parsed.data.name,
    sort_order: (last?.sort_order ?? -1) + 1,
  }).select("id,name,sort_order").single();
  logQueryError("category insert", error);
  if (error) return jsonError(error.code === "23505" ? "已經有同名分類。" : "無法新增分類。", error.code === "23505" ? 409 : 503);
  return privateJson({ category: { id: data.id, name: data.name, sortOrder: data.sort_order } }, 201);
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "請檢查分類資料。", 400);
  const normalizedNames = parsed.data.categories.map((category) => category.name.toLocaleLowerCase());
  if (new Set(normalizedNames).size !== normalizedNames.length) return jsonError("分類名稱不能重複。", 400);
  const admin = createAdminClient();
  const ids = parsed.data.categories.map((category) => category.id);
  const { data: owned, error: ownedError } = ids.length
    ? await admin.from("ktv_categories").select("id").eq("user_id", context.userId).in("id", ids)
    : { data: [], error: null };
  logQueryError("category ownership select", ownedError);
  if (ownedError) return jsonError("無法儲存分類。", 503);
  if ((owned ?? []).length !== ids.length) return jsonError("分類資料已變更，請重新整理。", 409);
  const results = await Promise.all(parsed.data.categories.map((category, sortOrder) =>
    admin.from("ktv_categories").update({ name: category.name, sort_order: sortOrder }).eq("id", category.id).eq("user_id", context.userId),
  ));
  const failed = results.find((result) => result.error)?.error ?? null;
  logQueryError("category batch update", failed);
  if (failed) return jsonError(failed.code === "23505" ? "分類名稱不能重複。" : "無法儲存分類。", failed.code === "23505" ? 409 : 503);
  return privateJson({ categories: parsed.data.categories.map((category, sortOrder) => ({ ...category, sortOrder })) });
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("找不到要刪除的分類。", 400);
  const { data, error } = await createAdminClient().from("ktv_categories").delete().eq("id", parsed.data.id).eq("user_id", context.userId).select("id").maybeSingle();
  logQueryError("category delete", error);
  if (error) return jsonError("無法刪除分類。", 503);
  if (!data) return jsonError("找不到這個分類。", 404);
  return privateJson({ ok: true });
}
