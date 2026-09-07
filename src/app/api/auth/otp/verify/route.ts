import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { OTP_LENGTH } from "@/lib/auth/otp-policy";
import {
  OtpFlowError,
  clearFlowCookie,
  setResetAuthorizationCookie,
  verifyOtpFlow,
} from "@/lib/auth/otp-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  purpose: z.enum(["email_verification", "password_reset"]),
  code: z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`)),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請輸入 6 位數驗證碼。" }, { status: 400 });
  try {
    const verified = await verifyOtpFlow(request, parsed.data.purpose, parsed.data.code);
    const response = NextResponse.json(
      { success: true, destination: verified.destination },
      { headers: { "Cache-Control": "private, no-store" } },
    );
    clearFlowCookie(response, parsed.data.purpose);
    if (typeof verified.resetToken === "string") setResetAuthorizationCookie(response, verified.resetToken);
    return response;
  } catch (cause) {
    const status = cause instanceof OtpFlowError ? cause.status : 503;
    return NextResponse.json(
      { error: cause instanceof OtpFlowError ? cause.message : "目前無法驗證，請稍後再試。" },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
