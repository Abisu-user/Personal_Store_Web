import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { getAnimePreferences } from "@/lib/anime/data";
import { createAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
const schema = z.object({ name: z.string().trim().min(1).max(50), color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), scope: z.enum(["standard", "adult"]).default("standard") });
export async function POST(request: NextRequest) { const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "請輸入有效的類別名稱。" }, { status: 400 }); try { if (parsed.data.scope === "adult" && !(await getAnimePreferences(context.userId)).adultModeEnabled) return NextResponse.json({ error: "請先啟用成人內容模式。" }, { status: 403 }); const { data, error } = await createAdminClient().from("anime_tags").upsert({ user_id: context.userId, name: parsed.data.name, color: parsed.data.color ?? null, scope: parsed.data.scope }, { onConflict: "user_id,scope,name" }).select("id,name,color").single(); if (error) throw error; return NextResponse.json({ tag: data }, { status: 201 }); } catch { return NextResponse.json({ error: "無法儲存類別。" }, { status: 503 }); } }
