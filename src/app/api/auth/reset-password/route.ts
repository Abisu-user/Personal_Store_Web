import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { passwordError } from "@/components/auth/password-policy";
import {
  OtpFlowError,
  clearResetAuthorizationCookie,
  consumePasswordResetAuthorization,
} from "@/lib/auth/otp-service";

export const dynamic = "force-dynamic";

const schema = z.object({ password: z.string().max(256) });

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請輸入有效的新密碼。" }, { status: 400 });
  const validationError = passwordError(parsed.data.password);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  try {
    await consumePasswordResetAuthorization(request, parsed.data.password);
    const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
    clearResetAuthorizationCookie(response);
    return response;
  } catch (cause) {
    const status = cause instanceof OtpFlowError ? cause.status : 503;
    return NextResponse.json(
      { error: cause instanceof OtpFlowError ? cause.message : "目前無法更新密碼，請稍後再試。" },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
