import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { passwordError } from "@/components/auth/password-policy";
import { OTP_EXPIRES_SECONDS, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/auth/otp-policy";
import { OtpFlowError, setFlowCookie, startOtpFlow } from "@/lib/auth/otp-service";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("purpose", [
  z.object({
    purpose: z.literal("email_verification"),
    email: z.string().trim().email().max(320),
    password: z.string().max(256),
    displayName: z.string().trim().min(1).max(80),
  }),
  z.object({
    purpose: z.literal("password_reset"),
    email: z.string().trim().email().max(320),
  }),
]);

function fail(error: string, status: number, retryAfter?: number) {
  return NextResponse.json(
    { error, ...(retryAfter ? { retryAfter } : {}) },
    { status, headers: { "Cache-Control": "private, no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } },
  );
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("請輸入有效的帳號資料。", 400);
  if (parsed.data.purpose === "email_verification") {
    const validationError = passwordError(parsed.data.password);
    if (validationError) return fail(validationError, 400);
  }

  try {
    const flow = await startOtpFlow(
      request,
      parsed.data.email,
      parsed.data.purpose,
      parsed.data.purpose === "email_verification"
        ? { password: parsed.data.password, displayName: parsed.data.displayName }
        : undefined,
    );
    const response = NextResponse.json({
      success: true,
      expiresIn: OTP_EXPIRES_SECONDS,
      retryAfter: OTP_RESEND_COOLDOWN_SECONDS,
    }, { headers: { "Cache-Control": "private, no-store" } });
    setFlowCookie(response, parsed.data.purpose, flow.id);
    return response;
  } catch (cause) {
    if (cause instanceof OtpFlowError) return fail(cause.message, cause.status, cause.retryAfter);
    return fail("目前無法開始驗證，請稍後再試。", 503);
  }
}
