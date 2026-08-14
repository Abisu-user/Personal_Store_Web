import "server-only";

import { createHmac } from "crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type SecurityContext = { userId: string; sessionId: string; userAgent: string; ipHash: string | null };

export async function getSecurityContext(): Promise<SecurityContext | null> {
  const supabase = await createClient();
  const [{ data: userData, error: userError }, { data: claimsData, error: claimsError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getClaims(),
  ]);
  const claims = claimsData?.claims;
  if (userError || claimsError || !userData.user || !claims || userData.user.id !== claims.sub || !claims.session_id) return null;

  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 500) ?? "Unknown device";
  const rawIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY;
  const ipHash = rawIp && secret ? `\\x${createHmac("sha256", secret).update(rawIp).digest("hex")}` : null;
  return { userId: userData.user.id, sessionId: claims.session_id, userAgent, ipHash };
}

export function deviceLabel(userAgent: string) {
  const platform = /iPhone|iPad/i.test(userAgent) ? "iPhone / iPad" : /Android/i.test(userAgent) ? "Android" : /Macintosh/i.test(userAgent) ? "Mac" : /Windows/i.test(userAgent) ? "Windows" : /Linux/i.test(userAgent) ? "Linux" : "Unknown device";
  const browser = /Edg\//i.test(userAgent) ? "Edge" : /Firefox\//i.test(userAgent) ? "Firefox" : /Chrome\//i.test(userAgent) ? "Chrome" : /Safari\//i.test(userAgent) ? "Safari" : "Browser";
  return `${platform} · ${browser}`;
}
