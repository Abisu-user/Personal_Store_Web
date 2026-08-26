import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { runVocabularyAssistant } from "@/lib/vocabulary/ai-assistant";

export const dynamic = "force-dynamic";
const schema = z.object({ action: z.enum(["explain", "compare", "translate", "autocomplete"]), language: z.enum(["ja", "en", "auto"]).default("auto"), prompt: z.string().trim().min(1).max(2000) });

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請輸入要詢問的內容。" }, { status: 400 });
  try {
    return NextResponse.json(await runVocabularyAssistant(context.userId, parsed.data.action, parsed.data.language, parsed.data.prompt), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI_UNKNOWN";
    console.error("[vocabulary.assistant] failed", { action: parsed.data.action, language: parsed.data.language, promptLength: parsed.data.prompt.length, message });
    if (message === "AI_NOT_CONFIGURED") return NextResponse.json({ error: "AI 單字助手尚未設定，仍可使用字典查詢。" }, { status: 503 });
    if (message === "AI_UPSTREAM_429") return NextResponse.json({ error: "AI 查詢太頻繁，請稍後再試。" }, { status: 429 });
    if (message === "AI_UPSTREAM_401" || message === "AI_UPSTREAM_403") return NextResponse.json({ error: "AI 單字助手設定無法驗證，請稍後再試。" }, { status: 503 });
    return NextResponse.json({ error: "AI 單字助手目前無法使用，仍可以使用字典查詢。" }, { status: 503 });
  }
}
