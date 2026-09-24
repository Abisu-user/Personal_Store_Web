import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDesktopDashboardData, searchDesktopDashboard } from "@/lib/dashboard/desktop-data";
import type { DashboardKind } from "@/lib/dashboard/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const client = await createClient();
    const [{ data: userData, error: userError }, { data: claimsData, error: claimsError }] = await Promise.all([
      client.auth.getUser(), client.auth.getClaims(),
    ]);
    const user = userData.user;
    const claims = claimsData?.claims;
    if (userError || claimsError || !user || !claims || user.id !== claims.sub || !claims.session_id) {
      return NextResponse.json({ error: "請重新登入後再試。" }, { status: 401 });
    }
    if (user.factors?.some((factor) => factor.factor_type === "totp" && factor.status === "verified") && claims.aal !== "aal2") {
      return NextResponse.json({ error: "請先完成雙因素驗證。" }, { status: 403 });
    }
    const params = new URL(request.url).searchParams;
    if (params.has("q")) {
      const kind = params.get("kind") ?? "all";
      const valid = ["all", "bookmark", "note", "anime", "code", "photo", "file"];
      if (!valid.includes(kind)) return NextResponse.json({ error: "無效的搜尋類型。" }, { status: 400 });
      return NextResponse.json({ items: await searchDesktopDashboard(user.id, params.get("q") ?? "", kind as DashboardKind | "all") }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json(await getDesktopDashboardData(user.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[dashboard:desktop] failed", error);
    return NextResponse.json({ error: "目前無法取得首頁資料，請稍後重試。" }, { status: 503 });
  }
}

const openSchema = z.object({ id: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const client = await createClient();
    const [{ data: userData, error: userError }, { data: claimsData, error: claimsError }] = await Promise.all([
      client.auth.getUser(), client.auth.getClaims(),
    ]);
    const user = userData.user;
    const claims = claimsData?.claims;
    if (userError || claimsError || !user || !claims || user.id !== claims.sub || !claims.session_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.factors?.some((factor) => factor.factor_type === "totp" && factor.status === "verified") && claims.aal !== "aal2") return NextResponse.json({ error: "MFA required" }, { status: 403 });
    const parsed = openSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const { error } = await createAdminClient().from("entries")
      .update({ last_opened_at: new Date().toISOString() })
      .eq("id", parsed.data.id).eq("owner_id", user.id)
      .in("kind", ["note", "code", "photo", "file"])
      .eq("security_level", "standard").eq("requires_item_password", false)
      .is("deleted_at", null);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.warn("[dashboard:desktop] record open failed", error);
    return NextResponse.json({ error: "Unable to record activity" }, { status: 503 });
  }
}
