import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { OTP_EXPIRES_SECONDS, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/auth/otp-policy";
import { OtpFlowError, resendOtpFlow, setFlowCookie } from "@/lib/auth/otp-service";

export const dynamic = "force-dynamic";

const schema = z.object({ purpose: z.enum(["email_verification", "password_reset"]) });

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "驗證流程不正確。" }, { status: 400 });
  try {
    const flow = await resendOtpFlow(request, parsed.data.purpose);
    const response = NextResponse.json({
      success: true,
      expiresIn: OTP_EXPIRES_SECONDS,
      retryAfter: OTP_RESEND_COOLDOWN_SECONDS,
    }, { headers: { "Cache-Control": "private, no-store" } });
    setFlowCookie(response, parsed.data.purpose, flow.id);
    return response;
  } catch (cause) {
    const status = cause instanceof OtpFlowError ? cause.status : 503;
    const retryAfter = cause instanceof OtpFlowError ? cause.retryAfter : undefined;
    return NextResponse.json(
      { error: cause instanceof OtpFlowError ? cause.message : "目前無法重新寄送驗證碼。", ...(retryAfter ? { retryAfter } : {}) },
      { status, headers: { "Cache-Control": "private, no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } },
    );
  }
}
