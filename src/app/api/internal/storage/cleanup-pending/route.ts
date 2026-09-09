import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { cleanupPendingStorageObjects } from "@/lib/storage/pending-cleanup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!expected || expected.length < 32 || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length
    && timingSafeEqual(expectedBytes, providedBytes);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await cleanupPendingStorageObjects({ limit: 25 });
    return NextResponse.json(report, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "暫時無法清理未完成的上傳。" },
      { status: 503 },
    );
  }
}
