import { NextRequest, NextResponse } from "next/server";

import { isOtpPurpose } from "@/lib/auth/otp-policy";
import { publicFlowStatus, readFlow } from "@/lib/auth/otp-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const purpose = request.nextUrl.searchParams.get("purpose");
  if (!isOtpPurpose(purpose)) return NextResponse.json({ active: false }, { status: 400 });
  const flow = await readFlow(request, purpose);
  return NextResponse.json(publicFlowStatus(flow), { headers: { "Cache-Control": "private, no-store" } });
}
