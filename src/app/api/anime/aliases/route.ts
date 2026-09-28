import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addUserAdultAlias, adultAliasesForIds, removeUserAdultAlias } from "@/lib/anime/adult-alias-store";
import { getVerifiedAdultAnimeByIds } from "@/lib/anime/anilist-catalogue";
import { getSecurityContext } from "@/lib/security/activity";
import { hasUnlockedAdultAccess } from "@/lib/security/adult-unlock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const idSchema = z.coerce.number().int().positive();
const addSchema = z.object({ anilistId: idSchema, alias: z.string().trim().min(1).max(500) }).strict();
const deleteSchema = z.object({ id: z.string().uuid() }).strict();
const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

async function access(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return { userId: null, status: 401 };
  if (!(await hasUnlockedAdultAccess(context, request.headers.get("x-adult-unlock"))))
    return { userId: null, status: 403 };
  return { userId: context.userId, status: 200 };
}

export async function GET(request: NextRequest) {
  const actor = await access(request);
  if (!actor.userId) return fail("請先完成成人區驗證。", actor.status);
  const parsed = idSchema.safeParse(request.nextUrl.searchParams.get("anilistId"));
  if (!parsed.success) return fail("AniList ID 不正確。", 400);
  try {
    const aliases = await adultAliasesForIds(actor.userId, [parsed.data]);
    return NextResponse.json({ aliases: aliases.get(parsed.data) ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("目前無法讀取搜尋別名。", 503); }
}

export async function POST(request: NextRequest) {
  const actor = await access(request);
  if (!actor.userId) return fail("請先完成成人區驗證。", actor.status);
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("請輸入有效的搜尋別名。", 400);
  try {
    const verified = await getVerifiedAdultAnimeByIds([parsed.data.anilistId]);
    if (!verified.some((anime) => Number(anime.id) === parsed.data.anilistId))
      return fail("找不到符合成人區規則的 AniList 作品。", 400);
    const existing = await adultAliasesForIds(actor.userId, [parsed.data.anilistId]);
    if ((existing.get(parsed.data.anilistId) ?? []).filter((alias) => alias.scope === "user").length >= 30)
      return fail("這部作品的自訂別名已達上限。", 400);
    await addUserAdultAlias(actor.userId, parsed.data.anilistId, parsed.data.alias);
    const aliases = await adultAliasesForIds(actor.userId, [parsed.data.anilistId]);
    return NextResponse.json({ aliases: aliases.get(parsed.data.anilistId) ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("目前無法儲存搜尋別名。", 503); }
}

export async function DELETE(request: NextRequest) {
  const actor = await access(request);
  if (!actor.userId) return fail("請先完成成人區驗證。", actor.status);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("搜尋別名不存在。", 400);
  try {
    const removed = await removeUserAdultAlias(actor.userId, parsed.data.id);
    return removed ? NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }) : fail("只能移除自己的搜尋別名。", 404);
  } catch { return fail("目前無法移除搜尋別名。", 503); }
}
