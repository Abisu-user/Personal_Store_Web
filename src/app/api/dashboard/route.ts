import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

export async function GET() {
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
    if (user.factors?.some(factor => factor.factor_type === "totp" && factor.status === "verified") && claims.aal !== "aal2") {
      return NextResponse.json({ error: "請先完成雙因素驗證。" }, { status: 403 });
    }
    return NextResponse.json(await getDashboardData(user.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "目前無法取得首頁摘要，請稍後重試。" }, { status: 503 });
  }
}
